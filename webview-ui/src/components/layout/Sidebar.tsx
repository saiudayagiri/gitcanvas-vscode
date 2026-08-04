import { NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Waypoints,
  Layers3,
  GitBranch,
  History,
  GitMerge,
  Rows3,
  RefreshCw,
  Anchor,
  ChevronsLeft,
  ChevronsRight,
  FolderGit2,
  Settings,
} from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import { repoState, getCommit } from "@/lib/mock-data";
import { Avatar } from "../ui/Avatar";
import { currentUser } from "@/lib/mock-data";
import { Tooltip } from "../ui/Tooltip";
import { useCurrentBranch, useHeadHash } from "@/hooks/useCurrentBranch";
import { BranchSwitcherPopover, BranchSwitcherTrigger } from "../branch-switch/BranchSwitcherPopover";
import { ConfigModal } from "./ConfigModal";
import { useUIStore } from "@/store/ui-store";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/graph", label: "Commit Graph", icon: Waypoints },
  { to: "/working-tree", label: "Working Tree", icon: Layers3 },
  { to: "/branches", label: "Branches", icon: GitBranch },
  { to: "/history", label: "File History", icon: History },
  { to: "/merge", label: "Merge Simulator", icon: GitMerge },
  { to: "/rebase", label: "Rebase Simulator", icon: Rows3 },
  { to: "/remote", label: "Remote Sync", icon: RefreshCw },
  { to: "/reflog", label: "Reflog", icon: Anchor },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const currentBranch = useCurrentBranch();
  const headHash = useHeadHash();
  const branchLabel = currentBranch?.name ?? (headHash ? getCommit(headHash)?.shortHash ?? "" : "");
  const gitConfig = useUIStore((s) => s.gitConfig);

  return (
    <aside
      className={clsx(
        "relative flex h-full flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-canvas-2)] transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-[248px]"
      )}
    >
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-git-remote text-white">
          <Waypoints size={15} strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <span className="animate-fade-in truncate text-[13px] font-semibold tracking-tight">GitCanvas</span>
        )}
      </div>

      {!collapsed && (
        <div className="animate-fade-in mx-3 mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
          <Tooltip content="Repo overview, quick links, and keyboard shortcuts" side="right">
            <Link
              to="/welcome"
              className="focus-ring group flex items-center gap-1.5 truncate text-[13px] font-semibold text-[var(--text-primary)] hover:text-accent"
            >
              <span className="truncate">{repoState.name}</span>
              <FolderGit2 size={11} className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </Tooltip>
          <div className="mt-1.5">
            <BranchSwitcherPopover>
              <BranchSwitcherTrigger name={branchLabel} detached={!currentBranch} />
            </BranchSwitcherPopover>
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5">
        {NAV.map((item) => (
          <Tooltip key={item.to} content={item.label} side="right">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  "focus-ring group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute -left-2.5 top-1/2 h-4.5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
                  )}
                  <item.icon size={16} strokeWidth={2} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          </Tooltip>
        ))}
      </nav>

      <div className="border-t border-[var(--border-subtle)] p-2.5">
        <ConfigModal>
          <button
            className={clsx(
              "focus-ring group flex w-full items-center gap-2 rounded-lg p-1.5 text-left",
              !collapsed && "hover:bg-[var(--bg-surface)]"
            )}
          >
            <Avatar author={{ ...currentUser, name: gitConfig.userName }} size={26} />
            {!collapsed && (
              <div className="animate-fade-in flex min-w-0 flex-1 items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{gitConfig.userName}</div>
                  <div className="truncate text-[11px] text-[var(--text-tertiary)]">{gitConfig.userEmail}</div>
                </div>
                <Settings size={12} className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            )}
          </button>
        </ConfigModal>
      </div>

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="focus-ring absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        {collapsed ? <ChevronsRight size={12} /> : <ChevronsLeft size={12} />}
      </button>
    </aside>
  );
}
