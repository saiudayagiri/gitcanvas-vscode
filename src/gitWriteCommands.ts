import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import type { ConflictOp, GitCommand } from "./protocol";

const execFileAsync = promisify(execFile);

/** Thrown by merge/revert/cherry-pick instead of auto-aborting when the failure is a real,
 * resolvable conflict (as opposed to some unrelated failure like a bad ref or a dirty working
 * tree, where nothing ever started and there's nothing to resolve). Callers — panel.ts — catch
 * this specifically and tell the webview to open the real conflict-resolution flow instead of
 * surfacing a plain error. */
export class GitConflictError extends Error {
  constructor(public op: ConflictOp, message: string) {
    super(message);
  }
}

async function refExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--verify", "-q", ref], { cwd });
    return true;
  } catch {
    return false;
  }
}

const CONFLICT_MARKER_REF: Record<ConflictOp, string> = {
  merge: "MERGE_HEAD",
  revert: "REVERT_HEAD",
  cherryPick: "CHERRY_PICK_HEAD",
};

/** Runs a command that can leave the repo mid-conflict. On failure, checks whether the
 * operation is genuinely still in progress (its marker ref exists) — if so, throws
 * GitConflictError so the caller can open the real resolve/continue/abort flow. If the marker
 * ref doesn't exist, the failure had nothing to do with a resolvable conflict (bad branch name,
 * dirty tree blocking the operation, etc.) and is rethrown as-is; nothing started, so there's
 * nothing to abort. */
async function runConflictable(cwd: string, op: ConflictOp, args: string[]): Promise<string> {
  try {
    return await git(cwd, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (await refExists(cwd, CONFLICT_MARKER_REF[op])) throw new GitConflictError(op, message);
    throw err;
  }
}

async function blobAtStage(cwd: string, stage: 2 | 3, filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `:${stage}:${filePath}`], { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch {
    return ""; // e.g. add/add or delete/modify conflicts — one side may have nothing at this stage
  }
}

/** Every invocation here goes through execFile with an argument array — never a shell
 * string — so commit messages, branch names, etc. (all user-supplied) can't be interpreted
 * as shell syntax. Rebase auto-aborts on any failure via runWithAutoAbort, since driving its
 * interactive machinery for real isn't wired up yet. Merge, revert, and cherry-pick instead
 * surface a real conflict through GitConflictError/runConflictable so the webview can drive an
 * actual per-file resolve → continue (or abort) flow. `reset --hard`, `clean -fd`, and
 * `push --force-with-lease` are all included since the UI gates each of them behind an
 * explicit two-step confirmation before ever sending the command.
 *
 * Returns the real combined stdout+stderr text (git puts most human-readable status output
 * on stderr, e.g. `push`'s "To github.com:...") so the toy terminal can show what git
 * actually printed instead of a scripted approximation. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, { cwd });
  return [stdout, stderr].filter(Boolean).join("\n").trim();
}

async function hasUpstream(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd });
    return true;
  } catch {
    return false;
  }
}

/** Attempts a command that can leave the repo mid-operation on conflict (merge, rebase,
 * revert, cherry-pick) — and if it fails for any reason, immediately runs the matching
 * `--abort` so the repo is never left half-applied for a UI that can't drive real conflict
 * resolution. The original git error (not the abort's) is what the caller sees. */
async function runWithAutoAbort(cwd: string, args: string[], abortArgs: string[]): Promise<string> {
  try {
    return await git(cwd, args);
  } catch (err) {
    try {
      await git(cwd, abortArgs);
    } catch {
      // best-effort — if the abort itself fails there's nothing more to safely automate
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message}\n\nAutomatically aborted — this needs manual conflict resolution in a terminal.`);
  }
}

/** Runs a real git command and returns what git actually printed. */
export async function runGitCommand(repoRoot: string, command: GitCommand): Promise<string> {
  switch (command.kind) {
    case "stage":
      return git(repoRoot, ["add", "--", command.path]);
    case "unstage":
      // `restore --staged` unstages by copying HEAD's version back into the index — before the
      // first commit there is no HEAD, and git itself tells you to use `rm --cached` instead.
      return (await refExists(repoRoot, "HEAD"))
        ? git(repoRoot, ["restore", "--staged", "--", command.path])
        : git(repoRoot, ["rm", "--cached", "-r", "--", command.path]);
    case "stageAll":
      return git(repoRoot, ["add", "-A"]);
    case "unstageAll":
      return (await refExists(repoRoot, "HEAD"))
        ? git(repoRoot, ["restore", "--staged", "."])
        : git(repoRoot, ["rm", "--cached", "-r", "--", "."]);
    case "discard":
      return command.wasUntracked
        ? git(repoRoot, ["clean", "-f", "--", command.path])
        : git(repoRoot, ["restore", "--", command.path]);
    case "commit": {
      const message = command.message.trim();
      if (!message) throw new Error("Aborting commit due to empty commit message.");
      const args = command.amend ? ["commit", "--amend", "-m", message] : ["commit", "-m", message];
      return git(repoRoot, args);
    }
    case "push":
      return (await hasUpstream(repoRoot)) ? git(repoRoot, ["push"]) : git(repoRoot, ["push", "-u", "origin", "HEAD"]);
    case "fetch":
      return git(repoRoot, ["fetch", "--all"]);
    case "pull":
      return git(repoRoot, ["pull"]);
    case "checkoutBranch":
      return git(repoRoot, ["switch", command.name]);
    case "checkoutCommit":
      return git(repoRoot, ["checkout", "--detach", command.hash]);
    case "createBranch":
      return git(repoRoot, ["checkout", "-b", command.name]);
    case "deleteBranch":
      return git(repoRoot, ["branch", command.force ? "-D" : "-d", command.name]);
    case "stashPush":
      // -u (--include-untracked) so the stash truly matches what the UI shows being set aside —
      // plain `git stash push` silently leaves untracked files behind (and outright refuses with
      // "No local changes to save" when untracked files are all you have).
      return command.message
        ? git(repoRoot, ["stash", "push", "-u", "-m", command.message])
        : git(repoRoot, ["stash", "push", "-u"]);
    case "stashApply":
      return git(repoRoot, ["stash", "apply", `stash@{${command.index}}`]);
    case "stashPop":
      return git(repoRoot, ["stash", "pop", `stash@{${command.index}}`]);
    case "stashDrop":
      return git(repoRoot, ["stash", "drop", `stash@{${command.index}}`]);
    case "createTag":
      return git(repoRoot, ["tag", command.name, command.hash]);
    case "deleteTag":
      return git(repoRoot, ["tag", "-d", command.name]);
    case "reset":
      return git(repoRoot, ["reset", `--${command.mode}`, command.hash]);
    case "revert":
      return runConflictable(repoRoot, "revert", ["revert", "--no-edit", command.hash]);
    case "cherryPick":
      return runConflictable(repoRoot, "cherryPick", ["cherry-pick", command.hash]);
    case "merge":
      return runConflictable(repoRoot, "merge", ["merge", "--no-edit", command.branchName]);
    case "rebase":
      return runWithAutoAbort(repoRoot, ["rebase", command.branchName], ["rebase", "--abort"]);
    case "clean":
      return git(repoRoot, ["clean", "-fd"]);
    case "pushForce":
      // --force-with-lease refuses to overwrite the remote if someone else pushed since our
      // last fetch — a real safety net that raw --force doesn't have, without changing what
      // the UI calls this action.
      return (await hasUpstream(repoRoot))
        ? git(repoRoot, ["push", "--force-with-lease"])
        : git(repoRoot, ["push", "--force", "-u", "origin", "HEAD"]);
    case "addRemote":
      return git(repoRoot, ["remote", "add", command.name, command.url]);
    case "setRemoteUrl":
      return git(repoRoot, ["remote", "set-url", command.name, command.url]);
    case "removeRemote":
      return git(repoRoot, ["remote", "remove", command.name]);
    case "setConfig":
      return git(repoRoot, ["config", "--global", command.key, command.value]);
    case "resolveConflictFile":
      return resolveConflictFile(repoRoot, command.path, command.resolution, command.content);
    case "continueConflictOp":
      // -c core.editor=true suppresses the editor that --continue would otherwise open for the
      // default commit message (merge/revert/cherry-pick all accept --continue as of modern git).
      return git(repoRoot, ["-c", "core.editor=true", CONFLICT_GIT_SUBCOMMAND[command.op], "--continue"]);
    case "abortConflictOp":
      return git(repoRoot, [CONFLICT_GIT_SUBCOMMAND[command.op], "--abort"]);
  }
}

/** https/ssh/git protocols or scp-style git@host:path — and never anything starting with "-",
 * so a malicious "URL" can't smuggle in an extra git flag (execFile already rules out shell
 * injection; this rules out argument injection). file:// and plain local paths are accepted
 * too, which keeps the flow testable and lets people clone a repo they already have on disk. */
const CLONE_URL_PATTERN = /^(https?:\/\/|ssh:\/\/|git:\/\/|file:\/\/|[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:|\.{0,2}\/|[A-Za-z0-9])/;

export function cloneTargetDirName(url: string): string {
  const base = url.replace(/\/+$/, "").split(/[/:]/).pop() ?? "repository";
  return base.replace(/\.git$/, "") || "repository";
}

/** Runs a real `git clone` of `url` into `parentDir/<repo-name>` and returns both git's output
 * and the destination path. Separated from the VS Code dialog flow in panel.ts so the actual
 * clone behavior is directly testable. */
export async function cloneRepository(url: string, parentDir: string): Promise<{ output: string; dest: string }> {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("-") || !CLONE_URL_PATTERN.test(trimmed)) {
    throw new Error(`'${trimmed}' doesn't look like a valid repository URL.`);
  }
  const dest = path.join(parentDir, cloneTargetDirName(trimmed));
  if (fs.existsSync(dest)) {
    throw new Error(`Destination '${dest}' already exists — remove it or clone somewhere else.`);
  }
  const { stdout, stderr } = await execFileAsync("git", ["clone", "--", trimmed, dest], {
    cwd: parentDir,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { output: [stdout, stderr].filter(Boolean).join("\n").trim(), dest };
}

const CONFLICT_GIT_SUBCOMMAND: Record<ConflictOp, string> = {
  merge: "merge",
  revert: "revert",
  cherryPick: "cherry-pick",
};

/** Applies the user's real choice for one conflicted file and stages it — the same three
 * moves a person would make by hand: `checkout --ours`/`--theirs` for the quick picks, writing
 * a combined or hand-edited file for "both"/manual, then `git add`. */
async function resolveConflictFile(
  repoRoot: string,
  filePath: string,
  resolution: "ours" | "theirs" | "both" | "manual",
  content: string | undefined
): Promise<string> {
  if (resolution === "ours") {
    await git(repoRoot, ["checkout", "--ours", "--", filePath]);
  } else if (resolution === "theirs") {
    await git(repoRoot, ["checkout", "--theirs", "--", filePath]);
  } else if (resolution === "both") {
    const [ours, theirs] = await Promise.all([blobAtStage(repoRoot, 2, filePath), blobAtStage(repoRoot, 3, filePath)]);
    fs.writeFileSync(path.join(repoRoot, filePath), ours + theirs);
  } else {
    fs.writeFileSync(path.join(repoRoot, filePath), content ?? "");
  }
  return git(repoRoot, ["add", "--", filePath]);
}
