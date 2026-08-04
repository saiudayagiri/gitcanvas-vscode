import * as path from "path";
import { GitService, type RawCommit, type RawWorkingFile } from "./gitService";
import { assignLanes } from "./laneAssignment";
import { mergeBase, commitsBetween } from "./gitGraph";
import type { Author, Branch, Commit, FileStatus, RepoSnapshot, WorkingFile } from "./protocol";

/** Shared with panel.ts's lightweight status-only refresh, so a plain working-tree edit
 * doesn't need the full buildSnapshot() (commit log, branches, tags, stashes...) just to update
 * two file lists. */
export function toWorkingFile(f: RawWorkingFile): WorkingFile {
  return {
    path: f.path,
    oldPath: f.oldPath,
    state: f.state,
    insertions: f.insertions,
    deletions: f.deletions,
    ...(f.state === "staged" ? { stagedInsertions: f.insertions, stagedDeletions: f.deletions } : {}),
  };
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

function authorKey(name: string, email: string): string {
  return email || name;
}

function pickDefaultBranchName(branchNames: string[]): string | null {
  if (branchNames.includes("main")) return "main";
  if (branchNames.includes("master")) return "master";
  return branchNames[0] ?? null;
}

export async function buildSnapshot(repoRoot: string): Promise<RepoSnapshot> {
  const git = new GitService(repoRoot);
  const [logCommits, rawBranches, rawStatus, rawStashes, rawTags, rawRemotes, headHash, userConfig, globalConfig] = await Promise.all([
    git.getLog(),
    git.getBranches(),
    git.getStatus(),
    git.getStashes(),
    git.getTags(),
    git.getRemotes(),
    git.getHeadHash(),
    git.getUserConfig(),
    git.getGlobalConfig(),
  ]);

  // getLog() only returns the most recent N commits repo-wide — a branch with quieter recent
  // history can easily have a head commit older than that cutoff. Every branch's headHash gets
  // handed straight to the webview and resolved via getCommit(), so any that fell outside the
  // window get backfilled here (walking each one's own ancestry, not just fetching the lone
  // commit) so it's both resolvable AND visually connected in the graph rather than a
  // disconnected floating dot.
  const knownHashes = new Set(logCommits.map((c) => c.hash));
  const missingHeadHashes = [...new Set(rawBranches.map((b) => b.headHash).filter((h) => h && !knownHashes.has(h)))];
  const backfilledCommits = await git.getAncestryBackfill(missingHeadHashes);
  const rawCommits = [...logCommits, ...backfilledCommits.filter((c) => !knownHashes.has(c.hash))];

  const byHash = new Map<string, RawCommit>(rawCommits.map((c) => [c.hash, c]));

  const localBranchNames = rawBranches.filter((b) => !b.isRemote).map((b) => b.name);
  const defaultBranchName = pickDefaultBranchName(localBranchNames);
  const currentBranch = rawBranches.find((b) => b.isCurrent && !b.isRemote);

  // Which branch keeps the "straight" lane through a fork is otherwise decided by an arbitrary
  // race (whichever branch's tip commit happens to be newest claims the low lane first), so the
  // same two branches could render with their roles flipped, commit to commit, for no visible
  // reason. Seeding lanes for the branch you're on, then the repo's default branch, then everyone
  // else (in that fixed priority) before the chronological scan begins means whichever one you'd
  // expect to "keep going straight" always does, and every other branch consistently forks off
  // it with its own new lane instead.
  const branchPriorityOrder = [currentBranch?.name, defaultBranchName, ...localBranchNames].filter(
    (name, i, arr): name is string => !!name && arr.indexOf(name) === i
  );
  const priorityHeadHashes = branchPriorityOrder
    .map((name) => rawBranches.find((b) => b.name === name && !b.isRemote)?.headHash)
    .filter((h): h is string => !!h);

  const laneOf = assignLanes(rawCommits, priorityHeadHashes);
  const tagNames = new Set(rawTags.map((t) => t.name));

  // authors, deduped by email
  const authors: Record<string, Author> = {};
  for (const c of rawCommits) {
    const key = authorKey(c.authorName, c.authorEmail);
    if (!authors[key]) authors[key] = { id: key, name: c.authorName, email: c.authorEmail, colorSeed: key };
  }
  const currentUserKey = authorKey(userConfig.name, userConfig.email);
  const currentUser = authors[currentUserKey] ?? { id: currentUserKey, name: userConfig.name, email: userConfig.email, colorSeed: currentUserKey };
  authors[currentUserKey] = currentUser;

  const defaultBranch = rawBranches.find((b) => b.name === defaultBranchName);

  // which lane "owns" each lane number, for the commit.branch label (best-effort, not load-bearing for layout)
  const laneOwnerName = new Map<number, string>();
  for (const b of rawBranches) {
    const lane = laneOf.get(b.headHash);
    if (lane !== undefined && !laneOwnerName.has(lane)) laneOwnerName.set(lane, b.name);
  }

  const commits: Commit[] = rawCommits.map((c) => {
    const author = authors[authorKey(c.authorName, c.authorEmail)];
    const committer = authors[authorKey(c.committerName, c.committerEmail)] ?? author;
    const lane = laneOf.get(c.hash) ?? 0;
    const insertions = c.files.reduce((sum, f) => sum + f.insertions, 0);
    const deletions = c.files.reduce((sum, f) => sum + f.deletions, 0);
    return {
      hash: c.hash,
      shortHash: shortHash(c.hash),
      parents: c.parents,
      author,
      committer,
      authoredAt: c.authoredAt,
      committedAt: c.committedAt,
      subject: c.subject,
      body: c.body?.trim() || undefined,
      branch: laneOwnerName.get(lane) ?? "",
      lane,
      refs: c.refs.filter((r) => tagNames.has(r)),
      isMerge: c.parents.length > 1,
      gpgSigned: c.signStatus === "G" || c.signStatus === "U",
      files: c.files.map((f) => ({
        path: f.path,
        oldPath: f.oldPath,
        status: f.status as FileStatus,
        insertions: f.insertions,
        deletions: f.deletions,
      })),
      stats: { insertions, deletions },
    };
  });

  const branches: Branch[] = rawBranches.map((b) => {
    const forkedFromHash =
      defaultBranch && b.name !== defaultBranch.name ? mergeBase(b.headHash, defaultBranch.headHash, byHash) ?? undefined : undefined;
    const authorIds = new Set<string>();
    for (const c of commitsBetween(forkedFromHash ?? null, b.headHash, byHash)) {
      authorIds.add(authorKey(c.authorName, c.authorEmail));
    }
    const color: Branch["color"] = b.isRemote ? "remote" : b.name === defaultBranchName ? "history" : b.isCurrent ? "branch" : "commit";
    const daysSinceActivity = (Date.now() - new Date(b.lastActivity).getTime()) / 86_400_000;

    return {
      name: b.name,
      kind: b.isRemote ? "remote" : "local",
      headHash: b.headHash,
      isCurrent: b.isCurrent,
      upstream: b.upstream,
      ahead: b.ahead,
      behind: b.behind,
      lastActivity: b.lastActivity,
      color,
      lane: laneOf.get(b.headHash) ?? -1,
      stale: daysSinceActivity > 60,
      protected: b.name === "main" || b.name === "master",
      authorIds: [...authorIds],
      forkedFromHash,
    };
  });

  const workingFiles = rawStatus.filter((f) => f.state !== "staged").map(toWorkingFile);
  const stagedFiles = rawStatus.filter((f) => f.state === "staged").map(toWorkingFile);

  return {
    repoName: path.basename(repoRoot),
    repoPath: repoRoot,
    commits,
    branches,
    workingFiles,
    stagedFiles,
    stashes: rawStashes.map((s) => ({ id: `stash-${s.index}`, message: s.message, branchName: s.branch, createdAt: s.createdAt })),
    tags: rawTags,
    remotes: rawRemotes,
    currentBranchName: currentBranch?.name ?? null,
    headHash: headHash ?? "",
    authors,
    currentUser,
    globalConfig,
  };
}
