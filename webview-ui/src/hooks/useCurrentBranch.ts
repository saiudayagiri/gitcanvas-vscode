import { branches } from "@/lib/mock-data";
import { useUIStore } from "@/store/ui-store";
import { commitsBetween, isAncestor } from "@/lib/git-diff";
import type { Branch } from "@/types/git";

/** Every branch that currently exists — mock data plus session-created ones, minus deleted ones. */
export function useAllBranches(): Branch[] {
  const createdBranches = useUIStore((s) => s.createdBranches);
  const deletedBranchNames = useUIStore((s) => s.deletedBranchNames);
  return [...branches, ...createdBranches].filter((b) => !deletedBranchNames.includes(b.name));
}

/** The checked-out branch, or null when HEAD is detached at a bare commit. */
export function useCurrentBranch(): Branch | null {
  const name = useUIStore((s) => s.currentBranchName);
  const all = useAllBranches();
  if (!name) return null;
  return all.find((b) => b.name === name) ?? null;
}

/** The commit HEAD currently points at — whether attached to a branch (possibly reset to a
 * different commit than the branch's mock head) or detached at a bare commit. */
export function useHeadHash(): string | undefined {
  const name = useUIStore((s) => s.currentBranchName);
  const detachedHash = useUIStore((s) => s.detachedHash);
  const headOverride = useUIStore((s) => s.headOverride);
  const all = useAllBranches();
  if (detachedHash) return detachedHash;
  if (headOverride) return headOverride;
  return all.find((b) => b.name === name)?.headHash;
}

export function useIsHeadCommit(hash: string): boolean {
  return useHeadHash() === hash;
}

/** A branch's effective tip — its mock head, unless it's the current branch and has been reset. */
export function useBranchHeadHash(branchName: string): string {
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const headOverride = useUIStore((s) => s.headOverride);
  const all = useAllBranches();
  const mockHead = all.find((b) => b.name === branchName)?.headHash ?? "";
  if (branchName === currentBranchName && headOverride) return headOverride;
  return mockHead;
}

export function useIsDetached(): boolean {
  return useUIStore((s) => s.detachedHash !== null);
}

/** A branch's "ahead" count, recomputed live if it's the current branch and has been reset. */
export function useBranchAhead(branch: { name: string; forkedFromHash?: string; ahead: number }): number {
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const headOverride = useUIStore((s) => s.headOverride);
  if (branch.name !== currentBranchName || !headOverride) return branch.ahead;
  if (!branch.forkedFromHash) return branch.ahead;
  if (isAncestor(headOverride, branch.forkedFromHash)) return 0;
  return commitsBetween(branch.forkedFromHash, headOverride).length;
}
