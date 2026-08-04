import { useMemo } from "react";
import type { Commit } from "@/types/git";
import { currentUser } from "@/lib/mock-data";
import { useUIStore } from "@/store/ui-store";
import { useCurrentBranch, useHeadHash } from "./useCurrentBranch";

/**
 * Synthesizes real `Commit` objects for this session's local commits (made via the Working
 * Tree page) — chained onto the current branch's actual DAG head — so they can be rendered
 * in the Commit Graph and opened in the Commit Inspector just like any seeded commit.
 * Local commits only exist while HEAD is attached to a branch; detached HEAD never has them.
 */
export function useLocalGraphCommits(): Commit[] {
  const localCommits = useUIStore((s) => s.localCommits);
  const currentBranch = useCurrentBranch();
  const dagHeadHash = useHeadHash();
  const gitConfig = useUIStore((s) => s.gitConfig);

  return useMemo(() => {
    if (!currentBranch || localCommits.length === 0) return [];
    const author = { ...currentUser, name: gitConfig.userName, email: gitConfig.userEmail };
    const now = Date.now();
    let parentHash = dagHeadHash;

    return localCommits.map((lc, i) => {
      const commit: Commit = {
        hash: lc.hash,
        shortHash: lc.shortHash,
        parents: parentHash ? [parentHash] : [],
        author,
        committer: author,
        // spaced 1ms apart, oldest first, so they sort after every real commit and stay in order among themselves
        authoredAt: new Date(now - (localCommits.length - i) * 1000).toISOString(),
        committedAt: new Date(now - (localCommits.length - i) * 1000).toISOString(),
        subject: lc.message,
        branch: currentBranch.name,
        lane: currentBranch.lane,
        refs: [],
        isMerge: false,
        files: lc.files,
        stats: {
          insertions: lc.files.reduce((a, f) => a + f.insertions, 0),
          deletions: lc.files.reduce((a, f) => a + f.deletions, 0),
        },
        gpgSigned: false,
        command: lc.pushed ? "git push" : "git commit",
      };
      parentHash = commit.hash;
      return commit;
    });
  }, [localCommits, currentBranch, dagHeadHash, gitConfig]);
}
