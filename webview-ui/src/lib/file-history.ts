import type { Commit, FileChange } from "@/types/git";
import { commits } from "./mock-data";

export interface FileEvent {
  commit: Commit;
  change: FileChange;
}

export interface FileRecord {
  path: string;
  events: FileEvent[]; // sorted newest first
  renameChain: string[]; // oldest -> newest path names
  totalInsertions: number;
  totalDeletions: number;
  contributors: Set<string>;
}

function resolveFinalPath(path: string, renameMap: Map<string, string>): string {
  let current = path;
  const seen = new Set<string>();
  while (renameMap.has(current) && !seen.has(current)) {
    seen.add(current);
    current = renameMap.get(current)!;
  }
  return current;
}

export function buildFileIndex(): Map<string, FileRecord> {
  const renameMap = new Map<string, string>();
  for (const c of commits) {
    for (const f of c.files) {
      if (f.status === "renamed" && f.oldPath) renameMap.set(f.oldPath, f.path);
    }
  }

  const sorted = [...commits].sort((a, b) => +new Date(a.committedAt) - +new Date(b.committedAt));

  const records = new Map<string, FileRecord>();
  for (const c of sorted) {
    for (const f of c.files) {
      const finalPath = resolveFinalPath(f.path, renameMap);
      let rec = records.get(finalPath);
      if (!rec) {
        rec = { path: finalPath, events: [], renameChain: [], totalInsertions: 0, totalDeletions: 0, contributors: new Set() };
        records.set(finalPath, rec);
      }
      rec.events.push({ commit: c, change: f });
      rec.totalInsertions += f.insertions;
      rec.totalDeletions += f.deletions;
      rec.contributors.add(c.author.id);
      if (f.status === "renamed" && f.oldPath && !rec.renameChain.includes(f.oldPath)) {
        rec.renameChain.push(f.oldPath);
      }
    }
  }

  for (const rec of records.values()) {
    rec.events.reverse(); // newest first
    rec.renameChain.push(rec.path);
  }

  return records;
}

export function fileList(): FileRecord[] {
  return [...buildFileIndex().values()].sort(
    (a, b) => +new Date(b.events[0].commit.committedAt) - +new Date(a.events[0].commit.committedAt)
  );
}
