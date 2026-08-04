import { branches, mainBranch } from "./mock-data";
import { changesSince } from "./git-diff";

export interface MergeFileResult {
  path: string;
  oursInsertions: number;
  oursDeletions: number;
  theirsInsertions: number;
  theirsDeletions: number;
  conflict: boolean;
}

export interface MergeSimResult {
  branchName: string;
  files: MergeFileResult[];
  conflicts: MergeFileResult[];
  clean: MergeFileResult[];
  fastForward: boolean;
}

export function simulateMerge(branchName: string): MergeSimResult {
  const branch = branches.find((b) => b.name === branchName)!;
  const forkHash = branch.forkedFromHash ?? mainBranch().headHash;

  const theirs = changesSince(forkHash, branch.headHash);
  const ours = changesSince(forkHash, mainBranch().headHash);

  const allPaths = new Set([...theirs.keys(), ...ours.keys()]);
  const files: MergeFileResult[] = [...allPaths].map((path) => {
    const t = theirs.get(path);
    const o = ours.get(path);
    return {
      path,
      oursInsertions: o?.insertions ?? 0,
      oursDeletions: o?.deletions ?? 0,
      theirsInsertions: t?.insertions ?? 0,
      theirsDeletions: t?.deletions ?? 0,
      conflict: Boolean(t && o),
    };
  });

  return {
    branchName,
    files,
    conflicts: files.filter((f) => f.conflict),
    clean: files.filter((f) => !f.conflict),
    fastForward: ours.size === 0,
  };
}

// A function, not a snapshot const — `branches` may be replaced wholesale by hydrate() after
// this module first loads, so this has to re-filter the live array on every call.
export function mergeableBranches() {
  return branches.filter((b) => b.kind === "local" && b.name !== mainBranch().name && !b.mergedIntoHash);
}
