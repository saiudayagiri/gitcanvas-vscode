import type { Commit } from "@/types/git";
import { branches, mainBranch, getCommit } from "./mock-data";
import { makeHash, shortHash } from "./hash";
import { commitsBetween, changesSince } from "./git-diff";

export type RebaseAction = "pick" | "reword" | "edit" | "squash" | "fixup" | "drop";

export interface TodoItem {
  id: string; // = original commit hash, stable across reorders
  commit: Commit;
  action: RebaseAction;
  message: string; // editable subject, used verbatim for "reword" and as the group's subject for "pick"/"edit"
}

export interface RebaseGroupConflictFile {
  path: string;
  oursInsertions: number;
  oursDeletions: number;
  theirsInsertions: number;
  theirsDeletions: number;
}

export interface RebaseGroup {
  id: string;
  headAction: "pick" | "reword" | "edit";
  members: TodoItem[]; // head item first, then any folded squash/fixup items
  message: string;
  newHash: string;
  newShortHash: string;
  conflictingFiles: RebaseGroupConflictFile[];
}

/** The branch's commits since it forked from main, oldest first, each defaulted to "pick". */
export function buildTodo(branchName: string): TodoItem[] {
  const branch = branches.find((b) => b.name === branchName);
  if (!branch?.forkedFromHash) return [];
  const commits = commitsBetween(branch.forkedFromHash, branch.headHash);
  return commits.map((c) => ({ id: c.hash, commit: c, action: "pick" as RebaseAction, message: c.subject }));
}

/** Folds squash/fixup items into the preceding pick/reword/edit, and computes each group's would-be hash and conflicts. */
export function buildGroups(branchName: string, todo: TodoItem[]): RebaseGroup[] {
  const branch = branches.find((b) => b.name === branchName);
  const base = getCommit(mainBranch().headHash);
  if (!branch || !base) return [];
  const mainChanges = branch.forkedFromHash
    ? changesSince(branch.forkedFromHash, mainBranch().headHash)
    : new Map<string, { insertions: number; deletions: number }>();

  const groups: RebaseGroup[] = [];
  for (const item of todo) {
    if (item.action === "drop") continue;
    if ((item.action === "squash" || item.action === "fixup") && groups.length > 0) {
      groups[groups.length - 1].members.push(item);
      continue;
    }
    groups.push({
      id: item.id,
      headAction: item.action === "squash" || item.action === "fixup" ? "pick" : item.action,
      members: [item],
      message: item.message,
      newHash: "",
      newShortHash: "",
      conflictingFiles: [],
    });
  }

  let parentHash = base.hash;
  for (const g of groups) {
    const newHash = makeHash(g.members.map((m) => m.commit.hash).join("+") + "-onto-" + parentHash);
    parentHash = newHash;
    g.newHash = newHash;
    g.newShortHash = shortHash(newHash);

    const fileMap = new Map<string, { insertions: number; deletions: number }>();
    for (const m of g.members) {
      for (const f of m.commit.files) {
        const prev = fileMap.get(f.path) ?? { insertions: 0, deletions: 0 };
        fileMap.set(f.path, { insertions: prev.insertions + f.insertions, deletions: prev.deletions + f.deletions });
      }
    }
    g.conflictingFiles = [...fileMap.entries()]
      .filter(([path]) => mainChanges.has(path))
      .map(([path, stat]) => {
        const main = mainChanges.get(path)!;
        return {
          path,
          oursInsertions: main.insertions,
          oursDeletions: main.deletions,
          theirsInsertions: stat.insertions,
          theirsDeletions: stat.deletions,
        };
      });
  }

  return groups;
}
