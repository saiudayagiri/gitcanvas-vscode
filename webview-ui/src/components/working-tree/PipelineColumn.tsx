import type { ReactNode } from "react";
import type { GitColorRole } from "@/types/git";
import clsx from "clsx";

const ROLE_TEXT: Record<GitColorRole, string> = {
  commit: "text-git-commit",
  branch: "text-git-branch",
  staged: "text-git-staged",
  history: "text-git-history",
  remote: "text-git-remote",
  conflict: "text-git-conflict",
};
const ROLE_BG: Record<GitColorRole, string> = {
  commit: "bg-git-commit/10 border-git-commit/20",
  branch: "bg-git-branch/10 border-git-branch/20",
  staged: "bg-git-staged/10 border-git-staged/20",
  history: "bg-git-history/10 border-git-history/20",
  remote: "bg-git-remote/10 border-git-remote/20",
  conflict: "bg-git-conflict/10 border-git-conflict/20",
};

export function PipelineColumn({
  title,
  subtitle,
  icon,
  role,
  count,
  children,
  footer,
  empty,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  role: GitColorRole;
  count: number;
  children: ReactNode;
  footer?: ReactNode;
  empty?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3.5">
        <div className={clsx("flex h-8 w-8 items-center justify-center rounded-lg border", ROLE_BG[role], ROLE_TEXT[role])}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
            <span className={clsx("rounded-full px-1.5 py-0.5 font-tabular text-[10px] font-semibold", ROLE_BG[role], ROLE_TEXT[role])}>
              {count}
            </span>
          </div>
          <p className="truncate text-[11px] text-[var(--text-tertiary)]">{subtitle}</p>
        </div>
      </div>
      <div className="min-h-[140px] flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {count === 0 && empty && (
          <div className="flex h-full min-h-[100px] items-center justify-center px-4 text-center text-[12px] text-[var(--text-tertiary)]">
            {empty}
          </div>
        )}
        {children}
      </div>
      {footer && <div className="border-t border-[var(--border-subtle)] p-2.5">{footer}</div>}
    </div>
  );
}
