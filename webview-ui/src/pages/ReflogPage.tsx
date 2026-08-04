import { useEffect, useState } from "react";
import { RotateCcw, GitCommitHorizontal, GitBranchPlus, Undo2, Cherry, History as HistoryIcon, Download, Loader2, GitMerge, Rows3 } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { getCommit } from "@/lib/mock-data";
import { shortHash } from "@/lib/hash";
import { isInVsCode, requestData } from "@/lib/vscode-bridge";
import type { ReflogRawEntry } from "@/lib/vscode-protocol";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EducationalNote } from "@/components/ui/EducationalNote";

const ACTION_ICON: Record<string, typeof GitCommitHorizontal> = {
  checkout: GitBranchPlus,
  reset: RotateCcw,
  commit: GitCommitHorizontal,
  "commit (amend)": GitCommitHorizontal,
  revert: Undo2,
  "cherry-pick": Cherry,
  clone: Download,
  merge: GitMerge,
  rebase: Rows3,
  "rebase (start)": Rows3,
  "rebase (pick)": Rows3,
  "rebase (finish)": Rows3,
  pull: Download,
};

function timeAgo(ts: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface DisplayEntry {
  id: string;
  hash: string;
  action: string;
  description: string;
  timestamp: number;
}

export function ReflogPage() {
  const simulatedReflog = useUIStore((s) => s.reflog);
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const restoreFromReflog = useUIStore((s) => s.restoreFromReflog);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [realReflog, setRealReflog] = useState<ReflogRawEntry[] | null>(null);
  const [loading, setLoading] = useState(isInVsCode());
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInVsCode()) return;
    let cancelled = false;
    requestData({ kind: "reflog" })
      .then((data) => {
        if (!cancelled && data.kind === "reflog") setRealReflog(data.entries);
      })
      .catch((err: Error) => {
        if (!cancelled) setFetchError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reflog: DisplayEntry[] = isInVsCode()
    ? (realReflog ?? []).map((e) => ({ id: e.selector, hash: e.hash, action: e.action, description: e.description, timestamp: e.timestamp }))
    : simulatedReflog;

  return (
    <div className="mx-auto max-w-[820px] px-8 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Reflog</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Every place HEAD has pointed this session — even commits no branch or tag references anymore. This is Git's
        safety net for "I think I just lost my work."
      </p>

      {loading ? (
        <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-8 text-[12px] text-[var(--text-tertiary)]">
          <Loader2 size={14} className="animate-spin" /> Reading reflog…
        </div>
      ) : fetchError ? (
        <div className="mt-5 rounded-xl border border-git-conflict/25 bg-git-conflict/6 px-3.5 py-2.5 text-[12px] text-git-conflict">{fetchError}</div>
      ) : (
        <Panel className="mt-5" padded={false}>
          <div className="divide-y divide-[var(--border-subtle)]">
            {reflog.map((entry, i) => {
              const Icon = ACTION_ICON[entry.action] ?? GitCommitHorizontal;
              const target = getCommit(entry.hash);
              const canRestore = i !== 0 && Boolean(target) && Boolean(currentBranchName);
              const confirming = confirmingId === entry.id;
              return (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-16 shrink-0 font-tabular text-[11px] text-[var(--text-tertiary)]">HEAD@{"{"}{i}{"}"}</span>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[var(--text-tertiary)]">
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--bg-surface-3)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                        {entry.action}
                      </span>
                      <span className="mono-hash text-[11px] font-semibold text-git-branch">{shortHash(entry.hash)}</span>
                      {!target && (
                        <span className="text-[10px] text-[var(--text-tertiary)]">(session-only, not in the DAG)</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">{entry.description}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">{timeAgo(entry.timestamp)}</span>
                  {canRestore && (
                    <Button
                      size="sm"
                      variant={confirming ? "danger" : "ghost"}
                      icon={<RotateCcw size={12} />}
                      onClick={() => {
                        if (confirming) {
                          restoreFromReflog(entry.hash);
                          setConfirmingId(null);
                        } else {
                          setConfirmingId(entry.id);
                          setTimeout(() => setConfirmingId((cur) => (cur === entry.id ? null : cur)), 2500);
                        }
                      }}
                    >
                      {confirming ? "Confirm" : "Restore"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {!loading && !fetchError && reflog.length <= 1 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-[12px] text-[var(--text-tertiary)]">
          <HistoryIcon size={14} className="shrink-0" />
          Nothing here yet — checkout, reset, commit, revert, or cherry-pick something to see it recorded.
        </div>
      )}

      <EducationalNote
        what="The reflog is a private, per-repository log of everywhere HEAD has pointed — every checkout, reset, commit, and rewrite. It isn't part of your history graph and isn't shared when you push."
        why="When a reset --hard or a rebase seems to have thrown work away, the commit usually still exists — it's just unreachable from any branch. The reflog is how you find its hash again and restore it, until Git eventually garbage-collects it (~90 days by default)."
        command="git reflog"
        undo="git reset --hard HEAD@{n}"
      />
    </div>
  );
}
