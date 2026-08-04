import type { RawCommit } from "./gitService";

/** Nearest common ancestor of the two hashes, walking parents via the in-memory commit map. */
export function mergeBase(hashA: string, hashB: string, byHash: Map<string, RawCommit>): string | null {
  if (hashA === hashB) return hashA;
  const ancestorsA = new Set<string>();
  const collect = (hash: string) => {
    if (ancestorsA.has(hash)) return;
    ancestorsA.add(hash);
    byHash.get(hash)?.parents.forEach(collect);
  };
  collect(hashA);

  const seenB = new Set<string>();
  const find = (hash: string): string | null => {
    if (ancestorsA.has(hash)) return hash;
    if (seenB.has(hash)) return null;
    seenB.add(hash);
    const c = byHash.get(hash);
    if (!c) return null;
    for (const p of c.parents) {
      const found = find(p);
      if (found) return found;
    }
    return null;
  };
  return find(hashB);
}

/** Every commit reachable from `tipHash` down to (but excluding) `baseHash`. */
export function commitsBetween(baseHash: string | null, tipHash: string, byHash: Map<string, RawCommit>): RawCommit[] {
  const result: RawCommit[] = [];
  const seen = new Set<string>();
  const walk = (hash: string) => {
    if (hash === baseHash || seen.has(hash)) return;
    seen.add(hash);
    const c = byHash.get(hash);
    if (!c) return;
    result.push(c);
    c.parents.forEach(walk);
  };
  walk(tipHash);
  return result;
}
