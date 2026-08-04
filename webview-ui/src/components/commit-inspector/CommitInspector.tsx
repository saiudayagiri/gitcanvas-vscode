import { AnimatePresence, motion } from "framer-motion";
import { X, Copy, GitCommitHorizontal, GitMerge, ArrowUp, ArrowDown, Check, ShieldCheck, GitBranchPlus, Undo2, Cherry, CloudOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useUIStore } from "@/store/ui-store";
import { getChildren, getCommit } from "@/lib/mock-data";
import { useCurrentBranch, useHeadHash } from "@/hooks/useCurrentBranch";
import { useLocalGraphCommits } from "@/hooks/useLocalGraphCommits";
import { useCommitTags } from "@/hooks/useTags";
import { isAncestor } from "@/lib/git-diff";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EducationalNote } from "../ui/EducationalNote";
import { FileStatusIcon } from "../ui/FileStatusIcon";
import { ResetPopover } from "./ResetPopover";
import { TagPopover } from "./TagPopover";
import { DiffViewer } from "../diff/DiffViewer";
import { CherryPickConflictPanel } from "./CherryPickConflictPanel";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CommitInspector() {
  const hash = useUIStore((s) => s.inspectedCommitHash);
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const requestCheckoutCommit = useUIStore((s) => s.requestCheckoutCommit);
  const revertCommit = useUIStore((s) => s.revertCommit);
  const undoLastCommit = useUIStore((s) => s.undoLastCommit);
  const localCommits = useUIStore((s) => s.localCommits);
  const cherryPick = useUIStore((s) => s.cherryPick);
  const cherryPickConflict = useUIStore((s) => s.cherryPickConflict);
  const cherryPickResolutions = useUIStore((s) => s.cherryPickResolutions);
  const resolveCherryPickFile = useUIStore((s) => s.resolveCherryPickFile);
  const continueCherryPick = useUIStore((s) => s.continueCherryPick);
  const abortCherryPick = useUIStore((s) => s.abortCherryPick);
  const deleteTag = useUIStore((s) => s.deleteTag);
  const tags = useCommitTags(hash ?? "");
  const [copied, setCopied] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [cherryError, setCherryError] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [cherryManualContents, setCherryManualContents] = useState<Record<string, string>>({});
  useEffect(() => {
    setExpandedFile(null);
    setRevertError(null);
    setCherryError(null);
    setUndoError(null);
    setCherryManualContents({});
  }, [hash]);

  const localGraphCommits = useLocalGraphCommits();
  const commit = hash ? getCommit(hash) ?? localGraphCommits.find((c) => c.hash === hash) : undefined;
  const children = commit ? getChildren(commit.hash) : [];
  const totalStats = commit ? commit.stats.insertions + commit.stats.deletions : 0;
  const headHash = useHeadHash();
  const currentBranch = useCurrentBranch();
  const topLocalHash = localGraphCommits[localGraphCommits.length - 1]?.hash;
  const effectiveHeadHash = topLocalHash ?? headHash;
  const isHead = commit ? commit.hash === effectiveHeadHash : false;
  const localEntry = commit ? localCommits.find((c) => c.hash === commit.hash) : undefined;
  const isLocal = Boolean(localEntry);
  const isLastLocal = Boolean(isLocal && commit?.hash === topLocalHash);
  const isAncestorOfHead = Boolean(commit && !isLocal && headHash && isAncestor(commit.hash, headHash));
  const canResetHere = Boolean(commit && currentBranch && !isHead && isAncestorOfHead);
  const canRevertHere = Boolean(commit && currentBranch && isAncestorOfHead && !commit.isMerge);
  const canUndoHere = Boolean(commit && currentBranch && isLastLocal);
  const isPendingCherryPick = Boolean(commit && cherryPickConflict?.hash === commit.hash);
  const canCherryPickHere = Boolean(commit && currentBranch && !isAncestorOfHead && !isLocal && !commit.isMerge && !isPendingCherryPick);

  return (
    <AnimatePresence>
      {commit && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => inspectCommit(null)}
          />
          <motion.aside
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="glass fixed right-0 top-0 z-50 flex h-full w-[440px] flex-col border-l border-[var(--border-default)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-tertiary)]">
                {commit.isMerge ? <GitMerge size={15} /> : <GitCommitHorizontal size={15} />}
                {commit.isMerge ? "Merge commit" : "Commit"}
              </div>
              <button
                onClick={() => inspectCommit(null)}
                className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <h1 className="text-balance text-[17px] font-semibold leading-snug text-[var(--text-primary)]">
                {commit.subject}
              </h1>
              {commit.body && (
                <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {commit.body}
                </p>
              )}

              <div className="mt-4 flex items-center gap-3">
                <Avatar author={commit.author} size={32} />
                <div>
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">{commit.author.name}</div>
                  <div className="text-[12px] text-[var(--text-tertiary)]">{formatDate(commit.authoredAt)}</div>
                </div>
                {commit.gpgSigned && (
                  <Badge role="commit" icon={<ShieldCheck size={12} />} className="ml-auto">
                    Verified
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(commit.hash).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }}
                  className="focus-ring mono-hash flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {copied ? <Check size={12} className="text-git-commit" /> : <Copy size={12} />}
                  {commit.shortHash}
                </button>
                {isHead && <Badge role="branch">HEAD</Badge>}
                {isLocal && (
                  <Badge role="staged" icon={localEntry?.pushed ? undefined : <CloudOff size={11} />}>
                    {localEntry?.pushed ? "local · pushed" : "local · unpushed"}
                  </Badge>
                )}
                {tags.map((r) => (
                  <button key={r} onClick={() => deleteTag(r)} title="Click to delete tag" className="focus-ring">
                    <Badge role="history">{r} ✕</Badge>
                  </button>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!isHead && !isLocal && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<GitBranchPlus size={12} />}
                    onClick={() => requestCheckoutCommit(commit.hash)}
                  >
                    Checkout
                  </Button>
                )}
                {!isLocal && <TagPopover hash={commit.hash} shortHash={commit.shortHash} />}
                {canResetHere && <ResetPopover hash={commit.hash} shortHash={commit.shortHash} />}
                {canRevertHere && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Undo2 size={12} />}
                    onClick={() => setRevertError(revertCommit(commit.hash))}
                  >
                    Revert
                  </Button>
                )}
                {canUndoHere && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Undo2 size={12} />}
                    onClick={() => setUndoError(undoLastCommit())}
                    title={
                      localEntry?.pushed
                        ? "Already pushed — this adds a new commit that undoes it (git revert)"
                        : "Moves this commit back to staging (git reset --soft HEAD~1)"
                    }
                  >
                    {localEntry?.pushed ? "Revert this commit" : "Undo this commit"}
                  </Button>
                )}
                {canCherryPickHere && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Cherry size={12} />}
                    onClick={() => setCherryError(cherryPick(commit.hash))}
                  >
                    Cherry-pick
                  </Button>
                )}
              </div>
              {revertError && (
                <p className="mt-1.5 text-[11px] text-git-conflict">{revertError}</p>
              )}
              {undoError && (
                <p className="mt-1.5 text-[11px] text-git-conflict">{undoError}</p>
              )}
              {cherryError && (
                <p className="mt-1.5 text-[11px] text-git-conflict">{cherryError}</p>
              )}
              {isPendingCherryPick && cherryPickConflict && (
                <CherryPickConflictPanel
                  conflict={cherryPickConflict}
                  resolutions={cherryPickResolutions}
                  manualContents={cherryManualContents}
                  onResolve={resolveCherryPickFile}
                  onManualChange={(path, content) => setCherryManualContents((m) => ({ ...m, [path]: content }))}
                  onContinue={continueCherryPick}
                  onAbort={abortCherryPick}
                />
              )}

              {/* Lineage */}
              <div className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  Relationships
                </div>
                <div className="space-y-2 text-[12px]">
                  <div className="flex items-start gap-2">
                    <ArrowUp size={13} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                    <div className="min-w-0">
                      <span className="text-[var(--text-tertiary)]">
                        {commit.parents.length > 1 ? "Parents" : "Parent"}
                      </span>{" "}
                      {commit.parents.length === 0 && <span className="text-[var(--text-secondary)]">none (root commit)</span>}
                      {commit.parents.map((p) => {
                        const pc = getCommit(p);
                        return (
                          <button
                            key={p}
                            onClick={() => inspectCommit(p)}
                            className="mono-hash mr-1.5 text-git-branch hover:underline"
                          >
                            {pc?.shortHash}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <ArrowDown size={13} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                    <div className="min-w-0">
                      <span className="text-[var(--text-tertiary)]">Children</span>{" "}
                      {children.length === 0 && <span className="text-[var(--text-secondary)]">none (branch tip)</span>}
                      {children.map((c) => (
                        <button
                          key={c.hash}
                          onClick={() => inspectCommit(c.hash)}
                          className="mono-hash mr-1.5 text-git-branch hover:underline"
                        >
                          {c.shortHash}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <EducationalNote
                what={
                  commit.isMerge
                    ? `This merge commit combines two histories into one, creating a new commit with ${commit.parents.length} parents.`
                    : `A snapshot of the repository was recorded, moving the branch pointer forward.`
                }
                why="Git records history as an append-only chain of snapshots — nothing is overwritten, only added."
                command={commit.command}
                undo={commit.isMerge ? "git reset --hard " + (commit.parents[0]?.slice(0, 7) ?? "") : "git revert " + commit.shortHash}
              />

              {/* Files changed */}
              {commit.files.length > 0 && (
                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                      {commit.files.length} file{commit.files.length !== 1 ? "s" : ""} changed
                    </div>
                    <div className="flex items-center gap-2 font-tabular text-[11px]">
                      <span className="text-git-commit">+{commit.stats.insertions}</span>
                      <span className="text-git-conflict">−{commit.stats.deletions}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {commit.files.map((f) => (
                      <div key={f.path}>
                        <button
                          onClick={() => setExpandedFile((cur) => (cur === f.path ? null : f.path))}
                          className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bg-surface)]"
                        >
                          <FileStatusIcon status={f.status} />
                          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                            {f.path}
                          </span>
                          <DiffBar insertions={f.insertions} deletions={f.deletions} max={totalStats} />
                        </button>
                        {expandedFile === f.path && (
                          <div className="mb-2 mt-1">
                            <DiffViewer path={f.path} insertions={f.insertions} deletions={f.deletions} seed={commit.hash} allowSplit={false} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DiffBar({ insertions, deletions, max }: { insertions: number; deletions: number; max: number }) {
  const total = insertions + deletions;
  const scale = max > 0 ? Math.max(total / max, 0.08) : 0;
  const insRatio = total > 0 ? insertions / total : 0;
  return (
    <div className="flex h-2.5 w-16 shrink-0 items-center gap-1.5">
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
        <div className="h-full bg-git-commit" style={{ width: `${insRatio * scale * 100}%` }} />
        <div className="h-full bg-git-conflict" style={{ width: `${(1 - insRatio) * scale * 100}%` }} />
      </div>
    </div>
  );
}
