import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import {
  Folder,
  CheckSquare,
  Box,
  Cloud,
  Archive,
  ArrowRight,
  Minus,
  Plus,
  GitCommitHorizontal,
  ArrowUpFromLine,
  ArrowDownToLine,
  ArrowRightToLine,
  Pencil,
  X as XIcon,
  Sparkles,
  Undo2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";
import { remote, timeAgo, getCommit } from "@/lib/mock-data";
import { PipelineColumn } from "@/components/working-tree/PipelineColumn";
import { FileChip } from "@/components/working-tree/FileChip";
import { DiscardFileButton } from "@/components/working-tree/DiscardFileButton";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/store/ui-store";
import { useCurrentBranch, useHeadHash } from "@/hooks/useCurrentBranch";

const SECTIONS = [
  { key: "working", label: "Working Directory", icon: Folder, role: "history" as const },
  { key: "staging", label: "Staging Area", icon: CheckSquare, role: "staged" as const },
  { key: "repo", label: "Repository", icon: Box, role: "commit" as const },
  { key: "remote", label: "Remote", icon: Cloud, role: "remote" as const },
  { key: "stash", label: "Stashes", icon: Archive, role: "remote" as const },
];

export function WorkingTreePage() {
  const currentBranch = useCurrentBranch();
  const headHash = useHeadHash();
  const branchLabel = currentBranch?.name ?? (headHash ? getCommit(headHash)?.shortHash ?? "HEAD" : "HEAD");
  const working = useUIStore((s) => s.workingFiles);
  const staged = useUIStore((s) => s.stagedFiles);
  const commitMsg = useUIStore((s) => s.commitMessage);
  const setCommitMessage = useUIStore((s) => s.setCommitMessage);
  const localCommits = useUIStore((s) => s.localCommits);
  const pushed = useUIStore((s) => s.pushedCount);
  const justPushed = useUIStore((s) => s.justPushed);
  const stageFile = useUIStore((s) => s.stageFile);
  const unstageFile = useUIStore((s) => s.unstageFile);
  const stageAll = useUIStore((s) => s.stageAll);
  const unstageAll = useUIStore((s) => s.unstageAll);
  const restoreFile = useUIStore((s) => s.restoreFile);
  const commitStaged = useUIStore((s) => s.commitStaged);
  const pushAll = useUIStore((s) => s.pushAll);
  const amendMode = useUIStore((s) => s.amendMode);
  const canAmend = useUIStore((s) => s.canAmend());
  const toggleAmendMode = useUIStore((s) => s.toggleAmendMode);
  const stashChanges = useUIStore((s) => s.stashChanges);
  const stashes = useUIStore((s) => s.stashes);
  const applyStash = useUIStore((s) => s.applyStash);
  const popStash = useUIStore((s) => s.popStash);
  const dropStash = useUIStore((s) => s.dropStash);
  const cleanUntracked = useUIStore((s) => s.cleanUntracked);
  const undoLastCommit = useUIStore((s) => s.undoLastCommit);
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const untrackedCount = working.filter((f) => f.state === "untracked").length;
  const lastCommit = localCommits[localCommits.length - 1];

  const unpushedCount = localCommits.filter((c) => !c.pushed).length;
  const canCommit = amendMode
    ? commitMsg.trim().length > 0
    : staged.length > 0 && commitMsg.trim().length > 0;

  const counts = [working.length, staged.length, unpushedCount, pushed, stashes.length];

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  // scrollIntoView reads the section's own rendered position rather than assuming every bucket
  // is exactly one clientWidth apart — the inter-bucket padding made that assumption wrong and
  // left a sliver of the previous bucket visible after jumping via a tab.
  const scrollToIndex = (i: number) => {
    sectionRefs.current[i]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Working Tree</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Stage, commit, and push on <span className="font-medium text-[var(--text-primary)]">{branchLabel}</span> —
        every action here runs a real git command in the terminal below.
      </p>

      {!currentBranch && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-git-staged/25 bg-git-staged/8 px-3.5 py-2.5 text-[12px] text-git-staged">
          <AlertTriangle size={14} className="shrink-0" />
          You're in detached HEAD. Commits made here won't belong to any branch — switch to (or create) a branch
          first if you want to keep them.
        </div>
      )}

      <EducationalNote
        what="Files move through four states: edited in your working directory, staged for the next commit, committed to your local history, then pushed to update the remote."
        why="Git splits 'saving' into stage + commit so you can build a commit out of exactly the changes you want, even if your working directory has more."
        command="git add <file> && git commit -m '…' && git push"
      />

      {/* One bucket fills the view at a time — Working Directory, Staging, Repository, Remote,
          and Stashes rarely all need attention simultaneously, and giving each the full width
          means a long file path never has to fight three other columns for room. */}
      <div className="mt-6 flex items-center gap-1 border-b border-[var(--border-subtle)]">
        {SECTIONS.map((s, i) => {
          const Icon = s.icon;
          const active = activeIndex === i;
          return (
            <button
              key={s.key}
              onClick={() => scrollToIndex(i)}
              className={clsx(
                "focus-ring flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-medium transition-colors",
                active
                  ? "border-accent text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              )}
            >
              <Icon size={13} />
              {s.label}
              {counts[i] > 0 && (
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0 font-tabular text-[10px] font-semibold",
                    active ? "bg-accent/15 text-accent" : "bg-[var(--bg-surface-2)] text-[var(--text-tertiary)]"
                  )}
                >
                  {counts[i]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="mt-4 flex snap-x snap-mandatory overflow-x-auto scroll-smooth">
        <div ref={(el) => { sectionRefs.current[0] = el; }} className="w-full shrink-0 snap-start">
          <PipelineColumn
            title="Working Directory"
            subtitle="Edited, not yet staged"
            icon={<Folder size={15} />}
            role="history"
            count={working.length}
            empty="Nothing left to stage"
          >
            <AnimatePresence mode="popLayout">
              {working.map((f) => (
                <FileChip
                  key={f.path}
                  layoutId={f.path}
                  path={f.path}
                  status={f.state}
                  insertions={f.insertions}
                  deletions={f.deletions}
                  action={
                    <div className="flex shrink-0 items-center gap-1">
                      <DiscardFileButton onConfirm={() => restoreFile(f.path)} />
                      <button
                        onClick={() => stageFile(f.path)}
                        className="focus-ring flex h-6 shrink-0 items-center gap-1 rounded-md border border-[var(--border-default)] px-1.5 text-[10px] font-medium text-[var(--text-tertiary)] opacity-60 transition-opacity hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
                      >
                        Stage <ArrowRight size={10} />
                      </button>
                    </div>
                  }
                />
              ))}
            </AnimatePresence>
          </PipelineColumn>
        </div>

        <div ref={(el) => { sectionRefs.current[1] = el; }} className="w-full shrink-0 snap-start">
          <PipelineColumn
            title="Staging Area"
            subtitle="Will be in the next commit"
            icon={<CheckSquare size={15} />}
            role="staged"
            count={staged.length}
            empty="Stage files to build a commit"
            footer={
              <div className="space-y-2">
                {amendMode && (
                  <div className="flex items-center justify-between rounded-md border border-accent/25 bg-accent/8 px-2 py-1 text-[10px] text-accent">
                    <span className="flex items-center gap-1">
                      <Pencil size={10} /> Amending last commit
                    </span>
                    <button onClick={toggleAmendMode} className="focus-ring rounded p-0.5 hover:bg-accent/15">
                      <XIcon size={10} />
                    </button>
                  </div>
                )}
                <input
                  value={commitMsg}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Commit message…"
                  disabled={!amendMode && staged.length === 0}
                  className="focus-ring h-7 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:opacity-40"
                />
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full"
                  disabled={!canCommit}
                  onClick={commitStaged}
                  icon={<GitCommitHorizontal size={12} />}
                >
                  {amendMode
                    ? "Amend commit"
                    : `Commit ${staged.length > 0 ? `${staged.length} file${staged.length !== 1 ? "s" : ""}` : ""}`}
                </Button>
                {!amendMode && canAmend && (
                  <button
                    onClick={toggleAmendMode}
                    className="focus-ring flex w-full items-center justify-center gap-1 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    <Pencil size={9} /> Amend last commit instead
                  </button>
                )}
                {((amendMode && commitMsg.trim().length === 0) || (!amendMode && staged.length > 0 && commitMsg.trim().length === 0)) && (
                  <p className="text-[10px] text-git-conflict">Aborting commit due to empty commit message.</p>
                )}
              </div>
            }
          >
            <AnimatePresence mode="popLayout">
              {staged.map((f) => (
                <FileChip
                  key={f.path}
                  layoutId={f.path}
                  path={f.path}
                  status="staged"
                  insertions={f.stagedInsertions ?? f.insertions}
                  deletions={f.stagedDeletions ?? f.deletions}
                  action={
                    <button
                      onClick={() => unstageFile(f.path)}
                      className="focus-ring flex h-6 shrink-0 items-center gap-1 rounded-md border border-[var(--border-default)] px-1.5 text-[10px] font-medium text-[var(--text-tertiary)] opacity-60 transition-opacity hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
                    >
                      <Minus size={10} /> Unstage
                    </button>
                  }
                />
              ))}
            </AnimatePresence>
          </PipelineColumn>
        </div>

        <div ref={(el) => { sectionRefs.current[2] = el; }} className="w-full shrink-0 snap-start">
          <PipelineColumn
            title="Repository"
            subtitle={`${branchLabel} · local history`}
            icon={<Box size={15} />}
            role="commit"
            count={unpushedCount}
            empty="No unpushed commits"
            footer={
              <Button size="sm" variant="secondary" className="w-full" disabled={unpushedCount === 0} onClick={pushAll} icon={<ArrowUpFromLine size={12} />}>
                Push {unpushedCount > 0 && `${unpushedCount} commit${unpushedCount !== 1 ? "s" : ""}`}
              </Button>
            }
          >
            <AnimatePresence mode="popLayout">
              {localCommits
                .filter((c) => !c.pushed)
                .map((c, i, arr) => (
                  <motion.div
                    key={c.id}
                    layout
                    layoutId={c.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="group flex items-center gap-2 rounded-lg border border-git-commit/20 bg-git-commit/8 px-2.5 py-2"
                  >
                    <GitCommitHorizontal size={13} className="shrink-0 text-git-commit" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{c.message}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{c.fileCount} files</div>
                    </div>
                    {i === arr.length - 1 && !amendMode && (
                      <button
                        onClick={toggleAmendMode}
                        title="Amend this commit"
                        className="focus-ring shrink-0 rounded p-1 text-[var(--text-tertiary)] opacity-0 hover:text-[var(--text-primary)] group-hover:opacity-100"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </motion.div>
                ))}
            </AnimatePresence>
          </PipelineColumn>
        </div>

        <div ref={(el) => { sectionRefs.current[3] = el; }} className="w-full shrink-0 snap-start">
          <PipelineColumn
            title="Remote"
            subtitle={remote.name}
            icon={<Cloud size={15} />}
            role="remote"
            count={pushed}
            empty="Nothing pushed yet this session"
          >
            <AnimatePresence mode="popLayout">
              {localCommits
                .filter((c) => c.pushed)
                .map((c) => (
                  <motion.div
                    key={c.id}
                    layout
                    layoutId={c.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="flex items-center gap-2 rounded-lg border border-git-remote/20 bg-git-remote/8 px-2.5 py-2"
                  >
                    <GitCommitHorizontal size={13} className="shrink-0 text-git-remote" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{c.message}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">synced</div>
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
            {justPushed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-git-remote/10"
              />
            )}
          </PipelineColumn>
        </div>

        <div ref={(el) => { sectionRefs.current[4] = el; }} className="w-full shrink-0 snap-start">
          <PipelineColumn
            title="Stashes"
            subtitle="Set aside — apply them back whenever you're ready"
            icon={<Archive size={15} />}
            role="remote"
            count={stashes.length}
            empty="Nothing stashed — use Stash changes below to set work aside"
          >
            <AnimatePresence mode="popLayout">
              {stashes.map((s, i) => {
                const fileCount = s.workingFiles.length + s.stagedFiles.length;
                return (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-2.5 py-2"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-git-remote/10 text-git-remote">
                      <Archive size={12} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">
                        stash@{`{${i}}`}: {s.message}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">
                        {fileCount} file{fileCount !== 1 ? "s" : ""} &middot; from {s.branchName} &middot; {timeAgo(s.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => applyStash(s.id)}
                        title="Apply — keep the stash, reapply its changes"
                        className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]"
                      >
                        <ArrowDownToLine size={11} />
                      </button>
                      <button
                        onClick={() => popStash(s.id)}
                        title="Pop — reapply and drop the stash"
                        className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]"
                      >
                        <ArrowRightToLine size={11} />
                      </button>
                      <button
                        onClick={() => dropStash(s.id)}
                        title="Drop stash"
                        className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-git-conflict/10 hover:text-git-conflict"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </PipelineColumn>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={stageAll} disabled={working.length === 0} icon={<Plus size={12} />}>
          Stage all
        </Button>
        <Button size="sm" variant="ghost" onClick={unstageAll} disabled={staged.length === 0} icon={<Minus size={12} />}>
          Unstage all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => stashChanges()}
          disabled={working.length === 0 && staged.length === 0}
          icon={<Archive size={12} />}
        >
          Stash changes
        </Button>
        {untrackedCount > 0 && (
          <Button
            size="sm"
            variant={confirmingClean ? "danger" : "ghost"}
            onClick={() => {
              if (confirmingClean) {
                cleanUntracked();
                setConfirmingClean(false);
              } else {
                setConfirmingClean(true);
                setTimeout(() => setConfirmingClean(false), 2500);
              }
            }}
            icon={<Sparkles size={12} />}
          >
            {confirmingClean ? `Confirm — remove ${untrackedCount} untracked file${untrackedCount !== 1 ? "s" : ""}?` : "Clean untracked"}
          </Button>
        )}
        {lastCommit && (
          <Button
            size="sm"
            variant={confirmingUndo ? "danger" : "ghost"}
            onClick={() => {
              if (confirmingUndo) {
                setUndoError(undoLastCommit());
                setConfirmingUndo(false);
              } else {
                setConfirmingUndo(true);
                setUndoError(null);
                setTimeout(() => setConfirmingUndo(false), 2500);
              }
            }}
            icon={<Undo2 size={12} />}
            title={
              lastCommit.pushed
                ? `"${lastCommit.message}" is already pushed — this adds a new commit that undoes it (git revert)`
                : `Moves "${lastCommit.message}" back to staging (git reset --soft HEAD~1)`
            }
          >
            {confirmingUndo
              ? lastCommit.pushed
                ? "Confirm — revert last commit?"
                : "Confirm — uncommit?"
              : lastCommit.pushed
                ? "Revert last commit"
                : "Undo last commit"}
          </Button>
        )}
        <span className="text-[12px] text-[var(--text-tertiary)]">
          This sandbox persists as you navigate and switch branches — open the terminal to see every command it runs.
        </span>
      </div>
      {undoError && <p className="mt-2 text-[11px] text-git-conflict">{undoError}</p>}
    </div>
  );
}
