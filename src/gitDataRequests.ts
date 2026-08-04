import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import type { BlameRawLine, ConflictFileRaw, ConflictOp, DataRequest, DataResult, ReflogRawEntry } from "./protocol";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;
const FS = "\x1f";

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: MAX_BUFFER });
  return stdout;
}

const CONFLICT_MARKER_REF: Record<ConflictOp, string> = {
  merge: "MERGE_HEAD",
  revert: "REVERT_HEAD",
  cherryPick: "CHERRY_PICK_HEAD",
};

async function detectConflictOp(cwd: string): Promise<ConflictOp | null> {
  for (const op of Object.keys(CONFLICT_MARKER_REF) as ConflictOp[]) {
    try {
      await execFileAsync("git", ["rev-parse", "--verify", "-q", CONFLICT_MARKER_REF[op]], { cwd });
      return op;
    } catch {
      // this operation isn't the one in progress
    }
  }
  return null;
}

async function blobAtStage(cwd: string, stage: 2 | 3, filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `:${stage}:${filePath}`], { cwd, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch {
    return ""; // e.g. add/add or delete/modify conflicts — one side may have nothing at this stage
  }
}

/** Every currently-conflicted file, for real — surfaced during a live merge/revert/cherry-pick
 * that stopped mid-way. `oursContent`/`theirsContent` come straight from the index's stage 2/3
 * blobs; `workingContent` is what's actually on disk right now, real conflict markers and all,
 * so a "manual edit" starts from the truth instead of a synthesized approximation. */
async function getConflicts(cwd: string): Promise<{ op: ConflictOp | null; files: ConflictFileRaw[] }> {
  const op = await detectConflictOp(cwd);
  const statusOut = await git(cwd, ["status", "--porcelain"]);
  const paths = statusOut
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      const x = line[0];
      const y = line[1];
      return x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D");
    })
    .map((line) => line.slice(3).trim());

  const files = await Promise.all(
    paths.map(async (filePath): Promise<ConflictFileRaw> => {
      const [oursContent, theirsContent, workingContent] = await Promise.all([
        blobAtStage(cwd, 2, filePath),
        blobAtStage(cwd, 3, filePath),
        fs.promises.readFile(path.join(cwd, filePath), "utf-8").catch(() => ""),
      ]);
      return { path: filePath, oursContent, theirsContent, workingContent };
    })
  );

  return { op, files };
}

async function getFileDiff(cwd: string, hash: string, path: string): Promise<string> {
  const out = await git(cwd, ["show", "--unified=3", "--no-color", hash, "--", path]);
  const marker = out.indexOf("diff --git");
  return marker === -1 ? "" : out.slice(marker);
}

async function getReflog(cwd: string): Promise<ReflogRawEntry[]> {
  let out: string;
  try {
    out = await git(cwd, ["reflog", "show", `--format=%H${FS}%gs${FS}%ct`, "HEAD"]);
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      const [hash, subject, ts] = line.split(FS);
      const colonIdx = subject.indexOf(": ");
      const action = colonIdx === -1 ? subject : subject.slice(0, colonIdx);
      const description = colonIdx === -1 ? "" : subject.slice(colonIdx + 2);
      return { hash, selector: `HEAD@{${i}}`, action, description, timestamp: Number(ts) * 1000 };
    });
}

async function getBlame(cwd: string, path: string): Promise<BlameRawLine[]> {
  let out: string;
  try {
    out = await git(cwd, ["blame", "--line-porcelain", "HEAD", "--", path]);
  } catch {
    return [];
  }

  const lines = out.split("\n");
  const metaByHash = new Map<string, { authorName: string; authorEmail: string; authorTime: number; summary: string }>();
  const result: BlameRawLine[] = [];
  let i = 0;

  while (i < lines.length) {
    const header = lines[i];
    if (!header) {
      i++;
      continue;
    }
    const [hash, , finalLineRaw] = header.split(" ");
    i++;

    const meta = metaByHash.get(hash) ?? { authorName: "", authorEmail: "", authorTime: 0, summary: "" };
    while (i < lines.length && !lines[i].startsWith("\t")) {
      const line = lines[i];
      if (line.startsWith("author ")) meta.authorName = line.slice(7);
      else if (line.startsWith("author-mail ")) meta.authorEmail = line.slice(12).replace(/[<>]/g, "");
      else if (line.startsWith("author-time ")) meta.authorTime = Number(line.slice(12));
      else if (line.startsWith("summary ")) meta.summary = line.slice(8);
      i++;
    }
    metaByHash.set(hash, meta);

    const content = i < lines.length ? lines[i].slice(1) : "";
    i++;

    result.push({
      lineNo: Number(finalLineRaw),
      content,
      hash,
      authorName: meta.authorName,
      authorEmail: meta.authorEmail,
      authoredAt: new Date(meta.authorTime * 1000).toISOString(),
      subject: meta.summary,
    });
  }

  return result;
}

export async function resolveDataRequest(cwd: string, request: DataRequest): Promise<DataResult> {
  switch (request.kind) {
    case "diff":
      return { kind: "diff", diff: await getFileDiff(cwd, request.hash, request.path) };
    case "reflog":
      return { kind: "reflog", entries: await getReflog(cwd) };
    case "blame":
      return { kind: "blame", lines: await getBlame(cwd, request.path) };
    case "conflicts": {
      const { op, files } = await getConflicts(cwd);
      return { kind: "conflicts", op, files };
    }
  }
}
