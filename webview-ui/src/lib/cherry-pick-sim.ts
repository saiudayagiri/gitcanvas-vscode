import { getCommit } from "./mock-data";
import { changesSince, mergeBase } from "./git-diff";

export interface CherryPickConflictFile {
  path: string;
  oursInsertions: number; // what the current branch changed since the common ancestor
  oursDeletions: number;
  theirsInsertions: number; // what the picked commit changes in the file
  theirsDeletions: number;
}

/** Files the picked commit touches that the current branch also touched since their common ancestor. */
export function getCherryPickConflicts(targetHash: string, currentHeadHash: string): CherryPickConflictFile[] {
  const target = getCommit(targetHash);
  if (!target) return [];
  const parentHash = target.parents[0] ?? targetHash;
  const base = mergeBase(currentHeadHash, parentHash);
  const ourChanges = changesSince(base, currentHeadHash);

  return target.files
    .filter((f) => ourChanges.has(f.path))
    .map((f) => {
      const ours = ourChanges.get(f.path)!;
      return {
        path: f.path,
        oursInsertions: ours.insertions,
        oursDeletions: ours.deletions,
        theirsInsertions: f.insertions,
        theirsDeletions: f.deletions,
      };
    });
}
