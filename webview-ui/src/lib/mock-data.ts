import type {
  Author,
  Branch,
  Commit,
  FileChange,
  RemoteInfo,
  RepoHealth,
  RepoState,
  WorkingFile,
} from "@/types/git";
import { makeHash, shortHash } from "./hash";

export const REPO_NAME = "lumen-analytics";

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------
export const authors: Record<string, Author> = {
  maya: { id: "maya", name: "Maya Chen", email: "maya@lumen.dev", colorSeed: "maya-chen" },
  diego: { id: "diego", name: "Diego Alvarez", email: "diego@lumen.dev", colorSeed: "diego-alvarez" },
  priya: { id: "priya", name: "Priya Nathan", email: "priya@lumen.dev", colorSeed: "priya-nathan" },
  sam: { id: "sam", name: "Sam O'Connell", email: "sam@lumen.dev", colorSeed: "sam-oconnell" },
  jordan: { id: "jordan", name: "Jordan Lee", email: "jordan@lumen.dev", colorSeed: "jordan-lee" },
};

const you = authors.maya; // the "current user" driving the prototype

// ---------------------------------------------------------------------------
// Commit DAG — hand-authored for realistic topology:
//   main <-> origin/main have diverged (1 ahead / 1 behind)
//   feature/user-onboarding is the CURRENT branch, unpublished, 4 ahead of main
//   feature/billing-webhooks + fix/safari-scroll-bug are recently merged
//   experiment/vector-search is stale (abandoned ~13 days ago)
// ---------------------------------------------------------------------------

interface CommitSeed {
  id: string; // local reference id, not the hash
  parents: string[]; // ids
  author: Author;
  date: string;
  subject: string;
  body?: string;
  branch: string;
  lane: number;
  files: FileChange[];
  command?: string;
}

function fc(path: string, status: FileChange["status"], ins: number, del: number, oldPath?: string): FileChange {
  return { path, status, insertions: ins, deletions: del, oldPath };
}

const seeds: CommitSeed[] = [
  {
    id: "c1", parents: [], author: authors.maya, date: "2026-06-25T09:12:00Z",
    subject: "chore: bootstrap billing service scaffolding",
    branch: "main", lane: 0,
    files: [fc("src/api/billing.ts", "added", 64, 0), fc("package.json", "modified", 6, 0)],
    command: "git commit",
  },
  {
    id: "c2", parents: ["c1"], author: authors.diego, date: "2026-06-25T14:40:00Z",
    subject: "feat(billing): add Stripe customer sync job",
    branch: "main", lane: 0,
    files: [fc("src/lib/stripe.ts", "added", 88, 0), fc("src/api/billing.ts", "modified", 21, 3)],
    command: "git commit",
  },
  {
    id: "c3", parents: ["c2"], author: authors.priya, date: "2026-06-26T10:05:00Z",
    subject: "feat(dashboard): add revenue chart skeleton",
    branch: "main", lane: 0,
    files: [fc("src/components/charts/RevenueChart.tsx", "added", 112, 0), fc("src/pages/Dashboard.tsx", "modified", 14, 2)],
    command: "git commit",
  },
  {
    id: "c4", parents: ["c3"], author: authors.maya, date: "2026-06-27T16:22:00Z",
    subject: "fix(auth): correct token refresh race condition",
    body: "Two concurrent refresh calls could both fire when a request landed\nright at expiry. Added a shared in-flight promise so refreshes\nde-dupe correctly.",
    branch: "main", lane: 0,
    files: [fc("src/hooks/useAuth.ts", "modified", 27, 9), fc("tests/auth.test.ts", "modified", 18, 0)],
    command: "git commit",
  },
  // feature/billing-webhooks branches off c4
  {
    id: "c5", parents: ["c4"], author: authors.diego, date: "2026-06-27T17:00:00Z",
    subject: "feat(webhooks): scaffold webhook receiver",
    branch: "feature/billing-webhooks", lane: 2,
    files: [fc("src/server/routes/webhooks.ts", "added", 54, 0)],
    command: "git checkout -b feature/billing-webhooks",
  },
  {
    id: "c6", parents: ["c5"], author: authors.diego, date: "2026-06-28T11:15:00Z",
    subject: "feat(webhooks): verify Stripe signature",
    branch: "feature/billing-webhooks", lane: 2,
    files: [fc("src/server/routes/webhooks.ts", "modified", 38, 4)],
    command: "git commit",
  },
  {
    id: "c7", parents: ["c6"], author: authors.priya, date: "2026-06-28T15:40:00Z",
    subject: "test(webhooks): add signature verification tests",
    branch: "feature/billing-webhooks", lane: 2,
    files: [fc("tests/webhooks.test.ts", "added", 71, 0)],
    command: "git commit",
  },
  // main continues in parallel
  {
    id: "c8", parents: ["c4"], author: authors.sam, date: "2026-06-28T09:30:00Z",
    subject: "docs: update README with local dev setup",
    branch: "main", lane: 0,
    files: [fc("README.md", "modified", 33, 5)],
    command: "git commit",
  },
  {
    id: "c9", parents: ["c8"], author: authors.maya, date: "2026-06-29T13:10:00Z",
    subject: "refactor(dashboard): extract chart primitives",
    branch: "main", lane: 0,
    files: [fc("src/components/charts/LineChart.tsx", "added", 96, 0), fc("src/components/charts/RevenueChart.tsx", "modified", 12, 40)],
    command: "git commit",
  },
  {
    id: "c10", parents: ["c9", "c7"], author: authors.diego, date: "2026-06-29T18:00:00Z",
    subject: "Merge branch 'feature/billing-webhooks' into main",
    branch: "main", lane: 0,
    files: [],
    command: "git merge feature/billing-webhooks",
  },
  {
    id: "c11", parents: ["c10"], author: authors.priya, date: "2026-06-30T10:00:00Z",
    subject: "feat(dashboard): wire revenue chart to live data",
    branch: "main", lane: 0,
    files: [fc("src/components/charts/RevenueChart.tsx", "modified", 45, 11), fc("src/lib/analytics.ts", "added", 58, 0)],
    command: "git commit",
  },
  {
    id: "c12", parents: ["c11"], author: authors.maya, date: "2026-07-01T09:45:00Z",
    subject: "chore(db): add billing_events migration",
    branch: "main", lane: 0,
    files: [fc("src/server/db/migrations/2026_07_01_add_billing_events.sql", "added", 24, 0)],
    command: "git commit",
  },
  // hotfix branches off c12
  {
    id: "c13", parents: ["c12"], author: authors.sam, date: "2026-07-01T14:20:00Z",
    subject: "fix(ui): correct scroll jump on Safari in chart tooltip",
    branch: "fix/safari-scroll-bug", lane: 3,
    files: [fc("src/components/charts/LineChart.tsx", "modified", 9, 3)],
    command: "git checkout -b fix/safari-scroll-bug",
  },
  {
    id: "c14", parents: ["c12"], author: authors.priya, date: "2026-07-01T16:50:00Z",
    subject: "style(charts): polish tooltip spacing",
    branch: "main", lane: 0,
    files: [fc("src/components/charts/LineChart.tsx", "modified", 6, 6)],
    command: "git commit",
  },
  {
    id: "c15", parents: ["c14", "c13"], author: authors.sam, date: "2026-07-02T08:10:00Z",
    subject: "Merge branch 'fix/safari-scroll-bug' into main",
    branch: "main", lane: 0,
    files: [],
    command: "git merge fix/safari-scroll-bug",
  },
  {
    id: "c16", parents: ["c15"], author: authors.maya, date: "2026-07-02T12:30:00Z",
    subject: "feat(settings): add team member invite flow",
    branch: "main", lane: 0,
    files: [fc("src/pages/Settings.tsx", "renamed", 82, 6, "src/pages/AccountSettings.tsx")],
    command: "git commit",
  },
  {
    id: "c17", parents: ["c16"], author: authors.diego, date: "2026-07-03T09:00:00Z",
    subject: "perf(api): cache Stripe customer lookups",
    branch: "main", lane: 0,
    files: [fc("src/lib/stripe.ts", "modified", 29, 4)],
    command: "git commit",
  },
  {
    id: "c18", parents: ["c17"], author: authors.sam, date: "2026-07-04T11:20:00Z",
    subject: "chore(deps): bump vite to 6.1.0",
    branch: "main", lane: 0,
    files: [fc("package.json", "modified", 2, 2)],
    command: "git commit",
  },
  // stale experiment branches off c18, abandoned
  {
    id: "c19", parents: ["c18"], author: authors.jordan, date: "2026-07-05T15:00:00Z",
    subject: "spike: prototype embedding-based search index",
    branch: "experiment/vector-search", lane: 4,
    files: [fc("src/search/embeddings.ts", "added", 140, 0)],
    command: "git checkout -b experiment/vector-search",
  },
  {
    id: "c20", parents: ["c19"], author: authors.jordan, date: "2026-07-05T17:45:00Z",
    subject: "spike: benchmark vector index query latency",
    branch: "experiment/vector-search", lane: 4,
    files: [fc("src/search/vectorIndex.ts", "added", 96, 0)],
    command: "git commit",
  },
  // main continues
  {
    id: "c21", parents: ["c18"], author: authors.priya, date: "2026-07-06T10:15:00Z",
    subject: "feat(dashboard): add date-range picker",
    branch: "main", lane: 0,
    files: [fc("src/pages/Dashboard.tsx", "modified", 51, 8)],
    command: "git commit",
  },
  {
    id: "c22", parents: ["c21"], author: authors.maya, date: "2026-07-07T09:40:00Z",
    subject: "fix(billing): handle webhook retries idempotently",
    branch: "main", lane: 0,
    files: [fc("src/server/routes/webhooks.ts", "modified", 33, 7)],
    command: "git commit",
  },
  {
    id: "c23", parents: ["c22"], author: authors.diego, date: "2026-07-08T14:00:00Z",
    subject: "test(billing): add retry idempotency coverage",
    branch: "main", lane: 0,
    files: [fc("tests/webhooks.test.ts", "modified", 47, 0)],
    command: "git commit",
  },
  {
    id: "c24", parents: ["c23"], author: authors.sam, date: "2026-07-09T11:30:00Z",
    subject: "refactor: migrate class components to hooks",
    branch: "main", lane: 0,
    files: [fc("src/pages/Settings.tsx", "modified", 40, 52), fc("src/pages/Dashboard.tsx", "modified", 22, 31)],
    command: "git commit",
  },
  {
    id: "c25", parents: ["c24"], author: authors.priya, date: "2026-07-10T16:10:00Z",
    subject: "feat(dashboard): add export-to-CSV action",
    branch: "main", lane: 0,
    files: [fc("src/pages/Dashboard.tsx", "modified", 36, 2), fc("src/utils/formatCurrency.ts", "added", 22, 0)],
    command: "git commit",
  },
  // feature/user-onboarding branches off c25 — CURRENT branch, unpublished
  {
    id: "c26", parents: ["c25"], author: authors.maya, date: "2026-07-11T10:00:00Z",
    subject: "feat(onboarding): scaffold onboarding wizard",
    branch: "feature/user-onboarding", lane: 1,
    files: [fc("src/components/OnboardingWizard.tsx", "added", 118, 0)],
    command: "git checkout -b feature/user-onboarding",
  },
  {
    id: "c27", parents: ["c26"], author: authors.maya, date: "2026-07-13T15:30:00Z",
    subject: "feat(onboarding): add step validation",
    branch: "feature/user-onboarding", lane: 1,
    files: [fc("src/components/OnboardingWizard.tsx", "modified", 64, 10), fc("src/hooks/useOnboarding.ts", "added", 47, 0)],
    command: "git commit",
  },
  {
    id: "c28", parents: ["c27"], author: authors.diego, date: "2026-07-16T09:10:00Z",
    subject: "feat(onboarding): connect wizard to signup API",
    branch: "feature/user-onboarding", lane: 1,
    files: [fc("src/hooks/useOnboarding.ts", "modified", 39, 5), fc("src/api/billing.ts", "modified", 8, 0)],
    command: "git commit",
  },
  {
    id: "c29", parents: ["c28"], author: authors.maya, date: "2026-07-17T17:45:00Z",
    subject: "test(onboarding): add wizard flow tests",
    branch: "feature/user-onboarding", lane: 1,
    files: [fc("tests/onboarding.test.ts", "added", 88, 0)],
    command: "git commit",
  },
  // main continues without the feature branch
  {
    id: "c30", parents: ["c25"], author: authors.sam, date: "2026-07-12T08:20:00Z",
    subject: "chore(ci): add bundle-size check to pipeline",
    branch: "main", lane: 0,
    files: [fc(".github/workflows/ci.yml", "modified", 18, 0)],
    command: "git commit",
  },
  {
    id: "c31", parents: ["c30"], author: authors.priya, date: "2026-07-14T13:00:00Z",
    subject: "fix(dashboard): correct CSV export timezone offset",
    branch: "main", lane: 0,
    files: [fc("src/utils/formatCurrency.ts", "modified", 14, 3)],
    command: "git commit",
  },
  {
    id: "c32", parents: ["c31"], author: authors.diego, date: "2026-07-17T10:40:00Z",
    subject: "feat(api): add pagination to billing events endpoint",
    branch: "main", lane: 0,
    files: [fc("src/api/billing.ts", "modified", 41, 6)],
    command: "git commit",
  },
  // origin/main has a divergent commit not yet fetched-merged locally
  {
    id: "c33", parents: ["c31"], author: authors.jordan, date: "2026-07-17T19:00:00Z",
    subject: "fix(security): patch dependency vulnerability (GHSA-8f2q-rc9j)",
    branch: "origin/main", lane: 5,
    files: [fc("package.json", "modified", 3, 3), fc("package-lock.json", "modified", 12, 12)],
    command: "git commit",
  },
];

const idToHash = new Map<string, string>();
for (const s of seeds) idToHash.set(s.id, makeHash(s.id + s.subject));

// Branch names are intentionally NOT baked in here — the current tip of every branch is
// computed live (see hooks/useCurrentBranch + graph-layout) so it stays correct as branches
// are created, deleted, or reset. `refs` below is tags only, which really are static per-commit.
const tagsByCommitId: Record<string, string[]> = {
  c10: ["v2.3.0"],
  c16: ["v2.4.0"],
  c22: ["v2.4.1"],
};

export const commits: Commit[] = seeds.map((s) => {
  const hash = idToHash.get(s.id)!;
  const refs = tagsByCommitId[s.id] ?? [];
  const stats = s.files.reduce(
    (acc, f) => ({ insertions: acc.insertions + f.insertions, deletions: acc.deletions + f.deletions }),
    { insertions: 0, deletions: 0 }
  );
  return {
    hash,
    shortHash: shortHash(hash),
    parents: s.parents.map((p) => idToHash.get(p)!),
    author: s.author,
    committer: s.author,
    authoredAt: s.date,
    committedAt: s.date,
    subject: s.subject,
    body: s.body,
    branch: s.branch,
    lane: s.lane,
    refs,
    isMerge: s.parents.length > 1,
    files: s.files,
    stats,
    gpgSigned: ["maya", "diego"].includes(s.author.id) && Math.abs(fnvIndex(s.id)) % 3 !== 0,
    command: s.command,
  };
});

function fnvIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

export const commitById = new Map(commits.map((c) => [c.hash, c]));
export function getCommit(hash: string): Commit | undefined {
  return commitById.get(hash);
}
export function getChildren(hash: string): Commit[] {
  return commits.filter((c) => c.parents.includes(hash));
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
export const branches: Branch[] = [
  {
    name: "main",
    kind: "local",
    headHash: idToHash.get("c32")!,
    isCurrent: false,
    upstream: "origin/main",
    ahead: 1,
    behind: 1,
    lastActivity: "2026-07-17T10:40:00Z",
    color: "history",
    lane: 0,
    protected: true,
    authorIds: ["maya", "diego", "priya", "sam"],
  },
  {
    name: "feature/user-onboarding",
    kind: "local",
    headHash: idToHash.get("c29")!,
    isCurrent: true,
    upstream: undefined,
    ahead: 4,
    behind: 0,
    lastActivity: "2026-07-17T17:45:00Z",
    color: "branch",
    lane: 1,
    authorIds: ["maya", "diego"],
    forkedFromHash: idToHash.get("c25")!,
  },
  {
    name: "feature/billing-webhooks",
    kind: "local",
    headHash: idToHash.get("c7")!,
    isCurrent: false,
    upstream: "origin/feature/billing-webhooks",
    ahead: 0,
    behind: 0,
    lastActivity: "2026-06-28T15:40:00Z",
    color: "commit",
    lane: 2,
    authorIds: ["diego", "priya"],
    forkedFromHash: idToHash.get("c4")!,
    mergedIntoHash: idToHash.get("c10")!,
  },
  {
    name: "fix/safari-scroll-bug",
    kind: "local",
    headHash: idToHash.get("c13")!,
    isCurrent: false,
    upstream: "origin/fix/safari-scroll-bug",
    ahead: 0,
    behind: 0,
    lastActivity: "2026-07-01T14:20:00Z",
    color: "commit",
    lane: 3,
    authorIds: ["sam"],
    forkedFromHash: idToHash.get("c12")!,
    mergedIntoHash: idToHash.get("c15")!,
  },
  {
    name: "experiment/vector-search",
    kind: "local",
    headHash: idToHash.get("c20")!,
    isCurrent: false,
    upstream: undefined,
    ahead: 2,
    behind: 12,
    forkedFromHash: idToHash.get("c18")!,
    lastActivity: "2026-07-05T17:45:00Z",
    color: "history",
    lane: 4,
    stale: true,
    authorIds: ["jordan"],
  },
  {
    name: "origin/main",
    kind: "remote",
    headHash: idToHash.get("c33")!,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastActivity: "2026-07-17T19:00:00Z",
    color: "remote",
    lane: 5,
    authorIds: ["jordan"],
  },
];

export const currentBranch = branches.find((b) => b.isCurrent)!;

// Returned only when a real repo has zero commits (git init, nothing committed yet — `git
// for-each-ref` has nothing to list, so `branches` hydrates to []). headHash is deliberately
// unresolvable so callers doing getCommit(mainBranch().headHash) get `undefined` instead of a
// throw; pages that need an actual commit must guard on `hasCommits()` before reading it.
const EMPTY_REPO_BRANCH: Branch = {
  name: "main",
  kind: "local",
  headHash: "",
  isCurrent: true,
  ahead: 0,
  behind: 0,
  lastActivity: new Date(0).toISOString(),
  color: "history",
  lane: 0,
  protected: true,
  authorIds: [],
};

export function hasCommits(): boolean {
  return commits.length > 0;
}

// A function, not a snapshot const like `currentBranch` — this one is read at runtime by
// merge/rebase simulators *after* hydrate() may have replaced `branches` wholesale, so it
// has to re-resolve against the live array instead of freezing a reference at module load.
export function mainBranch(): Branch {
  return (
    branches.find((b) => b.name === "main") ?? branches.find((b) => b.protected) ?? branches[0] ?? EMPTY_REPO_BRANCH
  );
}

// ---------------------------------------------------------------------------
// Working tree — uncommitted state on top of feature/user-onboarding @ c29
// ---------------------------------------------------------------------------
export const workingFiles: WorkingFile[] = [
  { path: "src/components/OnboardingWizard.tsx", state: "staged", insertions: 42, deletions: 8, stagedInsertions: 42, stagedDeletions: 8 },
  { path: "src/hooks/useOnboarding.ts", state: "staged", insertions: 19, deletions: 2, stagedInsertions: 19, stagedDeletions: 2 },
  { path: "src/pages/Dashboard.tsx", state: "modified", insertions: 6, deletions: 1 },
  { path: "src/styles/tokens.css", state: "modified", insertions: 3, deletions: 0 },
  { path: "src/components/LegacySignupForm.tsx", state: "deleted", insertions: 0, deletions: 96 },
  { path: "src/components/OnboardingConfetti.tsx", state: "untracked", insertions: 54, deletions: 0 },
  { path: "src/components/OnboardingWizard.test.tsx", state: "untracked", insertions: 71, deletions: 0 },
];

// ---------------------------------------------------------------------------
// Remote + health + repo state
// ---------------------------------------------------------------------------
export const remote: RemoteInfo = {
  name: "origin",
  url: "git@github.com:acme/lumen-analytics.git",
  ahead: 1,
  behind: 1,
  lastFetched: "2026-07-18T08:02:00Z",
  lastSynced: "2026-07-17T10:41:00Z",
};

export const health: RepoHealth = {
  score: 92,
  looseObjects: 143,
  largestFileMB: 4.2,
  stashCount: 1,
  unmergedBranches: 1,
  lastGc: "2026-07-10T03:00:00Z",
};

export const repoState: RepoState = {
  name: REPO_NAME,
  path: "~/dev/lumen-analytics",
  currentBranch: currentBranch.name,
  headHash: currentBranch.headHash,
  detached: false,
  remote,
  health,
};

let liveMode = false;

export function timeAgo(iso: string, now: Date = liveMode ? new Date() : new Date("2026-07-18T12:00:00Z")): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

// ---------------------------------------------------------------------------
// Hydration — replaces every export above with real data from the extension host, in
// place, so existing imports (`commits`, `branches`, `commitById`, `currentUser`, ...)
// keep the same object/array identity and nothing downstream needs to change its imports.
// Standalone browser preview (`npm run dev`, no VS Code host) never calls this, so the
// hand-authored lumen-analytics demo data keeps working exactly as before.
// ---------------------------------------------------------------------------
import type { RepoSnapshot } from "./vscode-protocol";

export function hydrate(snapshot: RepoSnapshot): void {
  liveMode = true;

  commits.length = 0;
  commits.push(...snapshot.commits);

  commitById.clear();
  for (const c of commits) commitById.set(c.hash, c);

  branches.length = 0;
  branches.push(...snapshot.branches);

  for (const key of Object.keys(authors)) delete authors[key];
  Object.assign(authors, snapshot.authors);

  Object.assign(you, snapshot.currentUser);

  Object.assign(remote, {
    name: snapshot.remotes[0]?.name ?? remote.name,
    url: snapshot.remotes[0]?.url ?? remote.url,
    ahead: snapshot.branches.find((b) => b.isCurrent)?.ahead ?? 0,
    behind: snapshot.branches.find((b) => b.isCurrent)?.behind ?? 0,
    lastFetched: new Date().toISOString(),
    lastSynced: new Date().toISOString(),
  });

  health.stashCount = snapshot.stashes.length;
  health.unmergedBranches = snapshot.branches.filter((b) => b.kind === "local" && !b.protected && b.ahead > 0).length;

  Object.assign(repoState, {
    name: snapshot.repoName,
    path: snapshot.repoPath,
    currentBranch: snapshot.currentBranchName ?? "",
    headHash: snapshot.headHash,
    detached: snapshot.currentBranchName === null,
    remote,
    health,
  });
}

export function isLiveMode(): boolean {
  return liveMode;
}

export { you as currentUser };
