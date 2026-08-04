import { motion } from "framer-motion";
import { commits } from "@/lib/mock-data";
import { timeAgo } from "@/lib/mock-data";
import { Avatar } from "../ui/Avatar";
import { useUIStore } from "@/store/ui-store";
import { GitMerge } from "lucide-react";

export function RecentCommits({ count = 6 }: { count?: number }) {
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const recent = [...commits].sort((a, b) => +new Date(b.committedAt) - +new Date(a.committedAt)).slice(0, count);

  return (
    <div className="relative">
      <div className="absolute bottom-2 left-[15px] top-2 w-px bg-[var(--border-subtle)]" />
      <div className="space-y-1">
        {recent.map((c, i) => (
          <motion.button
            key={c.hash}
            onClick={() => inspectCommit(c.hash)}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="focus-ring group relative flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[var(--bg-surface-2)]"
          >
            <div className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center">
              <Avatar author={c.author} size={26} />
              {c.isMerge && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-git-remote text-white ring-2 ring-[var(--bg-surface)]">
                  <GitMerge size={8} strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">{c.subject}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                <span>{c.author.name}</span>
                <span>&middot;</span>
                <span>{timeAgo(c.committedAt)}</span>
              </div>
            </div>
            <span className="mono-hash shrink-0 text-[11px] text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100">
              {c.shortHash}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
