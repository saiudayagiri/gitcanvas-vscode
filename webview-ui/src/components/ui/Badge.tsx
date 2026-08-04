import clsx from "clsx";
import type { GitColorRole } from "@/types/git";
import type { ReactNode } from "react";

const ROLE_CLASSES: Record<GitColorRole, string> = {
  commit: "bg-git-commit/12 text-git-commit border-git-commit/25",
  branch: "bg-git-branch/12 text-git-branch border-git-branch/25",
  staged: "bg-git-staged/12 text-git-staged border-git-staged/25",
  history: "bg-git-history/12 text-git-history border-git-history/25",
  remote: "bg-git-remote/12 text-git-remote border-git-remote/25",
  conflict: "bg-git-conflict/12 text-git-conflict border-git-conflict/25",
};

export function Badge({
  role = "history",
  children,
  icon,
  className,
  dot,
}: {
  role?: GitColorRole;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        ROLE_CLASSES[role],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />}
      {icon}
      {children}
    </span>
  );
}
