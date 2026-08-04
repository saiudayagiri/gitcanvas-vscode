export type GitColorRole = "commit" | "branch" | "staged" | "history" | "remote" | "conflict";

export interface Author {
  id: string;
  name: string;
  email: string;
  colorSeed: string; // deterministic avatar color
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
  authoredAt: string; // ISO
  committedAt: string; // ISO
  subject: string;
  body?: string;
  branch: string; // owning branch lane for layout purposes
  lane: number;
  refs: string[]; // branch/tag names pointing here
  isMerge: boolean;
  files: FileChange[];
  stats: { insertions: number; deletions: number };
  gpgSigned?: boolean;
  command?: string; // educational: git command that likely produced this
}

export interface Branch {
  name: string;
  kind: "local" | "remote";
  headHash: string;
  isCurrent: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  lastActivity: string; // ISO
  color: GitColorRole;
  lane: number;
  stale?: boolean;
  protected?: boolean;
  authorIds: string[]; // contributors
  forkedFromHash?: string; // commit on the parent branch where this branch diverged
  mergedIntoHash?: string; // commit on the parent branch that merged this branch in, if merged
}

export type WorkingFileState = "untracked" | "modified" | "staged" | "conflicted" | "deleted";

export interface WorkingFile {
  path: string;
  state: WorkingFileState;
  insertions: number;
  deletions: number;
  stagedInsertions?: number;
  stagedDeletions?: number;
  binary?: boolean;
}

export interface RemoteInfo {
  name: string;
  url: string;
  ahead: number;
  behind: number;
  lastFetched: string;
  lastSynced: string;
}

export interface RepoHealth {
  score: number; // 0-100
  looseObjects: number;
  largestFileMB: number;
  stashCount: number;
  unmergedBranches: number;
  lastGc: string;
}

export interface RepoState {
  name: string;
  path: string;
  currentBranch: string;
  headHash: string;
  detached: boolean;
  remote: RemoteInfo;
  health: RepoHealth;
}
