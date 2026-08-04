// Message protocol between the extension host and the webview. Kept in sync by hand with
// webview-ui/src/lib/vscode-protocol.ts and webview-ui/src/types/git.ts — small and stable
// enough that a shared package isn't worth the build-tooling overhead yet.

export type GitColorRole = "commit" | "branch" | "staged" | "history" | "remote" | "conflict";

export interface Author {
  id: string;
  name: string;
  email: string;
  colorSeed: string;
}

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileChange {
  path: string;
  oldPath?: string;
  status: FileStatus;
  insertions: number;
  deletions: number;
}

export interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: Author;
  committer: Author;
  authoredAt: string;
  committedAt: string;
  subject: string;
  body?: string;
  branch: string;
  lane: number;
  refs: string[];
  isMerge: boolean;
  files: FileChange[];
  stats: { insertions: number; deletions: number };
  gpgSigned: boolean;
}

export interface Branch {
  name: string;
  kind: "local" | "remote";
  headHash: string;
  isCurrent: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  lastActivity: string;
  color: GitColorRole;
  lane: number;
  stale?: boolean;
  protected?: boolean;
  authorIds: string[];
  forkedFromHash?: string;
  mergedIntoHash?: string;
}

export type WorkingFileState = "untracked" | "modified" | "staged" | "conflicted" | "deleted";

export interface WorkingFile {
  path: string;
  oldPath?: string;
  state: WorkingFileState;
  insertions: number;
  deletions: number;
  stagedInsertions?: number;
  stagedDeletions?: number;
}

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
 * and expose a real per-file resolve/continue/abort flow to the webview. Rebase still uses the
 * blunter auto-abort-on-any-failure safety net (see runWithAutoAbort in gitWriteCommands.ts) —
 * driving its interactive machinery for real is a separate, bigger piece of work. */
export type ConflictOp = "merge" | "revert" | "cherryPick";

export interface ConflictFileRaw {
  path: string;
  oursContent: string;
  theirsContent: string;
  workingContent: string; // current on-disk content, real conflict markers included
}

export interface ReflogRawEntry {
  hash: string;
  selector: string; // "HEAD@{0}"
  action: string; // e.g. "commit", "checkout", "reset", "rebase (finish)", "cherry-pick"
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
  /** A cheap, working-tree-only refresh (a file edited/added/deleted, staged/unstaged, or a
   * stash pushed/applied/popped/dropped) — just the file lists (and stash list, when relevant),
   * not a full repoSnapshot. Applied without the full-app remount a repoSnapshot triggers, so
   * staying on e.g. the Staging Area or Stashes pane in the Working Tree view doesn't get
   * bounced back to Working Directory every time one of these runs. `stashes` is only included
   * when a stash-affecting command triggered the refresh — omitted, it leaves the existing list
   * untouched rather than implying "no stashes". */
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
