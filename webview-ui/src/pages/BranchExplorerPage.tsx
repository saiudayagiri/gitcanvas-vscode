import { Tag as TagIcon, Trash2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { BranchTopology } from "@/components/branch-explorer/BranchTopology";
import { BranchCard } from "@/components/branch-explorer/BranchCard";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { NewBranchPopover } from "@/components/branch-switch/NewBranchPopover";
import { useAllBranches } from "@/hooks/useCurrentBranch";
import { useAllTags } from "@/hooks/useTags";
import { getCommit, timeAgo } from "@/lib/mock-data";
import { useUIStore } from "@/store/ui-store";

export function BranchExplorerPage() {
  const branches = useAllBranches();
  const local = branches.filter((b) => b.kind === "local");
  const remote = branches.filter((b) => b.kind === "remote");
  const staleCount = branches.filter((b) => b.stale).length;
  const mergedCount = local.filter((b) => b.mergedIntoHash).length;
  const tags = useAllTags();
  const deleteTag = useUIStore((s) => s.deleteTag);
  const inspectCommit = useUIStore((s) => s.inspectCommit);

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Branches</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {local.length} local &middot; {remote.length} remote &middot; {mergedCount} recently merged &middot; {staleCount} stale
          </p>
        </div>
        <NewBranchPopover />
      </div>

      <Panel className="mt-5" glass>
        <PanelHeader
          title="Topology"
          subtitle="How each branch relates to main — where it forked, and whether it has merged back in"
        />
        <BranchTopology />
        <EducationalNote
          what="Each bar starts where a branch diverged from main and ends at its latest commit — or at the point it merged back in."
          why="A branch is nothing more than a movable pointer to a commit. Its 'shape' here is really just the shape of the commit history underneath it."
          command="git show-branch --all"
        />
      </Panel>

      <div className="mt-6">
        <h2 className="mb-3 text-[13px] font-semibold text-[var(--text-secondary)]">Local branches</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {local.map((b, i) => (
            <BranchCard key={b.name} branch={b} delay={i * 0.04} />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-[13px] font-semibold text-[var(--text-secondary)]">Remote branches</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {remote.map((b, i) => (
            <BranchCard key={b.name} branch={b} delay={i * 0.04} />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-[13px] font-semibold text-[var(--text-secondary)]">
          Tags <span className="text-[var(--text-tertiary)]">({tags.length})</span>
        </h2>
        {tags.length === 0 ? (
          <Panel className="text-center text-[13px] text-[var(--text-tertiary)]">
            No tags yet — tag a commit from the Commit Inspector to mark a release point.
          </Panel>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tags.map((t) => {
              const commit = getCommit(t.hash);
              return (
                <div
                  key={t.name}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
                >
                  <button
                    onClick={() => commit && inspectCommit(commit.hash)}
                    className="focus-ring flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <TagIcon size={13} className="shrink-0 text-git-history" />
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[12px] font-medium text-[var(--text-primary)]">{t.name}</div>
                      {commit && (
                        <div className="truncate text-[10px] text-[var(--text-tertiary)]">
                          {commit.shortHash} &middot; {timeAgo(commit.committedAt)}
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => deleteTag(t.name)}
                    title="Delete tag"
                    className="focus-ring shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-git-conflict"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
