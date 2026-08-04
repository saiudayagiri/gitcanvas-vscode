import type { Commit } from "@/types/git";
import { getCommit } from "./mock-data";

/** Aggregate file changes for every commit reachable from `tipHash` down to (but excluding) `baseHash`. */
export function changesSince(baseHash: string, tipHash: string): Map<string, { insertions: number; deletions: number }> {
  const changes = new Map<string, { insertions: number; deletions: number }>();
  const seen = new Set<string>();
  const walk = (hash: string) => {
    if (hash === baseHash || seen.has(hash)) return;
    seen.add(hash);
    const c = getCommit(hash);
    if (!c) return;
    for (const f of c.files) {
      const prev = changes.get(f.path) ?? { insertions: 0, deletions: 0 };
      changes.set(f.path, { insertions: prev.insertions + f.insertions, deletions: prev.deletions + f.deletions });
    }
    for (const p of c.parents) walk(p);
  };
  walk(tipHash);
  return changes;
}

/** The commits reachable from `tipHash` down to (but excluding) `baseHash`, oldest first. */
export function commitsBetween(baseHash: string, tipHash: string): Commit[] {
  const result: Commit[] = [];
  const seen = new Set<string>();
  const walk = (hash: string) => {
    if (hash === baseHash || seen.has(hash)) return;
    seen.add(hash);
    const c = getCommit(hash);
    if (!c) return;
    result.push(c);
    for (const p of c.parents) walk(p);
  };
  walk(tipHash);
  return result.reverse();
}

/** True if `candidateHash` is `fromHash` itself or one of its ancestors. */
export function isAncestor(candidateHash: string, fromHash: string): boolean {
  if (candidateHash === fromHash) return true;
  const seen = new Set<string>();
  const walk = (hash: string): boolean => {
    if (hash === candidateHash) return true;
    if (seen.has(hash)) return false;
    seen.add(hash);
    const c = getCommit(hash);
    if (!c) return false;
    return c.parents.some(walk);
  };
  return walk(fromHash);
}

/** Nearest common ancestor of the two commits (walks `hashB`'s ancestry, checking membership in `hashA`'s). */
export function mergeBase(hashA: string, hashB: string): string {
  const ancestorsA = new Set<string>();
  const collect = (hash: string) => {
    if (ancestorsA.has(hash)) return;
    ancestorsA.add(hash);
    const c = getCommit(hash);
    c?.parents.forEach(collect);
  };
  collect(hashA);

  const seenB = new Set<string>();
  const find = (hash: string): string | null => {
    if (ancestorsA.has(hash)) return hash;
    if (seenB.has(hash)) return null;
    seenB.add(hash);
    const c = getCommit(hash);
    if (!c) return null;
    for (const p of c.parents) {
      const found = find(p);
      if (found) return found;
    }
    return null;
  };
  return find(hashB) ?? hashA;
}
