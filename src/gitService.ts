import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

const RS = "\x1e"; // record separator, between commits
const FS = "\x1f"; // field separator, between fields within a commit

export interface RawFileChange {
  path: string;
  oldPath?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  insertions: number;
  deletions: number;
}

export interface RawCommit {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  authoredAt: string;
  committedAt: string;
  subject: string;
  body: string;
  refs: string[]; // decorated branch/tag names pointing here
  signStatus: string; // raw %G? code: G/B/U/X/Y/R/E/N
  files: RawFileChange[];
}

export interface RawBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  headHash: string;
  upstream?: string;
  ahead: number;
  behind: number;
  lastActivity: string;
}

export interface RawWorkingFile {
  path: string;
  oldPath?: string;
  state: "untracked" | "modified" | "staged" | "conflicted" | "deleted";
  insertions: number;
  deletions: number;
}

export interface RawStash {
  index: number;
  message: string;
  branch: string;
  createdAt: string;
}

export interface RawTag {
  name: string;
  hash: string;
}

export interface RawRemote {
  name: string;
  url: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: MAX_BUFFER });
  return stdout;
}

export class GitService {
  constructor(private repoRoot: string) {}

  static async findRepoRoot(cwd: string): Promise<string | null> {
    try {
      const out = await git(cwd, ["rev-parse", "--show-toplevel"]);
      return out.trim();
    } catch {
      return null;
    }
  }

  private static readonly LOG_FORMAT = [`${RS}%H`, "%P", "%an", "%ae", "%cn", "%ce", "%aI", "%cI", "%s", "%b", "%G?", "%D"].join(FS);

  private static parseLogOutput(out: string): RawCommit[] {
    const records = out.split(RS).filter(Boolean);
    return records.map((record) => {
      const fields = record.split(FS);
      const [hash, parentsRaw, authorName, authorEmail, committerName, committerEmail, authoredAt, committedAt, subject, body, signStatus, tail] = fields;

      // %D's output and the numstat block share the tail field, separated by whatever
      // newline git inserts after the decorate string
      const tailLines = (tail ?? "").split("\n");
      const refsRaw = tailLines[0] ?? "";
      const numstatLines = tailLines.slice(1).filter((l) => l.trim().length > 0);

      const refs = refsRaw
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => r.replace(/^HEAD -> /, "").replace(/^tag: /, ""));

      const files: RawFileChange[] = numstatLines
        .map((line) => parseNumstatLine(line))
        .filter((f): f is RawFileChange => f !== null);

      return {
        hash,
        parents: parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [],
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        authoredAt,
        committedAt,
        subject,
        body: body ?? "",
        refs,
        signStatus: signStatus ?? "N",
        files,
      };
    });
  }

  async getLog(maxCount = 300): Promise<RawCommit[]> {
    let out: string;
    try {
      out = await git(this.repoRoot, [
        "log",
        "--all",
        "--date-order",
        `--max-count=${maxCount}`,
        "--numstat",
        "-M",
        `--pretty=format:${GitService.LOG_FORMAT}`,
      ]);
    } catch {
      return []; // e.g. a brand-new repo with no commits yet
    }
    return GitService.parseLogOutput(out);
  }

  /** Backfills a branch head that `getLog`'s recency cap left out — walking backward from that
   * hash (not `--no-walk`) rather than fetching just the single commit. A lone commit with no
   * resolvable parent would fix the crash but still render as a naked, disconnected dot with no
   * line to the rest of the graph; walking its own recent history almost always reconnects it to
   * a commit the main window already loaded, since most branches fork from a point not too much
   * further back than their own tip. Bounded per branch so a genuinely ancient branch can't turn
   * this into an unbounded fetch — it'll just reconnect further back, or stay a short dangling
   * chain in the rare case its fork point is older than `perBranchCount` commits back. */
  async getAncestryBackfill(hashes: string[], perBranchCount = 60): Promise<RawCommit[]> {
    if (hashes.length === 0) return [];
    const results = await Promise.all(
      hashes.map(async (hash) => {
        try {
          const out = await git(this.repoRoot, [
            "log",
            `--max-count=${perBranchCount}`,
            "--numstat",
            "-M",
            `--pretty=format:${GitService.LOG_FORMAT}`,
            hash,
          ]);
          return GitService.parseLogOutput(out);
        } catch {
          return []; // a hash that no longer resolves (rare, e.g. race with a force-push) — skip it
        }
      })
    );
    const byHash = new Map<string, RawCommit>();
    for (const commits of results) for (const c of commits) byHash.set(c.hash, c);
    return [...byHash.values()];
  }

  async getBranches(): Promise<RawBranch[]> {
    const format = ["%(refname:short)", "%(HEAD)", "%(objectname)", "%(upstream:short)", "%(upstream:track)", "%(committerdate:iso-strict)"].join(FS);
    const out = await git(this.repoRoot, ["for-each-ref", "--format=" + format, "refs/heads", "refs/remotes"]);

    return out
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.startsWith("origin/HEAD") && !line.includes(FS + "origin/HEAD"))
      .map((line) => {
        const [name, head, hash, upstream, track, date] = line.split(FS);
        const aheadMatch = /ahead (\d+)/.exec(track ?? "");
        const behindMatch = /behind (\d+)/.exec(track ?? "");
        return {
          name,
          isCurrent: head === "*",
          isRemote: name.startsWith("origin/") || name.includes("/"),
          headHash: hash,
          upstream: upstream || undefined,
          ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
          behind: behindMatch ? Number(behindMatch[1]) : 0,
          lastActivity: date,
        };
      });
  }

  async getStatus(): Promise<RawWorkingFile[]> {
    const [statusOut, unstagedNumstat, stagedNumstat] = await Promise.all([
      git(this.repoRoot, ["status", "--porcelain=v2"]),
      git(this.repoRoot, ["diff", "--numstat"]).catch(() => ""),
      git(this.repoRoot, ["diff", "--cached", "--numstat"]).catch(() => ""),
    ]);

    const unstagedStats = parseNumstatBlock(unstagedNumstat);
    const stagedStats = parseNumstatBlock(stagedNumstat);
    const results: RawWorkingFile[] = [];

    for (const line of statusOut.split("\n")) {
      if (!line) continue;
      if (line.startsWith("? ")) {
        const path = line.slice(2);
        results.push({ path, state: "untracked", insertions: 0, deletions: 0 });
        continue;
      }
      if (line.startsWith("u ")) {
        // unmerged/conflicted — fields: u XY sub m1 m2 m3 mW h1 h2 h3 path
        const parts = line.split(" ");
        const path = parts.slice(10).join(" ");
        results.push({ path, state: "conflicted", insertions: 0, deletions: 0 });
        continue;
      }
      if (line.startsWith("1 ") || line.startsWith("2 ")) {
        const parts = line.split(" ");
        const xy = parts[1];
        // X = staged/index status, Y = worktree status beyond the index — a file can be both
        // at once (e.g. "AM": staged as added, then edited further), and needs to show up in
        // both places rather than collapsing into a single "staged" entry that silently drops
        // the fact there's also real, unstaged work sitting on top of it.
        const indexStatus = xy[0];
        const worktreeStatus = xy[1];
        let path: string;
        let oldPath: string | undefined;
        if (line.startsWith("2 ")) {
          // renamed/copied: last two whitespace-joined tokens are "new\told" split by tab
          const rest = parts.slice(9).join(" ");
          const [newPath, orig] = rest.split("\t");
          path = newPath;
          oldPath = orig;
        } else {
          path = parts.slice(8).join(" ");
        }
        if (indexStatus !== ".") {
          const stats = stagedStats.get(path);
          results.push({ path, oldPath, state: "staged", insertions: stats?.insertions ?? 0, deletions: stats?.deletions ?? 0 });
        }
        if (worktreeStatus !== ".") {
          const stats = unstagedStats.get(path);
          const state: RawWorkingFile["state"] = worktreeStatus === "D" ? "deleted" : "modified";
          results.push({ path, oldPath, state, insertions: stats?.insertions ?? 0, deletions: stats?.deletions ?? 0 });
        }
      }
    }

    return results;
  }

  async getStashes(): Promise<RawStash[]> {
    const format = ["%gd", "%s", "%cI"].join(FS);
    let out: string;
    try {
      out = await git(this.repoRoot, ["stash", "list", `--format=${format}`]);
    } catch {
      return [];
    }
    return out
      .split("\n")
      .filter(Boolean)
      .map((line, i) => {
        const [, message, date] = line.split(FS);
        const branchMatch = /^WIP on ([^:]+):/.exec(message ?? "") ?? /^On ([^:]+):/.exec(message ?? "");
        return {
          index: i,
          message: message ?? "",
          branch: branchMatch?.[1] ?? "",
          createdAt: date ?? new Date().toISOString(),
        };
      });
  }

  async getTags(): Promise<RawTag[]> {
    const out = await git(this.repoRoot, ["for-each-ref", "--format=%(refname:short)" + FS + "%(objectname)", "refs/tags"]);
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, hash] = line.split(FS);
        return { name, hash };
      });
  }

  async getHeadHash(): Promise<string | null> {
    try {
      return (await git(this.repoRoot, ["rev-parse", "HEAD"])).trim();
    } catch {
      return null; // brand-new repo with no commits yet
    }
  }

  async getUserConfig(): Promise<{ name: string; email: string }> {
    const [name, email] = await Promise.all([
      git(this.repoRoot, ["config", "user.name"]).catch(() => ""),
      git(this.repoRoot, ["config", "user.email"]).catch(() => ""),
    ]);
    return { name: name.trim() || "You", email: email.trim() || "you@local" };
  }

  async getGlobalConfig(): Promise<{ defaultBranch: string; editor: string }> {
    const [defaultBranch, editor] = await Promise.all([
      git(this.repoRoot, ["config", "--global", "init.defaultBranch"]).catch(() => ""),
      git(this.repoRoot, ["config", "--global", "core.editor"]).catch(() => ""),
    ]);
    return { defaultBranch: defaultBranch.trim() || "main", editor: editor.trim() };
  }

  async getRemotes(): Promise<RawRemote[]> {
    const out = await git(this.repoRoot, ["remote", "-v"]);
    const seen = new Map<string, string>();
    for (const line of out.split("\n")) {
      const match = /^(\S+)\s+(\S+)\s+\(fetch\)/.exec(line);
      if (match) seen.set(match[1], match[2]);
    }
    return [...seen.entries()].map(([name, url]) => ({ name, url }));
  }
}

function parseNumstatLine(line: string): RawFileChange | null {
  const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
  if (!match) return null;
  const [, insRaw, delRaw, pathRaw] = match;
  const binary = insRaw === "-" || delRaw === "-";
  const insertions = binary ? 0 : Number(insRaw);
  const deletions = binary ? 0 : Number(delRaw);

  const renameMatch = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(pathRaw);
  const arrowMatch = /^(.+) => (.+)$/.exec(pathRaw);
  if (renameMatch) {
    const [, prefix, from, to, suffix] = renameMatch;
    return { path: `${prefix}${to}${suffix}`, oldPath: `${prefix}${from}${suffix}`, status: "renamed", insertions, deletions };
  }
  if (arrowMatch) {
    return { path: arrowMatch[2], oldPath: arrowMatch[1], status: "renamed", insertions, deletions };
  }
  return { path: pathRaw, status: insertions > 0 && deletions === 0 ? "added" : "modified", insertions, deletions };
}

function parseNumstatBlock(block: string): Map<string, { insertions: number; deletions: number }> {
  const map = new Map<string, { insertions: number; deletions: number }>();
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const parsed = parseNumstatLine(line);
    if (parsed) map.set(parsed.path, { insertions: parsed.insertions, deletions: parsed.deletions });
  }
  return map;
}
