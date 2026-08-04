import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import type { GitColorRole } from "@/types/git";

const ROLE_TEXT: Record<GitColorRole, string> = {
  commit: "text-git-commit",
  branch: "text-git-branch",
  staged: "text-git-staged",
  history: "text-git-history",
  remote: "text-git-remote",
  conflict: "text-git-conflict",
};
const ROLE_BG: Record<GitColorRole, string> = {
  commit: "bg-git-commit/10",
  branch: "bg-git-branch/10",
  staged: "bg-git-staged/10",
  history: "bg-git-history/10",
  remote: "bg-git-remote/10",
  conflict: "bg-git-conflict/10",
};

export function StatCard({
  label,
  value,
  icon,
  role = "history",
  to,
  detail,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  role?: GitColorRole;
  to?: string;
  detail?: ReactNode;
  delay?: number;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <div className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", ROLE_BG[role], ROLE_TEXT[role])}>
          {icon}
        </div>
        {to && (
          <ArrowRight
            size={14}
            className="text-[var(--text-tertiary)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
          />
        )}
      </div>
      <div className="mt-3 truncate text-2xl font-semibold tracking-tight text-[var(--text-primary)] font-tabular">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[13px] text-[var(--text-secondary)]">{label}</div>
      {detail && <div className="mt-2 truncate">{detail}</div>}
    </>
  );

  const className =
    "group relative block min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--border-strong)]";

  const wrapper = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      {to ? (
        <Link to={to} className={className}>
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
    </motion.div>
  );

  return wrapper;
}
