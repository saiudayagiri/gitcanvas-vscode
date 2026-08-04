import { Search, Sun, Moon, Contrast, GraduationCap } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTheme } from "@/context/ThemeContext";
import { useEducationalMode } from "@/context/EducationalModeContext";
import { useUIStore } from "@/store/ui-store";
import { repoState } from "@/lib/mock-data";
import { Kbd } from "../ui/Kbd";
import { ToyTerminalToggle } from "../terminal/ToyTerminal";
import clsx from "clsx";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/graph": "Commit Graph",
  "/working-tree": "Working Tree",
  "/branches": "Branches",
  "/history": "File History",
  "/merge": "Merge Simulator",
  "/rebase": "Rebase Simulator",
  "/remote": "Remote Sync",
};

const THEME_ICON = { dark: Moon, light: Sun, hc: Contrast };

export function TopBar() {
  const location = useLocation();
  const { theme, cycleTheme } = useTheme();
  const { enabled, toggle } = useEducationalMode();
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const ThemeIcon = THEME_ICON[theme];
  const title = TITLES[location.pathname] ?? "GitCanvas";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-6">
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-[var(--text-tertiary)]">{repoState.name}</span>
        <span className="text-[var(--text-tertiary)]">/</span>
        <span className="font-semibold text-[var(--text-primary)]">{title}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="focus-ring flex h-8 w-64 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[13px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)]"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search everywhere…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <ToyTerminalToggle />

        <button
          onClick={toggle}
          className={clsx(
            "focus-ring flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors",
            enabled
              ? "border-accent/30 bg-accent/12 text-accent"
              : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          )}
        >
          <GraduationCap size={14} />
          Learn
        </button>

        <button
          onClick={cycleTheme}
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ThemeIcon size={14} />
        </button>
      </div>
    </header>
  );
}
