import { motion } from "framer-motion";
import { GitBranch, Cloud, ArrowUp, ArrowDown, ShieldAlert, Clock, ArrowRightLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Branch } from "@/types/git";
import { authors, getCommit, timeAgo } from "@/lib/mock-data";
import { AvatarStack } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { useUIStore } from "@/store/ui-store";
import { useBranchHeadHash, useBranchAhead } from "@/hooks/useCurrentBranch";

export function BranchCard({ branch, delay = 0 }: { branch: Branch; delay?: number }) {
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const requestSwitchBranch = useUIStore((s) => s.requestSwitchBranch);
  const deleteBranch = useUIStore((s) => s.deleteBranch);
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const isCurrent = branch.name === currentBranchName;
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const headHash = useBranchHeadHash(branch.name);
  const head = getCommit(headHash);
  const ahead = useBranchAhead(branch);
  const contributors = branch.authorIds.map((id) => authors[id]);

  let statusLabel = "Up to date";
  let statusRole: "commit" | "staged" | "history" | "conflict" | "branch" = "commit";
  if (isCurrent) {
    statusLabel = "Current";
    statusRole = "branch";
  } else if (branch.stale) {
    statusLabel = "Stale";
    statusRole = "history";
  } else if (ahead > 0 && branch.behind > 0) {
    statusLabel = "Diverged";
    statusRole = "conflict";
  } else if (!branch.upstream && branch.kind === "local" && ahead > 0) {
    statusLabel = "Unpublished";
    statusRole = "staged";
  } else if (ahead > 0) {
    statusLabel = "Ahead";
    statusRole = "commit";
  } else if (branch.behind > 0) {
    statusLabel = "Behind";
    statusRole = "history";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--border-strong)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {branch.kind === "remote" ? (
            <Cloud size={15} className="shrink-0 text-git-remote" />
          ) : (
            <GitBranch size={15} className="shrink-0 text-[var(--text-secondary)]" />
          )}
          <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{branch.name}</span>
          {branch.protected && <ShieldAlert size={12} className="shrink-0 text-git-staged" />}
        </div>
        <Badge role={statusRole} dot>
          {statusLabel}
        </Badge>
      </div>

      <button
        onClick={() => head && inspectCommit(head.hash)}
        disabled={!head}
        className="focus-ring mt-3 block w-full rounded-lg bg-[var(--bg-surface-2)] p-2.5 text-left transition-colors hover:bg-[var(--bg-surface-3)] disabled:cursor-default disabled:hover:bg-[var(--bg-surface-2)]"
      >
        {head ? (
          <>
            <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{head.subject}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
              <span className="mono-hash">{head.shortHash}</span>
              <span>&middot;</span>
              <span>{head.author.name}</span>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-[var(--text-tertiary)]">Commit details unavailable</div>
        )}
      </button>

      <div className="mt-3 flex items-center justify-between">
        <AvatarStack authors={contributors} size={20} />
        <div className="flex items-center gap-2.5 text-[11px] font-tabular text-[var(--text-tertiary)]">
          {ahead > 0 && (
            <span className="flex items-center gap-0.5 text-git-commit">
              <ArrowUp size={11} />
              {ahead}
            </span>
          )}
          {branch.behind > 0 && (
            <span className="flex items-center gap-0.5 text-git-conflict">
              <ArrowDown size={11} />
              {branch.behind}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {timeAgo(branch.lastActivity)}
          </span>
        </div>
      </div>

      {branch.kind === "local" && !isCurrent && (
        <div className="mt-3 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1"
            icon={<ArrowRightLeft size={12} />}
            onClick={() => requestSwitchBranch(branch.name)}
          >
            Switch to this branch
          </Button>
          {!branch.protected && (
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 !px-2 hover:!text-git-conflict"
              title="Delete branch"
              onClick={() => {
                const err = deleteBranch(branch.name, false);
                setDeleteError(err);
              }}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      )}
      {deleteError && (
        <div className="mt-2 rounded-lg border border-git-conflict/25 bg-git-conflict/8 p-2 text-[11px] text-git-conflict">
          {deleteError}
          <button
            className="focus-ring ml-2 underline"
            onClick={() => {
              deleteBranch(branch.name, true);
              setDeleteError(null);
            }}
          >
            Force delete anyway
          </button>
        </div>
      )}
    </motion.div>
  );
}
