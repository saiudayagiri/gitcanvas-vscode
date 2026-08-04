import { Command } from "cmdk";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Waypoints,
  Layers3,
  GitBranch,
  History,
  GitMerge,
  Rows3,
  RefreshCw,
  GitCommitHorizontal,
  ArrowRightLeft,
  Check,
} from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { commits } from "@/lib/mock-data";
import { useAllBranches } from "@/hooks/useCurrentBranch";

const PAGES = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/graph", label: "Commit Graph", icon: Waypoints },
  { to: "/working-tree", label: "Working Tree", icon: Layers3 },
  { to: "/branches", label: "Branches", icon: GitBranch },
  { to: "/history", label: "File History", icon: History },
  { to: "/merge", label: "Merge Simulator", icon: GitMerge },
  { to: "/rebase", label: "Rebase Simulator", icon: Rows3 },
  { to: "/remote", label: "Remote Sync", icon: RefreshCw },
];

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const requestSwitchBranch = useUIStore((s) => s.requestSwitchBranch);
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const allBranches = useAllBranches();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search everywhere"
      className="fixed inset-0 z-100"
    >
      <div className="fixed inset-0 bg-black/50 animate-fade-in" onClick={() => setOpen(false)} />
      <div className="animate-pop glass fixed left-1/2 top-[18%] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--border-default)] shadow-2xl">
        <Command.Input
          autoFocus
          placeholder="Search pages, branches, commits…"
          className="focus-ring w-full border-b border-[var(--border-subtle)] bg-transparent px-4 py-3.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
        />
        <Command.List className="max-h-[360px] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-[13px] text-[var(--text-tertiary)]">
            No results found.
          </Command.Empty>

          <Command.Group heading="Pages" className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] [&_[cmdk-group-items]]:mt-1">
            {PAGES.map((p) => (
              <Command.Item
                key={p.to}
                value={p.label}
                onSelect={() => {
                  navigate(p.to);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--text-primary)] aria-selected:bg-[var(--bg-surface-3)]"
              >
                <p.icon size={15} className="text-[var(--text-tertiary)]" />
                {p.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Switch branch" className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] [&_[cmdk-group-items]]:mt-1">
            {allBranches.filter((b) => b.kind === "local").map((b) => (
              <Command.Item
                key={b.name}
                value={"switch " + b.name}
                onSelect={() => {
                  if (b.name !== currentBranchName) requestSwitchBranch(b.name);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--text-primary)] aria-selected:bg-[var(--bg-surface-3)]"
              >
                <ArrowRightLeft size={15} className="text-[var(--text-tertiary)]" />
                {b.name}
                {b.name === currentBranchName && <Check size={13} className="ml-auto text-git-branch" />}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Recent commits" className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] [&_[cmdk-group-items]]:mt-1">
            {commits.slice(-8).reverse().map((c) => (
              <Command.Item
                key={c.hash}
                value={c.subject + c.shortHash}
                onSelect={() => {
                  inspectCommit(c.hash);
                  navigate("/graph");
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--text-primary)] aria-selected:bg-[var(--bg-surface-3)]"
              >
                <GitCommitHorizontal size={15} className="text-[var(--text-tertiary)]" />
                <span className="truncate">{c.subject}</span>
                <span className="mono-hash ml-auto shrink-0 text-[11px] text-[var(--text-tertiary)]">{c.shortHash}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
