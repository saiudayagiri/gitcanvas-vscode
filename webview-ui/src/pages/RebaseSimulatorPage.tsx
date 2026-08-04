import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rows3,
  RotateCcw,
  AlertTriangle,
  GitCommitHorizontal,
  ArrowDown,
  CheckCircle2,
  SkipForward,
  Ban,
  Play,
  ListTree,
  Pencil,
  Layers,
} from "lucide-react";
import { getRebasePlan } from "@/lib/rebase-sim";
import { mainBranch, hasCommits } from "@/lib/mock-data";
import { EmptyRepoNotice } from "@/components/ui/EmptyRepoNotice";
import { SimulatorRealnessBadge } from "@/components/ui/SimulatorRealnessBadge";
import { buildTodo, buildGroups, type TodoItem, type RebaseGroup } from "@/lib/interactive-rebase";
import { mergeableBranches } from "@/lib/merge-sim";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { Avatar } from "@/components/ui/Avatar";
import { RebaseTodoEditor } from "@/components/rebase/RebaseTodoEditor";
import { ConflictFileCard } from "@/components/conflict/ConflictFileCard";
import { isFileResolved, type ConflictResolution } from "@/lib/conflict-markers";
import { useUIStore } from "@/store/ui-store";
import { isInVsCode } from "@/lib/vscode-bridge";
import { dispatchAndLog } from "@/lib/dispatch-command";
import type { Author } from "@/types/git";
import clsx from "clsx";

type Status = "idle" | "paused" | "done";

export function RebaseSimulatorPage() {
  const [branchName, setBranchName] = useState(mergeableBranches()[0]?.name ?? "");
  const [interactive, setInteractive] = useState(false);
  const [todo, setTodo] = useState<TodoItem[]>(() => buildTodo(mergeableBranches()[0]?.name ?? ""));
  const [status, setStatus] = useState<Status>("idle");
  const [pointer, setPointer] = useState(0);
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set());
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});
  const [manualContents, setManualContents] = useState<Record<string, string>>({});
  const [startError, setStartError] = useState<string | null>(null);
  const plan = useMemo(() => getRebasePlan(branchName), [branchName]);
  const groups = useMemo(() => buildGroups(branchName, todo), [branchName, todo]);
  const logCommand = useUIStore((s) => s.logCommand);
  const currentBranchName = useUIStore((s) => s.currentBranchName);

  if (!hasCommits()) {
    return (
      <EmptyRepoNotice
        title="No commits yet"
        detail="This repository is empty, so there's nothing to rebase. Stage and commit your first change, then come back here to preview a rebase."
      />
    );
  }
  // Guaranteed non-null now that hasCommits() is true — main's tip commit always resolves.
  const base = plan.base!;

  const paused = status === "paused" ? groups[pointer] : null;
  const allResolved = paused
    ? paused.conflictingFiles.every((f) => isFileResolved(resolutions[f.path] ?? null, manualContents[f.path]))
    : false;

  const needsPause = (g: RebaseGroup) => g.headAction === "edit" || g.conflictingFiles.length > 0;

  const findNextPause = (start: number, skipped: Set<number>) => {
    for (let i = start; i < groups.length; i++) {
      if (skipped.has(i)) continue;
      if (needsPause(groups[i])) return i;
    }
    return groups.length;
  };

  const resetState = () => {
    setStatus("idle");
    setPointer(0);
    setSkippedIndices(new Set());
    setResolutions({});
    setManualContents({});
    setStartError(null);
  };

  const selectBranch = (name: string) => {
    setBranchName(name);
    setTodo(buildTodo(name));
    resetState();
  };

  const toggleInteractive = () => {
    setInteractive((v) => !v);
    setTodo(buildTodo(branchName));
    resetState();
  };

  const pauseMessage = (g: RebaseGroup) => {
    const parts: string[] = [];
    if (g.conflictingFiles.length > 0) {
      parts.push(
        `error: could not apply ${g.members[0].commit.shortHash}... ${g.message}\nCONFLICT (content): Merge conflict in ${g.conflictingFiles.map((f) => f.path).join(", ")}\nhint: Resolve above, then run "git rebase --continue"`
      );
    }
    if (g.headAction === "edit") {
      parts.push(`Stopped at ${g.members[0].commit.shortHash}... ${g.message}\nYou can amend the commit now, with\n\n  git commit --amend\n\nOnce done, run\n\n  git rebase --continue`);
    }
    return parts.join("\n");
  };

  const runRebase = () => {
    if (interactive && todo[0] && (todo[0].action === "squash" || todo[0].action === "fixup")) {
      setStartError("Can't squash or fixup as the very first commit — there's nothing before it to fold into.");
      return;
    }
    setStartError(null);
    const next = findNextPause(0, skippedIndices);
    setPointer(next);
    const command = interactive ? `git rebase -i ${mainBranch().name}` : `git rebase ${mainBranch().name}`;
    if (next >= groups.length) {
      setStatus("done");
      logCommand(
        command,
        `First, rewinding head to replay your work on top of it...\n` +
          groups.map((g) => `Applying: ${g.message}`).join("\n") +
          (groups.length === 0 ? "(nothing to apply)" : "") +
          `\nSuccessfully rebased and updated ${branchName}.`
      );
      // only the plain, zero-pause fast path is safe to run for real — reordering/squashing
      // would need to drive git's actual interactive-rebase machinery, and a real conflict
      // wouldn't map onto this simulator's fake per-commit resolution UI.
      if (isInVsCode() && !interactive && currentBranchName === branchName) {
        dispatchAndLog({ kind: "rebase", branchName: base.shortHash });
      }
    } else {
      setStatus("paused");
      logCommand(
        command,
        `First, rewinding head to replay your work on top of it...\n` +
          groups
            .slice(0, next)
            .map((g) => `Applying: ${g.message}`)
            .join("\n") +
          (next > 0 ? "\n" : "") +
          `Applying: ${groups[next].message}\n${pauseMessage(groups[next])}`
      );
    }
  };

  const resolve = (path: string, choice: ConflictResolution) => setResolutions((r) => ({ ...r, [path]: choice }));
  const setManualContent = (path: string, content: string) => setManualContents((m) => ({ ...m, [path]: content }));

  const continueRebase = () => {
    if (!paused || !allResolved) return;
    const next = findNextPause(pointer + 1, skippedIndices);
    setResolutions({});
    setManualContents({});
    setPointer(next);
    if (next >= groups.length) {
      setStatus("done");
      logCommand(`git rebase --continue`, `Successfully rebased and updated ${branchName}.`);
    } else {
      setStatus("paused");
      logCommand(`git rebase --continue`, `Applying: ${groups[next].message}\n${pauseMessage(groups[next])}`);
    }
  };

  const skipCommit = () => {
    if (!paused) return;
    const skipped = new Set(skippedIndices);
    skipped.add(pointer);
    setSkippedIndices(skipped);
    setResolutions({});
    setManualContents({});
    const next = findNextPause(pointer + 1, skipped);
    setPointer(next);
    if (next >= groups.length) {
      setStatus("done");
      logCommand(`git rebase --skip`, `Successfully rebased and updated ${branchName}.`);
    } else {
      setStatus("paused");
      logCommand(`git rebase --skip`, `Applying: ${groups[next].message}\n${pauseMessage(groups[next])}`);
    }
  };

  const abortRebase = () => {
    logCommand(
      `git rebase --abort`,
      `HEAD is now at ${base.shortHash} ${base.subject}\n(rebase aborted, ${branchName} restored to its original state)`
    );
    setTodo(buildTodo(branchName));
    resetState();
  };

  const started = status !== "idle";
  const willRunForReal = !interactive && currentBranchName === branchName;
  const previewReason = interactive
    ? "interactive rebase (reorder/squash/fixup/reword) doesn't run for real yet"
    : `check out ${branchName || "this branch"} to run this rebase for real`;

  return (
    <div className="mx-auto max-w-[1000px] px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Rebase Simulator</h1>
        <SimulatorRealnessBadge willRunForReal={willRunForReal} previewReason={previewReason} />
      </div>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Replay {branchName || "a branch"}'s commits on top of {mainBranch().name}'s latest tip — one commit at a time,
        pausing exactly where a real rebase would.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--text-tertiary)]">Rebase branch:</span>
          {mergeableBranches().map((b) => (
            <button
              key={b.name}
              onClick={() => selectBranch(b.name)}
              className={clsx(
                "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                branchName === b.name
                  ? "border-git-branch/40 bg-git-branch/12 text-git-branch"
                  : "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
        <button
          onClick={toggleInteractive}
          className={clsx(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
            interactive
              ? "border-accent/40 bg-accent/12 text-accent"
              : "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
          )}
        >
          <ListTree size={12} /> Interactive rebase
        </button>
      </div>

      {interactive && status === "idle" && (
        <Panel className="mt-5">
          <PanelHeader
            title="Rebase plan"
            subtitle="Reorder, reword, squash, fixup, or drop — then start the rebase."
            eyebrow={`git rebase -i ${mainBranch().name}`}
          />
          {todo.length > 0 ? (
            <RebaseTodoEditor todo={todo} onChange={setTodo} />
          ) : (
            <p className="text-[12px] text-[var(--text-tertiary)]">No commits to rebase on this branch.</p>
          )}
          {startError && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-git-conflict">
              <AlertTriangle size={12} className="shrink-0" /> {startError}
            </p>
          )}
        </Panel>
      )}

      {(!interactive || status !== "idle") && (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Before" subtitle={`Diverged from ${mainBranch().name}`} eyebrow="Current" />
            <div className="space-y-2">
              <CommitChip label={base.subject} hash={base.shortHash} tone="history" pinned={`${mainBranch().name} tip`} />
              <div className="flex items-center gap-2 py-1 pl-2 text-[11px] text-[var(--text-tertiary)]">
                <ArrowDown size={12} />
                {mainBranch().name} has moved on without this branch
              </div>
              {plan.originalCommits.map((c) => (
                <CommitChip key={c.hash} label={c.subject} hash={c.shortHash} tone="branch" author={c.author} />
              ))}
            </div>
          </Panel>

          <Panel className={status === "done" ? "border-git-commit/25" : status === "paused" ? "border-git-conflict/25" : undefined}>
            <PanelHeader
              title="After"
              subtitle={
                status === "done"
                  ? "Linear history, replayed on the new base"
                  : status === "paused"
                    ? "Paused — resolve to continue"
                    : "Run the rebase to preview"
              }
              eyebrow="Rewritten"
            />
            <div className="space-y-2">
              <CommitChip label={base.subject} hash={base.shortHash} tone="history" pinned="new base" />
              {!started && (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border-default)] py-8 text-center">
                  <Rows3 size={20} className="text-[var(--text-tertiary)]" />
                  <p className="max-w-[220px] text-[12px] text-[var(--text-tertiary)]">
                    Commits will replay here, one at a time, each with a brand-new hash.
                  </p>
                </div>
              )}
              <AnimatePresence>
                {started &&
                  groups.slice(0, pointer).map((g, i) => (
                    <motion.div
                      key={g.id}
                      initial={{ opacity: 0, y: -12, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <CommitChip
                        label={g.message}
                        hash={g.newShortHash}
                        oldHash={g.members[0].commit.shortHash}
                        tone={skippedIndices.has(i) ? "skipped" : "branch"}
                        author={g.members[0].commit.author}
                        foldedCount={g.members.length > 1 ? g.members.length : undefined}
                      />
                    </motion.div>
                  ))}
              </AnimatePresence>

              {paused && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                  <ConflictCard
                    group={paused}
                    resolutions={resolutions}
                    manualContents={manualContents}
                    onResolve={resolve}
                    onManualChange={setManualContent}
                    branchName={branchName}
                  />
                </motion.div>
              )}
            </div>
          </Panel>
        </div>
      )}

      <EducationalNote
        what="Rebase doesn't move commits — it creates brand-new commits with the same changes on top of a different base, then discards the originals. That's why every replayed commit gets a new hash."
        why={`When a replayed commit touches a file ${mainBranch().name} also changed, Git stops entirely — right there, mid-rebase — until you resolve the conflict and run --continue, skip the commit, or abort back to where you started. Interactive rebase (-i) additionally lets you reorder, reword, squash, fixup, or drop commits before any of that replay happens.`}
        command={interactive ? `git rebase -i ${mainBranch().name}` : `git rebase ${mainBranch().name}`}
        undo="git rebase --abort"
      />

      {status === "done" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-git-commit/25 bg-git-commit/8 px-3.5 py-2.5 text-[12px] text-git-commit">
          <CheckCircle2 size={14} className="shrink-0" />
          Successfully rebased and updated {branchName}.
          {skippedIndices.size > 0 && ` ${skippedIndices.size} commit${skippedIndices.size !== 1 ? "s were" : " was"} skipped.`}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {status === "idle" && (
          <Button variant="primary" onClick={runRebase} icon={interactive ? <ListTree size={14} /> : <Rows3 size={14} />}>
            {interactive ? "Start rebase" : "Run rebase"}
          </Button>
        )}
        {status === "paused" && (
          <>
            <Button variant="primary" onClick={continueRebase} disabled={!allResolved} icon={<Play size={13} />}>
              Continue rebase
            </Button>
            <Button variant="ghost" onClick={skipCommit} icon={<SkipForward size={13} />}>
              Skip this commit
            </Button>
            <Button variant="danger" onClick={abortRebase} icon={<Ban size={13} />}>
              Abort rebase
            </Button>
          </>
        )}
        {status === "done" && (
          <Button variant="ghost" onClick={resetState} icon={<RotateCcw size={13} />}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

function ConflictCard({
  group,
  resolutions,
  manualContents,
  onResolve,
  onManualChange,
  branchName,
}: {
  group: RebaseGroup;
  resolutions: Record<string, ConflictResolution>;
  manualContents: Record<string, string>;
  onResolve: (path: string, choice: ConflictResolution) => void;
  onManualChange: (path: string, content: string) => void;
  branchName: string;
}) {
  return (
    <div className="space-y-2.5">
      {group.headAction === "edit" && (
        <div className="rounded-xl border border-git-staged/30 bg-git-staged/6 p-3">
          <div className="flex items-center gap-2 text-git-staged">
            <Pencil size={14} className="shrink-0" />
            <span className="text-[12px] font-semibold">
              Editing "{group.message}" ({group.members[0].commit.shortHash})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            Applied cleanly. Rebase stopped here because this commit is marked "edit" — amend it, then continue.
          </p>
        </div>
      )}
      {group.conflictingFiles.length > 0 && (
        <div className="rounded-xl border border-git-conflict/30 bg-git-conflict/6 p-3">
          <div className="flex items-center gap-2 text-git-conflict">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="text-[12px] font-semibold">
              Conflict applying "{group.message}" ({group.members[0].commit.shortHash})
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            {mainBranch().name} also changed the file{group.conflictingFiles.length !== 1 ? "s" : ""} below since this branch forked.
            Pick a resolution for each before continuing.
          </p>
          <div className="mt-2.5 space-y-2">
            {group.conflictingFiles.map((f) => (
              <ConflictFileCard
                key={f.path}
                path={f.path}
                oursLabel={mainBranch().name}
                theirsLabel={branchName}
                oursInsertions={f.oursInsertions}
                oursDeletions={f.oursDeletions}
                theirsInsertions={f.theirsInsertions}
                theirsDeletions={f.theirsDeletions}
                resolution={resolutions[f.path] ?? null}
                manualContent={manualContents[f.path]}
                seed={`rebase-${branchName}-${group.id}`}
                onResolve={(choice) => onResolve(f.path, choice)}
                onManualChange={(content) => onManualChange(f.path, content)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommitChip({
  label,
  hash,
  oldHash,
  tone,
  pinned,
  author,
  foldedCount,
}: {
  label: string;
  hash: string;
  oldHash?: string;
  tone: "history" | "branch" | "skipped";
  pinned?: string;
  author?: Author;
  foldedCount?: number;
}) {
  const color =
    tone === "history" ? "var(--color-git-history)" : tone === "skipped" ? "var(--text-tertiary)" : "var(--color-git-branch)";
  return (
    <div
      className={clsx(
        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5",
        tone === "skipped" ? "border-[var(--border-subtle)] bg-[var(--bg-surface-2)] opacity-50" : "border-[var(--border-subtle)] bg-[var(--bg-surface-2)]"
      )}
    >
      {author ? (
        <Avatar author={author} size={24} />
      ) : (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: color + "22" }}>
          <GitCommitHorizontal size={13} color={color} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={clsx("truncate text-[12px] font-medium text-[var(--text-primary)]", tone === "skipped" && "line-through")}>
          {label}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-tabular text-[10px] text-[var(--text-tertiary)]">
          {oldHash && <span className="text-[var(--text-tertiary)] line-through opacity-60">{oldHash}</span>}
          <span className="font-semibold" style={{ color }}>
            {hash}
          </span>
        </div>
      </div>
      {foldedCount && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
          <Layers size={10} /> {foldedCount} folded
        </span>
      )}
      {pinned && (
        <span className="shrink-0 rounded-full bg-[var(--bg-surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
          {pinned}
        </span>
      )}
      {tone === "skipped" && (
        <span className="shrink-0 rounded-full bg-[var(--bg-surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
          skipped
        </span>
      )}
    </div>
  );
}
