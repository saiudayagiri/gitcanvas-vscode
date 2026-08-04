import type { Commit } from "@/types/git";
import type { FileRecord } from "./file-history";
import { fnv1a } from "./hash";
import { SNIPPETS, extOf, seededPick } from "./diff-content";

export interface BlameLine {
  lineNo: number;
  content: string;
  commit: Commit;
}

/**
 * Deterministic, plausible per-line blame: the file's oldest (creation) commit owns
 * every line to start, then each later commit "touches" a seeded subset of lines
 * proportional to its insertion+deletion count — mirroring how real blame concentrates
 * old, untouched code under early commits and recent edits under a handful of lines.
 */
export function getBlame(record: FileRecord): BlameLine[] {
  const chronological = [...record.events].reverse(); // oldest first
  const creation = chronological[0];
  if (!creation) return [];

  const pool = SNIPPETS[extOf(record.path)];
  const baseSeed = fnv1a(record.path);
  const totalLines = 14 + (baseSeed % 34);

  const owner: Commit[] = new Array(totalLines).fill(creation.commit);
  const content: string[] = Array.from({ length: totalLines }, (_, i) => seededPick(pool, baseSeed, i));

  for (let idx = 1; idx < chronological.length; idx++) {
    const ev = chronological[idx];
    const touch = Math.max(1, Math.min(Math.round((ev.change.insertions + ev.change.deletions) / 4), totalLines));
    const seed = fnv1a(ev.commit.hash + record.path);
    const start = seed % totalLines;
    for (let k = 0; k < touch; k++) {
      const lineIdx = (start + k) % totalLines;
      owner[lineIdx] = ev.commit;
      content[lineIdx] = seededPick(pool, seed, k);
    }
  }

  return content.map((c, i) => ({ lineNo: i + 1, content: c, commit: owner[i] }));
}
