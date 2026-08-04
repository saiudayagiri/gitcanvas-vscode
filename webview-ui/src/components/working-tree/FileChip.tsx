import { motion } from "framer-motion";
import { FileStatusIcon } from "../ui/FileStatusIcon";
import type { ReactNode } from "react";

export function FileChip({
  path,
  status,
  insertions,
  deletions,
  action,
  layoutId,
}: {
  path: string;
  status: string;
  insertions: number;
  deletions: number;
  action?: ReactNode;
  layoutId: string;
}) {
  // An entirely untracked directory collapses to a single status line with a trailing slash
  // (e.g. "src/") rather than one line per file inside it — strip it before splitting, or
  // `.pop()` returns the empty string after the trailing slash and the whole row renders with
  // no visible name at all.
  const trimmed = path.replace(/\/+$/, "");
  const filename = trimmed.split("/").pop() || path;
  const dir = trimmed.slice(0, trimmed.length - filename.length);

  return (
    <motion.div
      layout
      layoutId={layoutId}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="group flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-2.5 py-2"
    >
      <FileStatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[12px] font-medium text-[var(--text-primary)]">{filename}</div>
        {dir && <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">{dir.replace(/\/$/, "")}</div>}
      </div>
      {(insertions > 0 || deletions > 0) && (
        <div className="flex shrink-0 items-center gap-1 font-tabular text-[10px]">
          {insertions > 0 && <span className="text-git-commit">+{insertions}</span>}
          {deletions > 0 && <span className="text-git-conflict">−{deletions}</span>}
        </div>
      )}
      {action}
    </motion.div>
  );
}
