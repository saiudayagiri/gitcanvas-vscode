import { create } from "zustand";
import {
  workingFiles as seedWorkingFiles,
  branches,
  commits,
  getCommit,
  currentBranch as initialBranch,
  currentUser,
  remote as originRemote,
  hydrate as hydrateMockData,
} from "@/lib/mock-data";
import { makeHash, shortHash } from "@/lib/hash";
import { changesSince, isAncestor } from "@/lib/git-diff";
import { getCherryPickConflicts, type CherryPickConflictFile } from "@/lib/cherry-pick-sim";
import type { ConflictResolution } from "@/lib/conflict-markers";
import { isInVsCode, runGitCommand } from "@/lib/vscode-bridge";
import type { ConflictOp, GitCommand, RepoSnapshot, StashEntry as RawStashEntry } from "@/lib/vscode-protocol";
import type { Branch, WorkingFile, WorkingFileState, FileChange, FileStatus } from "@/types/git";

/** Fires a real git command on the extension host in the background — a no-op in standalone
 * browser preview. The store's existing simulated logic already updated local state
 * optimistically; when this resolves, the host pushes a fresh snapshot that reconciles
 * everything with ground truth (see hydrateFromRepo). Failures surface via
 * `lastCommandError` rather than each action's own synchronous return value, so no
 * consumer of these actions has to change how it calls them.
 */
function dispatchRealCommand(command: GitCommand, set: (partial: Partial<UIState>) => void, get: () => UIState): void {
  if (!isInVsCode()) return;
  runGitCommand(command)
    .then(({ output, conflict }) => {
      if (output) {
        // swap the terminal's scripted approximation for what git actually printed, on
        // whichever log entry this command's own logCommand() call just added — in the rare
        // case another action's entry landed after it (a second command fired before this one
        // resolved), this just leaves that entry's scripted text alone instead of guessing.
        const log = get().commandLog;
        const last = log[log.length - 1];
        if (last) set({ commandLog: log.map((e) => (e.id === last.id ? { ...e, output } : e)) });
      }
      if (conflict) set({ realConflictOp: conflict });
    })
    .catch((err: Error) => set({ lastCommandError: err.message }));
}

export type ResetMode = "soft" | "mixed" | "hard";

function workingFileToChange(f: WorkingFile): FileChange {
  const status: FileStatus = f.state === "untracked" ? "added" : f.state === "deleted" ? "deleted" : "modified";
  return {
    path: f.path,
    status,
    insertions: f.stagedInsertions ?? f.insertions,
    deletions: f.stagedDeletions ?? f.deletions,
  };
}

function changeToWorkingFile(f: FileChange): WorkingFile {
  const state: WorkingFileState = f.status === "added" ? "untracked" : f.status === "deleted" ? "deleted" : "modified";
  return { path: f.path, state, insertions: f.insertions, deletions: f.deletions, stagedInsertions: f.insertions, stagedDeletions: f.deletions };
}

/** Real, hydrated stashes carry `stash-${index}` ids (see mock-data.ts hydrate()); simulated
 * ones use a timestamp and never reach a real dispatch anyway (isInVsCode() gates that). */
function stashIndexFromId(id: string): number {
  const match = /^stash-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

/** Real `git stash apply`/`pop` restores everything to the *working directory* — files that were
 * staged when stashed come back as unstaged modifications (only `--index` re-stages them, and the
 * UI doesn't use it). Mirroring that here instead of quietly putting files back into staging is
 * the difference between teaching what stash actually does and teaching a comforting lie. */
function restoreStashedFiles(s: UIState, entry: StashEntry): Partial<UIState> {
  const existing = new Set(s.workingFiles.map((f) => f.path));
  const restored: WorkingFile[] = [
    ...entry.workingFiles,
    ...entry.stagedFiles.map((f): WorkingFile => ({ ...f, state: f.state === "staged" ? "modified" : f.state })),
  ].filter((f) => !existing.has(f.path));
  return { workingFiles: [...s.workingFiles, ...restored] };
}

const BRANCH_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function isValidBranchName(name: string): string | null {
  if (name.length === 0) return "Branch name can't be empty.";
  if (!BRANCH_NAME_PATTERN.test(name)) return "Use letters, numbers, -, _, . or / — no spaces.";
  if (name.includes("..") || name.endsWith("/") || name.endsWith(".lock")) return "Not a valid git ref name.";
  return null;
}

const TAG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidTagName(name: string): string | null {
  if (name.length === 0) return "Tag name can't be empty.";
  if (!TAG_NAME_PATTERN.test(name)) return "Use letters, numbers, -, _, or . — no spaces or slashes.";
  return null;
}

export interface Tag {
  name: string;
  hash: string;
}

export interface LocalCommit {
  id: string;
  hash: string;
  shortHash: string;
  message: string;
  fileCount: number;
  files: FileChange[]; // snapshot of what this commit changed, so it can be shown/inspected like a real commit
  pushed: boolean;
}

export interface RemoteEntry {
  name: string;
  url: string;
}

export interface GitConfig {
  userName: string;
  userEmail: string;
  defaultBranch: string;
  editor: string;
}

type GitConfigKey = "user.name" | "user.email" | "init.defaultBranch" | "core.editor";

export interface StashEntry {
  id: string;
  message: string;
  branchName: string;
  workingFiles: WorkingFile[];
  stagedFiles: WorkingFile[];
  createdAt: string;
}

export interface CommandLogEntry {
  id: string;
  command: string;
  output?: string;
  timestamp: number;
}

export interface ReflogEntry {
  id: string;
  hash: string; // full hash HEAD pointed to right after this action (real DAG hash, or a session-only fake hash)
  action: string; // e.g. "checkout", "reset", "commit", "commit (amend)", "revert", "cherry-pick"
  description: string;
  timestamp: number;
}

export type CheckoutTarget = { type: "branch"; name: string } | { type: "commit"; hash: string };

interface UIState {
  // commit inspector
  inspectedCommitHash: string | null;
  inspectCommit: (hash: string | null) => void;

  // command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;

  // commit graph branch highlight
  focusedBranch: string | null;
  setFocusedBranch: (name: string | null) => void;

  // git config (session-only)
  gitConfig: GitConfig;
  updateGitConfig: (partial: Partial<GitConfig>) => void;

  // toy terminal — mirrors every GUI action as the real git command
  commandLog: CommandLogEntry[];
  terminalOpen: boolean;
  toggleTerminal: () => void;
  setTerminalOpen: (v: boolean) => void;
  logCommand: (command: string, output?: string) => void;

  // checkout: either a branch is checked out, or a bare commit (detached HEAD)
  currentBranchName: string | null;
  detachedHash: string | null;
  headOverride: string | null; // set by `reset`, when the current branch points somewhere other than its mock head
  pendingCheckout: CheckoutTarget | null;
  requestSwitchBranch: (name: string) => void;
  requestCheckoutCommit: (hash: string) => void;
  confirmCheckout: (mode: "bring" | "stash") => void;
  cancelCheckout: () => void;
  resetTo: (hash: string, mode: ResetMode) => void;
  createdBranches: Branch[];
  createBranch: (name: string) => string | null; // returns an error message, or null on success
  deletedBranchNames: string[];
  deleteBranch: (name: string, force: boolean) => string | null;
  createdTags: Tag[];
  deletedTagNames: string[];
  createTag: (name: string, hash: string) => string | null;
  deleteTag: (name: string) => void;

  // working tree sandbox — global so checkout can see/guard against it
  workingFiles: WorkingFile[];
  stagedFiles: WorkingFile[];
  stageFile: (path: string) => void;
  unstageFile: (path: string) => void;
  stageAll: () => void;
  unstageAll: () => void;
  restoreFile: (path: string) => void;
  stashes: StashEntry[];
  stashChanges: (message?: string) => string | null;
  applyStash: (id: string) => void;
  popStash: (id: string) => void;
  dropStash: (id: string) => void;
  cleanUntracked: () => void;

  // remotes
  additionalRemotes: RemoteEntry[];
  removedRemoteNames: string[];
  addRemote: (name: string, url: string) => string | null;
  removeRemote: (name: string) => string | null;
  editRemote: (name: string, url: string) => string | null;
  /** The real remote list from the last hydrated snapshot — empty in standalone browser
   * preview, where RemoteSyncPage falls back to the mock `remote` + additionalRemotes/
   * removedRemoteNames simulation instead. */
  remotes: RemoteEntry[];

  commitMessage: string;
  setCommitMessage: (m: string) => void;
  localCommits: LocalCommit[];
  commitStaged: () => void;
  amendMode: boolean;
  canAmend: () => boolean;
  toggleAmendMode: () => void;
  pushedCount: number;
  justPushed: boolean;
  pushAll: () => void;
  revertCommit: (hash: string) => string | null;
  /** Undoes the most recent local commit — a soft reset back to staging if it's unpushed, a revert if it's already pushed. */
  undoLastCommit: () => string | null;
  cherryPick: (hash: string) => string | null;
  cherryPickConflict: { hash: string; conflictingFiles: CherryPickConflictFile[] } | null;
  cherryPickResolutions: Record<string, ConflictResolution>;
  resolveCherryPickFile: (path: string, choice: ConflictResolution) => void;
  continueCherryPick: () => void;
  abortCherryPick: () => void;

  // reflog — every action that moves HEAD, in one place, with recovery
  reflog: ReflogEntry[];
  restoreFromReflog: (hash: string) => void;

  // bumped whenever real repo data arrives from the VS Code extension host (see
  // vscode-bridge.ts) — the app root remounts on this to guarantee every memoized read of
  // mock-data.ts's mutable arrays recomputes, without having to audit every useMemo by hand.
  repoDataVersion: number;
  hydrateFromRepo: (snapshot: RepoSnapshot) => void;
  applyStatusUpdate: (workingFiles: WorkingFile[], stagedFiles: WorkingFile[], stashes?: RawStashEntry[]) => void;

  // surfaces failures from real git commands dispatched in the background (see
  // dispatchRealCommand) — these can't return synchronously through each action's own
  // return value without changing every consumer, so they land here instead.
  lastCommandError: string | null;
  clearCommandError: () => void;

  // set when the extension host can't hand us a repo at all (no folder open, or the open
  // folder isn't a git repo) — App.tsx renders a dedicated screen instead of leaving the
  // seeded demo data on screen looking like it's the user's real repository.
  hostError: string | null;
  setHostError: (message: string | null) => void;

  // set when a real merge/revert/cherry-pick stops mid-way on a real conflict — RealConflictModal
  // watches this to open the actual resolve/continue/abort flow against the live repository.
  realConflictOp: ConflictOp | null;
  clearRealConflictOp: () => void;
}

let logSeq = 0;

export const useUIStore = create<UIState>((set, get) => ({
  inspectedCommitHash: null,
  inspectCommit: (hash) => set({ inspectedCommitHash: hash }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),

  focusedBranch: null,
  setFocusedBranch: (name) => set({ focusedBranch: name }),

  gitConfig: {
    userName: currentUser.name,
    userEmail: currentUser.email,
    defaultBranch: "main",
    editor: "code --wait",
  },
  updateGitConfig: (partial) => {
    set((s) => ({ gitConfig: { ...s.gitConfig, ...partial } }));
    const entries = Object.entries(partial) as [keyof GitConfig, string][];
    const keyMap: Record<keyof GitConfig, GitConfigKey> = {
      userName: "user.name",
      userEmail: "user.email",
      defaultBranch: "init.defaultBranch",
      editor: "core.editor",
    };
    for (const [key, value] of entries) {
      get().logCommand(`git config --global ${keyMap[key]} "${value}"`);
      dispatchRealCommand({ kind: "setConfig", key: keyMap[key], value }, set, get);
    }
  },

  commandLog: [],
  terminalOpen: false,
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setTerminalOpen: (v) => set({ terminalOpen: v }),
  logCommand: (command, output) =>
    set((s) => ({
      commandLog: [...s.commandLog, { id: `log-${logSeq++}`, command, output, timestamp: Date.now() }].slice(-200),
    })),

  currentBranchName: initialBranch.name,
  detachedHash: null,
  headOverride: null,
  reflog: [
    {
      id: "reflog-seed",
      hash: initialBranch.headHash,
      action: "clone",
      description: `from origin, HEAD points to ${initialBranch.name}`,
      timestamp: Date.now() - 1000 * 60 * 60 * 24,
    },
  ],
  restoreFromReflog: (hash) => {
    const s = get();
    if (!s.currentBranchName) return;
    if (!getCommit(hash)) return; // session-only commit (from a commit/revert/cherry-pick) has no resolvable target here
    get().resetTo(hash, "hard");
  },

  lastCommandError: null,
  clearCommandError: () => set({ lastCommandError: null }),

  hostError: null,
  setHostError: (message) => set({ hostError: message }),

  realConflictOp: null,
  clearRealConflictOp: () => set({ realConflictOp: null }),

  remotes: [],
  repoDataVersion: 0,
  hydrateFromRepo: (snapshot) => {
    hydrateMockData(snapshot);
    set((state) => ({
      hostError: null,
      currentBranchName: snapshot.currentBranchName,
      detachedHash: snapshot.currentBranchName ? null : snapshot.headHash,
      headOverride: null,
      workingFiles: snapshot.workingFiles,
      stagedFiles: snapshot.stagedFiles,
      localCommits: [], // real unpushed commits already live in `commits` — nothing left to simulate
      pushedCount: 0,
      justPushed: false,
      amendMode: false,
      commitMessage: "",
      createdBranches: [],
      deletedBranchNames: [],
      createdTags: [],
      deletedTagNames: [],
      additionalRemotes: [],
      removedRemoteNames: [],
      remotes: snapshot.remotes,
      stashes: snapshot.stashes.map((s) => ({
        id: s.id,
        message: s.message,
        branchName: s.branchName,
        workingFiles: [],
        stagedFiles: [],
        createdAt: s.createdAt,
      })),
      gitConfig: {
        userName: snapshot.currentUser.name,
        userEmail: snapshot.currentUser.email,
        defaultBranch: snapshot.globalConfig.defaultBranch,
        editor: snapshot.globalConfig.editor || state.gitConfig.editor,
      },
      reflog: [
        {
          id: "reflog-live-seed",
          hash: snapshot.headHash,
          action: "clone",
          description: `real repo — HEAD points to ${snapshot.currentBranchName ?? "(detached)"}`,
          timestamp: Date.now(),
        },
      ],
      repoDataVersion: state.repoDataVersion + 1,
    }));
  },
  // The cheap counterpart to hydrateFromRepo — a plain `set()` for just the two file lists, so
  // an ordinary working-tree edit updates through React's normal re-render instead of bumping
  // repoDataVersion and remounting the entire app for a change that never touched history.
  applyStatusUpdate: (workingFiles, stagedFiles, stashes) =>
    set({
      workingFiles,
      stagedFiles,
      ...(stashes
        ? { stashes: stashes.map((s) => ({ id: s.id, message: s.message, branchName: s.branchName, workingFiles: [], stagedFiles: [], createdAt: s.createdAt })) }
        : {}),
    }),
  pendingCheckout: null,

  requestSwitchBranch: (name) => {
    const state = get();
    if (name === state.currentBranchName && !state.detachedHash) return;
    if (![...branches, ...state.createdBranches].some((b) => b.name === name)) return;
    requestCheckout(set, get, { type: "branch", name });
  },
  requestCheckoutCommit: (hash) => {
    if (hash === get().detachedHash) return;
    if (!commits.some((c) => c.hash === hash)) return;
    requestCheckout(set, get, { type: "commit", hash });
  },
  confirmCheckout: (mode) => {
    const target = get().pendingCheckout;
    if (!target) return;
    if (mode === "stash") {
      get().stashChanges();
    }
    set({ pendingCheckout: null });
    applyCheckout(set, get, target);
  },
  cancelCheckout: () => set({ pendingCheckout: null }),

  createdBranches: [],
  createBranch: (rawName) => {
    const name = rawName.trim();
    const err = isValidBranchName(name);
    if (err) return err;
    const s = get();
    const exists = [...branches, ...s.createdBranches].some(
      (b) => !s.deletedBranchNames.includes(b.name) && b.name === name
    );
    if (exists) return `A branch named '${name}' already exists.`;

    const headHash =
      s.headOverride ??
      s.detachedHash ??
      [...branches, ...s.createdBranches].find((b) => b.name === s.currentBranchName)?.headHash;
    if (!headHash) return "Can't determine where to create the branch from.";

    const newBranch: Branch = {
      name,
      kind: "local",
      headHash,
      isCurrent: false,
      ahead: 0,
      behind: 0,
      lastActivity: new Date().toISOString(),
      color: "branch",
      lane: -1,
      forkedFromHash: headHash,
      authorIds: [currentUser.id],
    };
    set((state) => ({ createdBranches: [...state.createdBranches, newBranch] }));
    requestCheckout(set, get, { type: "branch", name }, true /* this action's own dispatch below already switches */);
    get().logCommand(`git checkout -b ${name}`, `Switched to a new branch '${name}'`);
    dispatchRealCommand({ kind: "createBranch", name }, set, get);
    return null;
  },

  deletedBranchNames: [],
  deleteBranch: (name, force) => {
    const s = get();
    if (name === s.currentBranchName) return "Can't delete the branch you're currently on — switch away first.";
    const branch = [...branches, ...s.createdBranches].find((b) => b.name === name);
    if (!branch) return "Branch not found.";
    const isMerged = Boolean(branch.mergedIntoHash) || branch.forkedFromHash === branch.headHash;
    if (!isMerged && !force) {
      return `'${name}' isn't fully merged. Use force delete if you're sure.`;
    }
    set((state) => ({ deletedBranchNames: [...state.deletedBranchNames, name] }));
    get().logCommand(`git branch ${force && !isMerged ? "-D" : "-d"} ${name}`, `Deleted branch ${name} (was ${branch.headHash.slice(0, 7)}).`);
    dispatchRealCommand({ kind: "deleteBranch", name, force }, set, get);
    return null;
  },

  createdTags: [],
  deletedTagNames: [],
  createTag: (rawName, hash) => {
    const name = rawName.trim();
    const err = isValidTagName(name);
    if (err) return err;
    const s = get();
    const existingNames = new Set(
      [...commits.flatMap((c) => c.refs), ...s.createdTags.map((t) => t.name)].filter(
        (n) => !s.deletedTagNames.includes(n)
      )
    );
    if (existingNames.has(name)) return `Tag '${name}' already exists.`;
    const target = getCommit(hash);
    if (!target) return "Commit not found.";
    set((state) => ({ createdTags: [...state.createdTags, { name, hash }] }));
    get().logCommand(`git tag ${name} ${target.shortHash}`);
    dispatchRealCommand({ kind: "createTag", name, hash }, set, get);
    return null;
  },
  deleteTag: (name) => {
    set((state) => ({ deletedTagNames: [...state.deletedTagNames, name] }));
    get().logCommand(`git tag -d ${name}`, `Deleted tag '${name}'`);
    dispatchRealCommand({ kind: "deleteTag", name }, set, get);
  },

  resetTo: (hash, mode) => {
    const s = get();
    if (!s.currentBranchName) return; // resetting a detached HEAD isn't offered in this prototype
    const branch = [...branches, ...s.createdBranches].find((b) => b.name === s.currentBranchName);
    if (!branch) return;
    const currentHeadHash = s.headOverride ?? branch.headHash;
    // nothing to undo only if HEAD already sits there AND there are no session-local commits stacked on top
    if (currentHeadHash === hash && s.localCommits.length === 0) return;

    const undone = changesSince(hash, currentHeadHash);
    const undoneFiles: WorkingFile[] = [...undone.entries()].map(([path, stat]) => ({
      path,
      state: "modified",
      insertions: stat.insertions,
      deletions: stat.deletions,
    }));
    const target = getCommit(hash);
    const targetShort = target?.shortHash ?? shortHash(hash);

    if (mode === "hard") {
      // real `reset --hard` only touches *tracked* files — untracked ones aren't in the index or
      // HEAD, so git leaves them sitting in the working directory (that's what `clean` is for).
      set({
        headOverride: hash,
        workingFiles: s.workingFiles.filter((f) => f.state === "untracked"),
        stagedFiles: [],
        localCommits: [],
        pushedCount: 0,
        amendMode: false,
        commitMessage: "",
      });
    } else if (mode === "soft") {
      const existingPaths = new Set(s.stagedFiles.map((f) => f.path));
      set({
        headOverride: hash,
        stagedFiles: [...s.stagedFiles, ...undoneFiles.filter((f) => !existingPaths.has(f.path))],
        localCommits: [],
        pushedCount: 0,
        amendMode: false,
        commitMessage: "",
      });
    } else {
      const merged = [...s.stagedFiles, ...s.workingFiles, ...undoneFiles];
      const byPath = new Map<string, WorkingFile>();
      for (const f of merged) if (!byPath.has(f.path)) byPath.set(f.path, f);
      set({
        headOverride: hash,
        workingFiles: [...byPath.values()],
        stagedFiles: [],
        localCommits: [],
        pushedCount: 0,
        amendMode: false,
        commitMessage: "",
      });
    }

    const outputByMode: Record<ResetMode, string> = {
      soft: `HEAD is now at ${targetShort}\n(changes since then are staged)`,
      mixed: `Unstaged changes after reset:\n${undoneFiles.map((f) => `M\t${f.path}`).join("\n") || "(none)"}\nHEAD is now at ${targetShort}`,
      hard: `HEAD is now at ${targetShort}\n(working directory and index match this commit exactly)`,
    };
    get().logCommand(`git reset --${mode} ${targetShort}`, outputByMode[mode]);
    pushReflog(set, get, hash, "reset", `moving to ${targetShort}`);
    dispatchRealCommand({ kind: "reset", hash, mode }, set, get);
  },

  workingFiles: seedWorkingFiles.filter((f) => f.state !== "staged"),
  stagedFiles: seedWorkingFiles.filter((f) => f.state === "staged"),
  stageFile: (path) => {
    set((s) => {
      const f = s.workingFiles.find((w) => w.path === path);
      if (!f) return s;
      return { workingFiles: s.workingFiles.filter((w) => w.path !== path), stagedFiles: [...s.stagedFiles, f] };
    });
    get().logCommand(`git add ${path}`);
    dispatchRealCommand({ kind: "stage", path }, set, get);
  },
  unstageFile: (path) => {
    set((s) => {
      const f = s.stagedFiles.find((w) => w.path === path);
      if (!f) return s;
      return { stagedFiles: s.stagedFiles.filter((w) => w.path !== path), workingFiles: [...s.workingFiles, f] };
    });
    get().logCommand(`git restore --staged ${path}`);
    dispatchRealCommand({ kind: "unstage", path }, set, get);
  },
  stageAll: () => {
    set((s) => ({ stagedFiles: [...s.stagedFiles, ...s.workingFiles], workingFiles: [] }));
    get().logCommand("git add -A");
    dispatchRealCommand({ kind: "stageAll" }, set, get);
  },
  unstageAll: () => {
    set((s) => ({ workingFiles: [...s.workingFiles, ...s.stagedFiles], stagedFiles: [] }));
    get().logCommand("git restore --staged .");
    dispatchRealCommand({ kind: "unstageAll" }, set, get);
  },
  restoreFile: (path) => {
    const f = get().workingFiles.find((w) => w.path === path);
    set((s) => ({ workingFiles: s.workingFiles.filter((w) => w.path !== path) }));
    get().logCommand(f?.state === "untracked" ? `rm ${path}` : `git restore ${path}`);
    dispatchRealCommand({ kind: "discard", path, wasUntracked: f?.state === "untracked" }, set, get);
  },

  stashes: [],
  stashChanges: (message) => {
    const s = get();
    if (s.workingFiles.length === 0 && s.stagedFiles.length === 0) return "Nothing to stash — the working tree is clean.";
    const branchLabel = s.currentBranchName ?? "detached HEAD";
    const entry: StashEntry = {
      id: `stash-${Date.now()}`,
      message: message?.trim() || `WIP on ${branchLabel}`,
      branchName: branchLabel,
      workingFiles: s.workingFiles,
      stagedFiles: s.stagedFiles,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ stashes: [entry, ...state.stashes], workingFiles: [], stagedFiles: [] }));
    // -u because plain `git stash` leaves untracked files behind (and refuses outright when
    // untracked files are all you have) — the UI visibly sets aside everything, so the real
    // command must too.
    get().logCommand(
      message ? `git stash push -u -m "${message}"` : "git stash push -u",
      `Saved working directory and index state ${entry.message}`
    );
    dispatchRealCommand({ kind: "stashPush", message }, set, get);
    return null;
  },
  applyStash: (id) => {
    const entry = get().stashes.find((st) => st.id === id);
    if (!entry) return;
    const ref = `stash@{${stashIndexFromId(entry.id)}}`;
    set((s) => restoreStashedFiles(s, entry));
    get().logCommand(`git stash apply ${ref}`, `On branch ${get().currentBranchName ?? "HEAD"}: changes restored (unstaged)`);
    dispatchRealCommand({ kind: "stashApply", index: stashIndexFromId(entry.id) }, set, get);
  },
  popStash: (id) => {
    const entry = get().stashes.find((st) => st.id === id);
    if (!entry) return;
    const ref = `stash@{${stashIndexFromId(entry.id)}}`;
    set((s) => ({ ...restoreStashedFiles(s, entry), stashes: s.stashes.filter((st) => st.id !== id) }));
    get().logCommand(`git stash pop ${ref}`, `Dropped ${ref} (${entry.message})`);
    dispatchRealCommand({ kind: "stashPop", index: stashIndexFromId(entry.id) }, set, get);
  },
  dropStash: (id) => {
    const entry = get().stashes.find((st) => st.id === id);
    if (!entry) return;
    const ref = `stash@{${stashIndexFromId(entry.id)}}`;
    set((s) => ({ stashes: s.stashes.filter((st) => st.id !== id) }));
    get().logCommand(`git stash drop ${ref}`, `Dropped ${ref} (${entry.message})`);
    dispatchRealCommand({ kind: "stashDrop", index: stashIndexFromId(entry.id) }, set, get);
  },
  cleanUntracked: () => {
    const untracked = get().workingFiles.filter((f) => f.state === "untracked");
    if (untracked.length === 0) return;
    set((s) => ({ workingFiles: s.workingFiles.filter((f) => f.state !== "untracked") }));
    get().logCommand(
      "git clean -fd",
      untracked.map((f) => `Removing ${f.path}`).join("\n")
    );
    dispatchRealCommand({ kind: "clean" }, set, get);
  },

  additionalRemotes: [],
  removedRemoteNames: [],
  addRemote: (name, url) => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) return "Both a name and a URL are required.";
    const s = get();
    const existing = [originRemote.name, ...s.additionalRemotes.map((r) => r.name)].filter(
      (n) => !s.removedRemoteNames.includes(n)
    );
    if (existing.includes(trimmedName)) return `Remote '${trimmedName}' already exists.`;
    set((state) => ({ additionalRemotes: [...state.additionalRemotes, { name: trimmedName, url: trimmedUrl }] }));
    get().logCommand(`git remote add ${trimmedName} ${trimmedUrl}`);
    dispatchRealCommand({ kind: "addRemote", name: trimmedName, url: trimmedUrl }, set, get);
    return null;
  },
  removeRemote: (name) => {
    if (name === originRemote.name) return "Can't remove 'origin'.";
    set((s) => ({ removedRemoteNames: [...s.removedRemoteNames, name] }));
    get().logCommand(`git remote remove ${name}`);
    dispatchRealCommand({ kind: "removeRemote", name }, set, get);
    return null;
  },
  editRemote: (name, url) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return "A URL is required.";
    // optimistic update in both places a remote can live: the hydrated real list and the
    // session-added list — the post-command snapshot refresh reconciles with ground truth.
    set((s) => ({
      remotes: s.remotes.map((r) => (r.name === name ? { ...r, url: trimmedUrl } : r)),
      additionalRemotes: s.additionalRemotes.map((r) => (r.name === name ? { ...r, url: trimmedUrl } : r)),
    }));
    get().logCommand(`git remote set-url ${name} ${trimmedUrl}`);
    dispatchRealCommand({ kind: "setRemoteUrl", name, url: trimmedUrl }, set, get);
    return null;
  },

  commitMessage: "",
  setCommitMessage: (m) => set({ commitMessage: m }),
  localCommits: [
    {
      id: "seed-1",
      hash: makeHash("seed-1-connect-wizard-to-signup-api"),
      shortHash: shortHash(makeHash("seed-1-connect-wizard-to-signup-api")),
      message: "feat(onboarding): connect wizard to signup API",
      fileCount: 2,
      files: [
        { path: "src/hooks/useOnboarding.ts", status: "modified", insertions: 12, deletions: 3 },
        { path: "src/api/billing.ts", status: "modified", insertions: 8, deletions: 0 },
      ],
      pushed: false,
    },
  ],
  amendMode: false,
  canAmend: () => {
    const s = get();
    const last = s.localCommits[s.localCommits.length - 1];
    return Boolean(last && !last.pushed);
  },
  toggleAmendMode: () => {
    const s = get();
    if (s.amendMode) {
      set({ amendMode: false, commitMessage: "" });
      return;
    }
    if (!s.canAmend()) return;
    const last = s.localCommits[s.localCommits.length - 1];
    set({ amendMode: true, commitMessage: last.message });
  },
  commitStaged: () => {
    const s = get();
    const message = s.commitMessage.trim();
    // Git refuses an empty commit message — mirror that instead of silently accepting one.
    if (message.length === 0) return;
    const branchLabel = s.currentBranchName ?? "detached HEAD";
    const fullHash = makeHash(message + Date.now());
    const newShortHash = shortHash(fullHash);

    if (s.amendMode) {
      if (!s.canAmend()) return;
      const addedFiles = s.stagedFiles.length;
      const newFiles = s.stagedFiles.map(workingFileToChange);
      set((state) => {
        const commits = [...state.localCommits];
        const last = commits[commits.length - 1];
        const mergedFiles = [...last.files];
        for (const f of newFiles) {
          const idx = mergedFiles.findIndex((existing) => existing.path === f.path);
          if (idx >= 0) mergedFiles[idx] = f;
          else mergedFiles.push(f);
        }
        commits[commits.length - 1] = {
          ...last,
          hash: fullHash,
          shortHash: newShortHash,
          message,
          fileCount: mergedFiles.length,
          files: mergedFiles,
        };
        return { localCommits: commits, stagedFiles: [], commitMessage: "", amendMode: false };
      });
      get().logCommand(
        `git commit --amend -m "${message}"`,
        `[${branchLabel} ${newShortHash}] ${message}\n Date: ${new Date().toDateString()}\n ${addedFiles} file${addedFiles !== 1 ? "s" : ""} folded in`
      );
      pushReflog(set, get, fullHash, "commit (amend)", message);
      dispatchRealCommand({ kind: "commit", message, amend: true }, set, get);
      return;
    }

    if (s.stagedFiles.length === 0) return;
    const files = s.stagedFiles.map(workingFileToChange);
    const fileCount = files.length;
    set((state) => ({
      localCommits: [
        ...state.localCommits,
        { id: `local-${Date.now()}`, hash: fullHash, shortHash: newShortHash, message, fileCount, files, pushed: false },
      ],
      stagedFiles: [],
      commitMessage: "",
    }));
    get().logCommand(
      `git commit -m "${message}"`,
      `[${branchLabel} ${newShortHash}] ${message}\n ${fileCount} file${fileCount !== 1 ? "s" : ""} changed`
    );
    pushReflog(set, get, fullHash, "commit", message);
    dispatchRealCommand({ kind: "commit", message, amend: false }, set, get);
  },

  pushedCount: 0,
  justPushed: false,
  pushAll: () => {
    const s = get();
    const unpushed = s.localCommits.filter((c) => !c.pushed).length;
    if (unpushed === 0) return;
    const branchLabel = s.currentBranchName ?? "HEAD";
    set((state) => ({
      localCommits: state.localCommits.map((c) => ({ ...c, pushed: true })),
      pushedCount: state.pushedCount + unpushed,
      justPushed: true,
    }));
    get().logCommand(
      "git push",
      `To ${originRemote.url}\n   ${branchLabel} -> ${branchLabel}`
    );
    dispatchRealCommand({ kind: "push" }, set, get);
    setTimeout(() => set({ justPushed: false }), 1400);
  },

  revertCommit: (hash) => {
    const s = get();
    if (!s.currentBranchName) return "Can't revert while HEAD is detached — switch to a branch first.";
    const dagTarget = getCommit(hash);
    const localTarget = s.localCommits.find((c) => c.hash === hash);
    if (!dagTarget && !localTarget) return "Commit not found.";
    if (dagTarget?.isMerge) return "Reverting a merge commit needs a chosen parent — not supported in this simulator.";
    const subject = dagTarget?.subject ?? localTarget!.message;
    const files = dagTarget?.files ?? localTarget!.files;
    if (files.length === 0) return "Nothing to revert — this commit didn't change any files.";

    const fullHash = makeHash("revert-" + hash + Date.now());
    const newShortHash = shortHash(fullHash);
    const branchLabel = s.currentBranchName;
    const revertMessage = `Revert "${subject}"`;
    const invertedFiles: FileChange[] = files.map((f) => ({
      path: f.path,
      status: f.status === "added" ? "deleted" : f.status === "deleted" ? "added" : f.status,
      insertions: f.deletions,
      deletions: f.insertions,
    }));
    set((state) => ({
      localCommits: [
        ...state.localCommits,
        {
          id: `local-${Date.now()}`,
          hash: fullHash,
          shortHash: newShortHash,
          message: revertMessage,
          fileCount: files.length,
          files: invertedFiles,
          pushed: false,
        },
      ],
      amendMode: false,
    }));
    get().logCommand(
      `git revert ${dagTarget?.shortHash ?? localTarget!.shortHash}`,
      `[${branchLabel} ${newShortHash}] ${revertMessage}\n ${files.length} file${files.length !== 1 ? "s" : ""} changed`
    );
    pushReflog(set, get, fullHash, "revert", revertMessage);
    dispatchRealCommand({ kind: "revert", hash }, set, get);
    return null;
  },

  undoLastCommit: () => {
    const s = get();
    if (!s.currentBranchName) return "Can't undo a commit while HEAD is detached.";
    const last = s.localCommits[s.localCommits.length - 1];
    if (!last) return "No local commits to undo.";

    if (!last.pushed) {
      const existingPaths = new Set(s.stagedFiles.map((f) => f.path));
      const restored = last.files.filter((f) => !existingPaths.has(f.path)).map(changeToWorkingFile);
      set({
        localCommits: s.localCommits.slice(0, -1),
        stagedFiles: [...s.stagedFiles, ...restored],
        commitMessage: last.message,
        amendMode: false,
      });
      get().logCommand(
        `git reset --soft HEAD~1`,
        `HEAD is now one commit behind — "${last.message}" (${last.shortHash}) is back in the staging area.`
      );
      pushReflog(set, get, s.headOverride ?? [...branches, ...s.createdBranches].find((b) => b.name === s.currentBranchName)?.headHash ?? last.hash, "reset", `undo commit ${last.shortHash}`);
      // git accepts a relative rev here just as well as a hash — no need to resolve HEAD~1
      // to a real sha before asking git itself to interpret it.
      dispatchRealCommand({ kind: "reset", hash: "HEAD~1", mode: "soft" }, set, get);
      return null;
    }

    return get().revertCommit(last.hash);
  },

  cherryPick: (hash) => {
    const s = get();
    if (!s.currentBranchName) return "Can't cherry-pick while HEAD is detached — switch to a branch first.";
    const target = getCommit(hash);
    if (!target) return "Commit not found.";
    if (target.isMerge) return "Cherry-picking a merge commit needs a chosen parent — not supported in this simulator.";
    const currentHead = s.headOverride ?? branches.find((b) => b.name === s.currentBranchName)?.headHash;
    if (currentHead && isAncestor(hash, currentHead)) return "That commit is already in your current branch's history.";

    const conflictingFiles = currentHead ? getCherryPickConflicts(hash, currentHead) : [];
    if (conflictingFiles.length > 0) {
      set({ cherryPickConflict: { hash, conflictingFiles }, cherryPickResolutions: {} });
      get().logCommand(
        `git cherry-pick ${target.shortHash}`,
        `error: could not apply ${target.shortHash}... ${target.subject}\nCONFLICT (content): Merge conflict in ${conflictingFiles.map((f) => f.path).join(", ")}\nhint: after resolving the conflicts, run "git cherry-pick --continue"`
      );
      return null;
    }

    applyCherryPick(set, get, target.hash);
    return null;
  },

  cherryPickConflict: null,
  cherryPickResolutions: {},
  resolveCherryPickFile: (path, choice) => set((s) => ({ cherryPickResolutions: { ...s.cherryPickResolutions, [path]: choice } })),

  continueCherryPick: () => {
    const s = get();
    if (!s.cherryPickConflict) return;
    const allResolved = s.cherryPickConflict.conflictingFiles.every((f) => s.cherryPickResolutions[f.path]);
    if (!allResolved) return;
    const targetHash = s.cherryPickConflict.hash;
    set({ cherryPickConflict: null, cherryPickResolutions: {} });
    applyCherryPick(set, get, targetHash, "git cherry-pick --continue");
  },

  abortCherryPick: () => {
    const s = get();
    if (!s.cherryPickConflict) return;
    set({ cherryPickConflict: null, cherryPickResolutions: {} });
    get().logCommand(`git cherry-pick --abort`, `Cherry-pick aborted — working tree restored.`);
  },
}));

function pushReflog(
  set: (partial: Partial<UIState>) => void,
  get: () => UIState,
  hash: string,
  action: string,
  description: string
) {
  const entry: ReflogEntry = {
    id: `reflog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    hash,
    action,
    description,
    timestamp: Date.now(),
  };
  set({ reflog: [entry, ...get().reflog] });
}

function applyCherryPick(
  set: (partial: Partial<UIState>) => void,
  get: () => UIState,
  targetHash: string,
  commandOverride?: string
) {
  const target = getCommit(targetHash);
  if (!target) return;
  const s = get();
  const fullHash = makeHash("cherry-" + targetHash + Date.now());
  const newShortHash = shortHash(fullHash);
  const branchLabel = s.currentBranchName;
  set({
    localCommits: [
      ...s.localCommits,
      {
        id: `local-${Date.now()}`,
        hash: fullHash,
        shortHash: newShortHash,
        message: target.subject,
        fileCount: target.files.length,
        files: target.files,
        pushed: false,
      },
    ],
    amendMode: false,
  });
  get().logCommand(
    commandOverride ?? `git cherry-pick ${target.shortHash}`,
    `[${branchLabel} ${newShortHash}] ${target.subject}\n Author: ${target.author.name}\n ${target.files.length} file${target.files.length !== 1 ? "s" : ""} changed`
  );
  pushReflog(set, get, fullHash, "cherry-pick", target.subject);
  // real conflict detection may disagree with the simulated preview above — runWithAutoAbort
  // on the host handles that regardless of what the fake preview predicted here.
  dispatchRealCommand({ kind: "cherryPick", hash: targetHash }, set, get);
}

function requestCheckout(
  set: (partial: Partial<UIState>) => void,
  get: () => UIState,
  target: CheckoutTarget,
  skipRealDispatch = false
) {
  const state = get();
  const dirty = state.workingFiles.length > 0 || state.stagedFiles.length > 0;
  if (dirty) {
    set({ pendingCheckout: target });
  } else {
    applyCheckout(set, get, target, skipRealDispatch);
  }
}

function applyCheckout(
  set: (partial: Partial<UIState>) => void,
  get: () => UIState,
  target: CheckoutTarget,
  skipRealDispatch = false
) {
  const prevRef = get().currentBranchName ?? (get().detachedHash ? shortHash(get().detachedHash!) : "HEAD");
  if (target.type === "branch") {
    set({ currentBranchName: target.name, detachedHash: null, headOverride: null, localCommits: [], pushedCount: 0, amendMode: false, commitMessage: "" });
    get().logCommand(`git switch ${target.name}`, `Switched to branch '${target.name}'`);
    const branchHead = [...branches, ...get().createdBranches].find((b) => b.name === target.name)?.headHash;
    if (branchHead) pushReflog(set, get, branchHead, "checkout", `moving from ${prevRef} to ${target.name}`);
    // createBranch() dispatches its own combined "git checkout -b" command — dispatching a
    // plain checkout here too would race it against a branch that may not exist in the real
    // repo yet.
    if (!skipRealDispatch) dispatchRealCommand({ kind: "checkoutBranch", name: target.name }, set, get);
  } else {
    set({ currentBranchName: null, detachedHash: target.hash, headOverride: null, localCommits: [], pushedCount: 0, amendMode: false, commitMessage: "" });
    get().logCommand(
      `git checkout ${shortHash(target.hash)}`,
      `Note: switching to '${shortHash(target.hash)}'.\n\nYou are in 'detached HEAD' state...\nHEAD is now at ${shortHash(target.hash)}`
    );
    pushReflog(set, get, target.hash, "checkout", `moving from ${prevRef} to ${shortHash(target.hash)}`);
    if (!skipRealDispatch) dispatchRealCommand({ kind: "checkoutCommit", hash: target.hash }, set, get);
  }
}
