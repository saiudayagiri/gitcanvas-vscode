import type { RawCommit } from "./gitService";

interface ActiveLane {
  hash: string; // the commit this lane is waiting to see next
}

/**
 * Assigns each commit a stable lane number from real DAG topology — a simplified version
 * of the algorithm `git log --graph` uses: each lane tracks the next hash it expects, first
 * parents continue their lane, merge parents fork new (or rejoin existing) lanes, and lanes
 * are freed and reused once their chain bottoms out. Not crossing-minimized like a dedicated
 * graph layout engine, but topologically correct and stable commit-to-commit.
 *
 * `commits` must be newest-first (as `git log --date-order` produces).
 *
 * `priorityHeadHashes` — branch tip hashes in the order they should win ties at a shared fork
 * point. Without this, whichever branch's tip commit happens to be chronologically newest claims
 * the low lane first, so which of two forked branches reads as "the trunk continuing straight"
 * vs. "the one that forks off" can flip arbitrarily between refreshes. Pre-claiming a lane for
 * each priority tip before the chronological scan begins makes that outcome stable: the same
 * branch always keeps the straight lane through the same fork, regardless of commit timing.
 */
export function assignLanes(commits: RawCommit[], priorityHeadHashes: string[] = []): Map<string, number> {
  const laneOf = new Map<string, number>();
  const active: (ActiveLane | null)[] = [];

  const allocate = (hash: string): number => {
    const freeIdx = active.findIndex((l) => l === null);
    const idx = freeIdx === -1 ? active.length : freeIdx;
    active[idx] = { hash };
    return idx;
  };

  const commitHashes = new Set(commits.map((c) => c.hash));
  for (const hash of priorityHeadHashes) {
    if (commitHashes.has(hash) && !active.some((l) => l?.hash === hash)) allocate(hash);
  }

  for (const commit of commits) {
    let idx = active.findIndex((l) => l?.hash === commit.hash);
    if (idx === -1) idx = allocate(commit.hash);
    laneOf.set(commit.hash, idx);

    // A fork/merge convergence point: some other lane was *also* waiting for this exact
    // commit (it's the shared ancestor two chains both lead back to). That other lane's own
    // unique history ends right here — free it now so it's immediately available for reuse by
    // whatever unrelated branch needs a lane next, further down. Without this, that lane just
    // sits on a stale, never-matching hash forever, permanently reserving its column for the
    // rest of the graph even though nothing is actually using it there.
    for (let i = 0; i < active.length; i++) {
      if (i !== idx && active[i]?.hash === commit.hash) active[i] = null;
    }

    const [firstParent, ...restParents] = commit.parents;
    active[idx] = firstParent ? { hash: firstParent } : null;

    for (const parent of restParents) {
      if (!active.some((l) => l?.hash === parent)) {
        allocate(parent);
      }
    }
  }

  return laneOf;
}
