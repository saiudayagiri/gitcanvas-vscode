import { useState } from "react";
import { Search, ZoomIn, ZoomOut, Maximize2, GitBranch } from "lucide-react";
import { CommitGraphCanvas } from "@/components/commit-graph/CommitGraphCanvas";
import { usePanZoom } from "@/components/commit-graph/usePanZoom";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { useAllBranches } from "@/hooks/useCurrentBranch";
import { useUIStore } from "@/store/ui-store";
import clsx from "clsx";

export function CommitGraphPage() {
  const [highlightedBranch, setHighlightedBranch] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const panZoom = usePanZoom({ x: 60, y: 24, scale: 1 });
  const allBranches = useAllBranches();
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  // Local branches only — this view is about your own history, not every remote-tracking ref.
  const localBranches = allBranches.filter((b) => b.kind === "local");

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter commits…"
            className="focus-ring h-8 w-64 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] pl-8 pr-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => panZoom.zoomBy(-0.15)}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ZoomOut size={14} />
          </button>
          <span className="w-10 text-center font-tabular text-[12px] text-[var(--text-tertiary)]">
            {Math.round(panZoom.transform.scale * 100)}%
          </span>
          <button
            onClick={() => panZoom.zoomBy(0.15)}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => panZoom.setTransform({ x: 60, y: 24, scale: 1 })}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full">
          <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border-subtle)] overflow-y-auto py-3">
            <div className="flex items-center gap-1.5 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              <GitBranch size={12} /> Local branches
            </div>
            {localBranches.map((b) => {
              const isCurrent = b.name === currentBranchName;
              const isHighlighted = highlightedBranch === b.name;
              return (
                <button
                  key={b.name}
                  onClick={() => setHighlightedBranch((cur) => (cur === b.name ? null : b.name))}
                  className={clsx(
                    "focus-ring mx-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    isHighlighted
                      ? "bg-git-branch/12 text-git-branch"
                      : isCurrent
                        ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)]"
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: `var(--color-git-${b.color})` }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                  {isCurrent && (
                    <span className="shrink-0 rounded-full bg-git-branch/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-git-branch">
                      current
                    </span>
                  )}
                </button>
              );
            })}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="px-6 pt-4">
              <EducationalNote
                what="Each dot is a commit; lines connect a commit to its parent(s). Branches are just movable labels pointing at a commit — the graph itself never changes shape until you add or rewrite commits."
                why="This is exactly what `git log --graph --all` prints as text — here it's laid out spatially so lanes and merges are visible at a glance."
                command="git log --graph --all --oneline --decorate"
              />
            </div>
            <div className="min-h-0 flex-1">
              <CommitGraphCanvas highlightedBranch={highlightedBranch} searchQuery={query} panZoom={panZoom} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
