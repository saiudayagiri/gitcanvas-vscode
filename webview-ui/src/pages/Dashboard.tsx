import { Layers3, RefreshCw, GitBranch, Users } from "lucide-react";
import { motion } from "framer-motion";
import { repoState, remote } from "@/lib/mock-data";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { HeadChain } from "@/components/dashboard/HeadChain";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { RecentCommits } from "@/components/dashboard/RecentCommits";
import { HealthGauge } from "@/components/dashboard/HealthGauge";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { AvatarStack } from "@/components/ui/Avatar";
import { authors, timeAgo, getCommit } from "@/lib/mock-data";
import { useCurrentBranch, useHeadHash, useBranchAhead, useAllBranches } from "@/hooks/useCurrentBranch";
import { useUIStore } from "@/store/ui-store";

export function Dashboard() {
  const currentBranch = useCurrentBranch();
  const headHash = useHeadHash();
  const allBranches = useAllBranches();
  const branches = [...allBranches].sort((a, b) => +new Date(b.lastActivity) - +new Date(a.lastActivity));
  const ahead = useBranchAhead(currentBranch ?? { name: "", ahead: 0 });
  const workingFiles = useUIStore((s) => s.workingFiles);
  const stagedFiles = useUIStore((s) => s.stagedFiles);
  const staged = stagedFiles.length;
  const unstaged = workingFiles.filter((f) => f.state === "modified" || f.state === "deleted").length;
  const untracked = workingFiles.filter((f) => f.state === "untracked").length;
  const activeContributors = Object.values(authors).slice(0, 4);
  const aheadLabel = currentBranch?.upstream ? `ahead of ${currentBranch.upstream}` : "ahead of upstream";
  const detachedShortHash = !currentBranch && headHash ? getCommit(headHash)?.shortHash : undefined;

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Where you are</h1>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          {repoState.name} &middot; {repoState.path}
        </p>
      </motion.div>

      <Panel className="mt-5" glass>
        <HeadChain />
        <EducationalNote
          what="HEAD points at your current branch, which points at its latest commit — that chain is 'where you are' in the repository."
          why="Everything you do (new commits, switching branches, merging) moves one of these pointers rather than copying files around."
          command="git symbolic-ref HEAD"
        />
      </Panel>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label={currentBranch ? "Current branch" : "Detached HEAD"}
          value={currentBranch?.name ?? detachedShortHash ?? "—"}
          icon={<GitBranch size={16} />}
          role={currentBranch ? "branch" : "staged"}
          to="/branches"
          delay={0.05}
          detail={
            currentBranch ? (
              <span className="text-[11px] text-git-branch">
                {ahead} {aheadLabel}
              </span>
            ) : (
              <span className="text-[11px] text-git-staged">browsing history</span>
            )
          }
        />
        <StatCard
          label="Working tree"
          value={staged + unstaged + untracked}
          icon={<Layers3 size={16} />}
          role="staged"
          to="/working-tree"
          delay={0.1}
          detail={
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {staged} staged &middot; {unstaged} modified &middot; {untracked} new
            </span>
          }
        />
        <StatCard
          label="Remote sync"
          value={`${remote.ahead}↑ ${remote.behind}↓`}
          icon={<RefreshCw size={16} />}
          role="remote"
          to="/remote"
          delay={0.15}
          detail={<span className="text-[11px] text-[var(--text-tertiary)]">origin/main diverged</span>}
        />
        <StatCard
          label="Contributors"
          value={Object.keys(authors).length}
          icon={<Users size={16} />}
          role="history"
          to="/branches"
          delay={0.2}
          detail={<AvatarStack authors={activeContributors} size={18} />}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader title="Repository activity" subtitle="Commit frequency across all branches" />
          <ActivityHeatmap />
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader title="Repository health" subtitle={`Last GC ${timeAgo(repoState.health.lastGc)}`} />
          <HealthGauge />
        </Panel>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader title="Latest commits" subtitle="Most recent activity across the repository" />
          <RecentCommits count={6} />
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader title="Branches at a glance" subtitle={`${branches.length} branches`} />
          <div className="space-y-2">
            {branches.slice(0, 5).map((b) => (
              <div
                key={b.name}
                className={
                  "flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[var(--bg-surface-2)] " +
                  (b.name === currentBranch?.name ? "bg-git-branch/8" : "")
                }
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: `var(--color-git-${b.color})` }}
                  />
                  <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">{b.name}</span>
                  {b.name === currentBranch?.name && (
                    <span className="shrink-0 rounded-full bg-git-branch/15 px-1.5 py-0.5 text-[10px] font-medium text-git-branch">
                      current
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">{timeAgo(b.lastActivity)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
