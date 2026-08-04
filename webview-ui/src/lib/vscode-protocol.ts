// Mirrors the extension host's src/protocol.ts — kept in sync by hand, see the note there.
import type { Author, Branch, Commit, WorkingFile } from "@/types/git";

export interface StashEntry {
  id: string;
  message: string;
  branchName: string;
  createdAt: string;
}

export interface TagEntry {
  name: string;
  hash: string;
}

export interface RemoteEntry {
  name: string;
  url: string;
}

export interface GlobalGitConfig {
  defaultBranch: string;
  editor: string;
}

export interface RepoSnapshot {
  repoName: string;
  repoPath: string;
  commits: Commit[];
  branches: Branch[];
  workingFiles: WorkingFile[];
  stagedFiles: WorkingFile[];
  stashes: StashEntry[];
  tags: TagEntry[];
  remotes: RemoteEntry[];
  currentBranchName: string | null;
  headHash: string;
  authors: Record<string, Author>;
  currentUser: Author;
  globalConfig: GlobalGitConfig;
}

export type GitCommand =
  | { kind: "stage"; path: string }
  | { kind: "unstage"; path: string }
  | { kind: "stageAll" }
  | { kind: "unstageAll" }
  | { kind: "discard"; path: string; wasUntracked: boolean }
  | { kind: "commit"; message: string; amend: boolean }
  | { kind: "push" }
  | { kind: "fetch" }
  | { kind: "pull" }
  | { kind: "checkoutBranch"; name: string }
  | { kind: "checkoutCommit"; hash: string }
  | { kind: "createBranch"; name: string }
  | { kind: "deleteBranch"; name: string; force: boolean }
  | { kind: "stashPush"; message?: string }
  | { kind: "stashApply"; index: number }
  | { kind: "stashPop"; index: number }
  | { kind: "stashDrop"; index: number }
  | { kind: "createTag"; name: string; hash: string }
  | { kind: "deleteTag"; name: string }
  | { kind: "reset"; hash: string; mode: "soft" | "mixed" | "hard" }
  | { kind: "revert"; hash: string }
  | { kind: "cherryPick"; hash: string }
  | { kind: "merge"; branchName: string }
  | { kind: "rebase"; branchName: string }
  | { kind: "clean" }
  | { kind: "pushForce" }
  | { kind: "addRemote"; name: string; url: string }
  | { kind: "removeRemote"; name: string }
  | { kind: "setConfig"; key: "user.name" | "user.email" | "init.defaultBranch" | "core.editor"; value: string }
  | { kind: "resolveConflictFile"; path: string; resolution: "ours" | "theirs" | "both" | "manual"; content?: string }
  | { kind: "continueConflictOp"; op: ConflictOp }
  | { kind: "abortConflictOp"; op: ConflictOp };

/** merge/revert/cherry-pick are the three write commands that can leave the repo mid-conflict
 * and expose a real per-file resolve/continue/abort flow. Rebase still just auto-aborts. */
export type ConflictOp = "merge" | "revert" | "cherryPick";

export interface ConflictFileRaw {
  path: string;
  oursContent: string;
  theirsContent: string;
  workingContent: string;
}

export interface ReflogRawEntry {
  hash: string;
  selector: string;
  action: string;
  description: string;
  timestamp: number;
}

export interface BlameRawLine {
  lineNo: number;
  content: string;
  hash: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
}

export type DataRequest =
  | { kind: "diff"; hash: string; path: string }
  | { kind: "reflog" }
  | { kind: "blame"; path: string }
  | { kind: "conflicts" };

export type DataResult =
  | { kind: "diff"; diff: string }
  | { kind: "reflog"; entries: ReflogRawEntry[] }
  | { kind: "blame"; lines: BlameRawLine[] }
  | { kind: "conflicts"; op: ConflictOp | null; files: ConflictFileRaw[] };

export type HostMessage =
  | { type: "repoSnapshot"; snapshot: RepoSnapshot }
  | { type: "error"; message: string }
  | { type: "commandResult"; requestId: string; ok: true; output: string; conflict?: ConflictOp }
  | { type: "commandResult"; requestId: string; ok: false; error: string }
  | { type: "dataResult"; requestId: string; ok: true; data: DataResult }
  | { type: "dataResult"; requestId: string; ok: false; error: string }
  /** A cheap, working-tree-only refresh — just the file lists (and stash list, when a
   * stash-affecting command triggered it), applied without the full-app remount a repoSnapshot
   * triggers, so an ordinary edit — or staying on the Staging Area/Stashes pane while
   * staging/stashing — reflects almost instantly instead of bouncing back to Working Directory. */
  | { type: "statusUpdate"; workingFiles: WorkingFile[]; stagedFiles: WorkingFile[]; stashes?: StashEntry[] };

/** Native VS Code commands the webview is allowed to trigger directly — kept as a closed
 * union (not an arbitrary string) so the host never blindly executes whatever command name
 * the webview sends. Both are registered by VS Code's own built-in Git extension and own
 * their entire flow (URL/folder prompts, the eventual window reload) — we just kick them off. */
export type NativeVsCodeCommand = "git.clone" | "git.init";

export type WebviewMessage =
  | { type: "ready" }
  | { type: "requestSnapshot" }
  | { type: "runCommand"; requestId: string; command: GitCommand }
  | { type: "requestData"; requestId: string; request: DataRequest }
  | { type: "runVsCodeCommand"; command: NativeVsCodeCommand }
  /** GUI-native clone: the webview supplies the URL (typed into our own UI, so the whole flow
   * is teachable in place); the host picks the destination via a folder dialog, runs the real
   * `git clone`, replies over the normal commandResult channel, then offers to open the clone. */
  | { type: "cloneRepo"; requestId: string; url: string };
