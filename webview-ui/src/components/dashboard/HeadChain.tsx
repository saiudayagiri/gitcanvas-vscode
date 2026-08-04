import { AnimatePresence, motion } from "framer-motion";
import { Dot, GitBranch, GitCommitHorizontal, AlertTriangle } from "lucide-react";
import { getCommit } from "@/lib/mock-data";
import { Avatar } from "../ui/Avatar";
import { useUIStore } from "@/store/ui-store";
import { useCurrentBranch, useHeadHash } from "@/hooks/useCurrentBranch";
import { useLocalGraphCommits } from "@/hooks/useLocalGraphCommits";

function Connector({ delay = 0, color = "var(--color-git-branch)" }: { delay?: number; color?: string }) {
  return (
    <div className="relative mx-1 flex h-px w-10 items-center sm:w-14">
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: "left" }}
        className="h-px w-full origin-left border-t border-dashed border-[var(--border-strong)]"
      />
      <motion.div
        animate={{ x: [0, 40, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: delay + 0.4 }}
        className="absolute -top-[3px] left-0"
      >
        <Dot size={16} style={{ color }} />
      </motion.div>
    </div>
  );
}

export function HeadChain() {
  const currentBranch = useCurrentBranch();
  const headHash = useHeadHash();
  const localGraphCommits = useLocalGraphCommits();
  const commit = localGraphCommits[localGraphCommits.length - 1] ?? (headHash ? getCommit(headHash) : undefined);
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const detached = !currentBranch;

  if (!commit) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div key={currentBranch?.name ?? commit.hash}>
      <div className="flex flex-wrap items-center gap-y-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 rounded-xl border border-git-branch/30 bg-git-branch/10 px-3.5 py-2"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-git-branch opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-git-branch" />
          </span>
          <span className="font-mono text-[13px] font-semibold text-git-branch">HEAD</span>
        </motion.div>

        <Connector delay={0.1} color={detached ? "var(--color-git-staged)" : "var(--color-git-branch)"} />

        {detached ? (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex items-center gap-2 rounded-xl border border-git-staged/30 bg-git-staged/10 px-3.5 py-2"
          >
            <AlertTriangle size={14} className="text-git-staged" />
            <span className="text-[13px] font-semibold text-git-staged">detached HEAD</span>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3.5 py-2"
          >
            <GitBranch size={14} className="text-[var(--text-secondary)]" />
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">{currentBranch.name}</span>
            {!currentBranch.upstream && (
              <span className="rounded-full bg-git-history/15 px-1.5 py-0.5 text-[10px] font-medium text-git-history">
                not published
              </span>
            )}
          </motion.div>
        )}

        <Connector delay={0.3} color={detached ? "var(--color-git-staged)" : "var(--color-git-branch)"} />

        <motion.button
          onClick={() => inspectCommit(commit.hash)}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="focus-ring group flex items-center gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] py-2 pl-2 pr-3.5 text-left transition-colors hover:border-git-commit/40 hover:bg-git-commit/8"
        >
          <Avatar author={commit.author} size={24} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="mono-hash text-[12px] text-git-commit">{commit.shortHash}</span>
              <span className="text-[13px] font-medium text-[var(--text-primary)] truncate max-w-[240px]">
                {commit.subject}
              </span>
            </div>
          </div>
        </motion.button>
      </div>
      {detached && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-git-staged">
          <GitCommitHorizontal size={12} />
          You're browsing history, not a branch. New commits here won't belong to anything unless you create a
          branch from this point.
        </p>
      )}
      </motion.div>
    </AnimatePresence>
  );
}
