import type { Commit } from "@/types/git";
import { branches, getCommit, mainBranch } from "./mock-data";
import { commitsBetween } from "./git-diff";

export interface RebasePlan {
  branchName: string;
  base: Commit | null;
  originalCommits: Commit[]; // chronological, oldest first
}

/** Returns a plan with `base: null` and no commits when the branch or main's tip commit
 * doesn't exist — e.g. a freshly-initialized repo with zero commits, or a branch name
 * that hasn't been picked yet. Callers must guard on `plan.base` before reading it. */
export function getRebasePlan(branchName: string): RebasePlan {
  const branch = branches.find((b) => b.name === branchName);
  const base = getCommit(mainBranch().headHash) ?? null;
  const originalCommits = branch?.forkedFromHash && base ? commitsBetween(branch.forkedFromHash, branch.headHash) : [];
  return { branchName, base, originalCommits };
}
