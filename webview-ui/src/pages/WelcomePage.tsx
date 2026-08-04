import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Waypoints,
  GitBranch,
  Layers3,
  History,
  Anchor,
  RefreshCw,
  LayoutDashboard,
  Command,
  TerminalSquare,
  GraduationCap,
  Sun,
  Moon,
  Contrast,
} from "lucide-react";
import { repoState, getCommit } from "@/lib/mock-data";
import { useCurrentBranch, useHeadHash } from "@/hooks/useCurrentBranch";
import { useTheme } from "@/context/ThemeContext";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Avatar } from "@/components/ui/Avatar";
import { Kbd } from "@/components/ui/Kbd";

const THEME_ICON = { dark: Moon, light: Sun, hc: Contrast };

const ROLE_CLASSES = {
  commit: "bg-git-commit/10 text-git-commit",
  branch: "bg-git-branch/10 text-git-branch",
  staged: "bg-git-staged/10 text-git-staged",
  history: "bg-git-history/10 text-git-history",
  remote: "bg-git-remote/10 text-git-remote",
} as const;

const QUICK_LINKS = [
  { to: "/", label: "Dashboard", description: "HEAD, working tree, remote status at a glance", icon: LayoutDashboard, role: "commit" as const },
  { to: "/graph", label: "Commit Graph", description: "Pan, zoom, and inspect the full DAG", icon: Waypoints, role: "branch" as const },
  { to: "/working-tree", label: "Working Tree", description: "Stage, commit, and push changes", icon: Layers3, role: "staged" as const },
  { to: "/branches", label: "Branches", description: "Where each branch forked and merged", icon: GitBranch, role: "branch" as const },
  { to: "/history", label: "File History", description: "Per-file commit timeline and blame", icon: History, role: "history" as const },
  { to: "/reflog", label: "Reflog", description: "Every move of HEAD, with recovery", icon: Anchor, role: "commit" as const },
  { to: "/remote", label: "Remote Sync", description: "Fetch, pull, and push against origin", icon: RefreshCw, role: "remote" as const },
];

const SHORTCUTS = [
  { keys: ["⌘", "K"], description: "Open the command palette — jump to a page, branch, or commit" },
  { keys: ["`"], description: "Toggle the toy terminal showing every git command as it runs" },
];

export function WelcomePage() {
  const navigate = useNavigate();
  const { theme, cycleTheme } = useTheme();
  const ThemeIcon = THEME_ICON[theme];
  const currentBranch = useCurrentBranch();
  const headHash = useHeadHash();
  const headCommit = headHash ? getCommit(headHash) : undefined;

  return (
    <div className="relative h-screen w-screen overflow-y-auto bg-[var(--bg-canvas)] px-6 py-10">
      <button
        onClick={cycleTheme}
        className="focus-ring absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ThemeIcon size={14} />
      </button>

      <div className="mx-auto w-full max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-git-remote text-white shadow-lg">
            <Waypoints size={22} strokeWidth={2.5} />
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--text-primary)]">{repoState.name}</h1>
          <p className="mt-1.5 truncate text-[13px] text-[var(--text-secondary)]">{repoState.path}</p>
        </motion.div>

        <Panel glass>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-git-branch/10 text-git-branch">
                <GitBranch size={16} />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {currentBranch?.name ?? (headHash ? `detached @ ${getCommit(headHash)?.shortHash}` : "—")}
                </div>
                {headCommit && <div className="mt-0.5 truncate text-[12px] text-[var(--text-tertiary)]">{headCommit.subject}</div>}
              </div>
            </div>
            {headCommit && (
              <div className="flex shrink-0 items-center gap-2">
                <Avatar author={headCommit.author} size={22} />
                <span className="mono-hash text-[11px] text-[var(--text-tertiary)]">{headCommit.shortHash}</span>
              </div>
            )}
          </div>
        </Panel>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.to}
              onClick={() => navigate(link.to)}
              className="focus-ring group flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ROLE_CLASSES[link.role]}`}>
                <link.icon size={17} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{link.label}</div>
                <div className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">{link.description}</div>
              </div>
            </button>
          ))}
        </div>

        <Panel className="mt-5">
          <PanelHeader title="Keyboard shortcuts" subtitle="Work faster without leaving the keyboard" />
          <div className="space-y-2.5">
            {SHORTCUTS.map((s) => (
              <div key={s.description} className="flex items-center gap-3">
                <div className="flex shrink-0 items-center gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </div>
                <span className="text-[12px] text-[var(--text-secondary)]">{s.description}</span>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <div className="flex h-5 shrink-0 items-center gap-1.5 text-[var(--text-tertiary)]">
                <GraduationCap size={13} />
              </div>
              <span className="text-[12px] text-[var(--text-secondary)]">
                Toggle <strong className="font-medium text-[var(--text-primary)]">Educational Mode</strong> in the top
                bar for a what/why/command explanation on every screen
              </span>
            </div>
          </div>
        </Panel>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--text-tertiary)]">
          <Command size={11} /> <span>⌘K anywhere</span>
          <span className="mx-1">·</span>
          <TerminalSquare size={11} /> <span>` for the terminal</span>
        </p>
      </div>
    </div>
  );
}
