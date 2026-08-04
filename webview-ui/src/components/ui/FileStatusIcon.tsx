import { Plus, Pencil, Minus, ArrowRightLeft, CircleDashed, CheckCircle2, AlertTriangle } from "lucide-react";
import type { GitColorRole } from "@/types/git";

type AnyFileStatus = "added" | "modified" | "deleted" | "renamed" | "untracked" | "staged" | "conflicted";

const CONFIG: Record<AnyFileStatus, { icon: typeof Plus; role: GitColorRole; label: string }> = {
  added: { icon: Plus, role: "commit", label: "Added" },
  modified: { icon: Pencil, role: "branch", label: "Modified" },
  deleted: { icon: Minus, role: "conflict", label: "Deleted" },
  renamed: { icon: ArrowRightLeft, role: "remote", label: "Renamed" },
  untracked: { icon: CircleDashed, role: "history", label: "Untracked" },
  staged: { icon: CheckCircle2, role: "staged", label: "Staged" },
  conflicted: { icon: AlertTriangle, role: "conflict", label: "Conflicted" },
};

const ROLE_TEXT: Record<GitColorRole, string> = {
  commit: "text-git-commit",
  branch: "text-git-branch",
  staged: "text-git-staged",
  history: "text-git-history",
  remote: "text-git-remote",
  conflict: "text-git-conflict",
};

export function FileStatusIcon({ status, size = 13 }: { status: string; size?: number }) {
  const cfg = CONFIG[status as AnyFileStatus] ?? CONFIG.modified;
  const Icon = cfg.icon;
  return (
    <span className={`flex shrink-0 items-center justify-center ${ROLE_TEXT[cfg.role]}`} title={cfg.label}>
      <Icon size={size} strokeWidth={2.5} />
    </span>
  );
}

export function fileStatusLabel(status: string): string {
  return (CONFIG[status as AnyFileStatus] ?? CONFIG.modified).label;
}

export function fileStatusRole(status: string): GitColorRole {
  return (CONFIG[status as AnyFileStatus] ?? CONFIG.modified).role;
}
