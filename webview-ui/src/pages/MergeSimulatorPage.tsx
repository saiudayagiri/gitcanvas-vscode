import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GitMerge, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { simulateMerge, mergeableBranches } from "@/lib/merge-sim";
import { mainBranch, getCommit, hasCommits } from "@/lib/mock-data";
import { EmptyRepoNotice } from "@/components/ui/EmptyRepoNotice";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { ConflictFileCard } from "@/components/conflict/ConflictFileCard";
import { SimulatorRealnessBadge } from "@/components/ui/SimulatorRealnessBadge";
import { isFileResolved, type ConflictResolution } from "@/lib/conflict-markers";
import { useUIStore } from "@/store/ui-store";
import { makeHash, shortHash } from "@/lib/hash";
import { isInVsCode } from "@/lib/vscode-bridge";
import { dispatchAndLog } from "@/lib/dispatch-command";
import clsx from "clsx";

export function MergeSimulatorPage() {
  const [branchName, setBranchName] = useState(mergeableBranches()[0]?.name ?? "");
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});
  const [manualContents, setManualContents] = useState<Record<string, string>>({});
  const [merged, setMerged] = useState(false);
  const logCommand = useUIStore((s) => s.logCommand);
  const currentBranchName = useUIStore((s) => s.currentBranchName);

  const result = useMemo(() => simulateMerge(branchName), [branchName]);

  if (!hasCommits()) {
    return (
      <EmptyRepoNotice
        title="No commits yet"
        detail="This repository is empty, so there's nothing to merge. Stage and commit your first change, then come back here to preview a merge."
      />
    );
  }

  const mainHead = getCommit(mainBranch().headHash)!;
  const branchHead = branchName ? getCommit(mergeableBranches().find((b) => b.name === branchName)!.headHash) : null;

  const allResolved = result.conflicts.every((c) => isFileResolved(resolutions[c.path] ?? null, manualContents[c.path]));

  const selectBranch = (name: string) => {
    setBranchName(name);
    setResolutions({});
    setManualContents({});
    setMerged(false);
  };

  const resolve = (path: string, choice: ConflictResolution) => setResolutions((r) => ({ ...r, [path]: choice }));
  const setManualContent = (path: string, content: string) => setManualContents((m) => ({ ...m, [path]: content }));

  const willRunForReal = currentBranchName === mainBranch().name;

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Merge Simulator</h1>
        <SimulatorRealnessBadge
          willRunForReal={willRunForReal}
          previewReason={`check out ${mainBranch().name} to run this merge for real`}
        />
      </div>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Preview what merging a branch into <span className="font-medium text-[var(--text-primary)]">{mainBranch().name}</span> would
        actually do — before you run it for real.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[var(--text-tertiary)]">Merge branch:</span>
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

      {!merged && branchHead && (
        <>
          <Panel className="mt-5" glass>
            <div className="flex items-center justify-center gap-6 py-2">
              <BranchPreviewNode label={branchName} subject={branchHead.subject} color="var(--color-git-branch)" />
              <div className="flex flex-col items-center gap-1 text-[var(--text-tertiary)]">
                <GitMerge size={18} />
                <span className="text-[10px]">into</span>
              </div>
              <BranchPreviewNode label={mainBranch().name} subject={mainHead.subject} color="var(--color-git-history)" align="right" />
            </div>
          </Panel>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatBox label={`Files on ${mainBranch().name}`} value={result.files.filter((f) => f.oursInsertions + f.oursDeletions > 0).length} />
            <StatBox label={`Files on ${branchName.split("/")[1] ?? branchName}`} value={result.files.filter((f) => f.theirsInsertions + f.theirsDeletions > 0).length} />
            <StatBox
              label="Conflicts"
              value={result.conflicts.length}
              tone={result.conflicts.length > 0 ? "conflict" : "commit"}
            />
          </div>

          {result.conflicts.length > 0 ? (
            <Panel className="mt-4">
              <PanelHeader
                title={
                  <span className="flex items-center gap-2 text-git-conflict">
                    <AlertTriangle size={15} /> {result.conflicts.length} conflicting file
                    {result.conflicts.length !== 1 ? "s" : ""}
                  </span>
                }
                subtitle="Both branches changed the same file. Pick a resolution for each before merging."
              />
              <div className="space-y-2">
                {result.conflicts.map((f) => (
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
                    seed={`merge-${branchName}`}
                    onResolve={(choice) => resolve(f.path, choice)}
                    onManualChange={(content) => setManualContent(f.path, content)}
                  />
                ))}
              </div>
            </Panel>
          ) : (
            <Panel className="mt-4">
              <div className="flex items-center gap-2 text-git-commit">
                <CheckCircle2 size={16} />
                <span className="text-[13px] font-medium">No conflicts — this merge will apply cleanly.</span>
              </div>
            </Panel>
          )}

          <EducationalNote
            what="A merge combines two histories with a new commit that has two parents. If both sides changed the same lines, Git can't guess which one you want — that's a conflict."
            why="Conflict markers (<<<<<<<, =======, >>>>>>>) appear directly in the file so you can resolve them by hand, then stage the result and finish the merge."
            command={`git merge ${branchName}`}
            undo="git merge --abort"
          />

          <Button
            variant="primary"
            className="mt-5"
            disabled={result.conflicts.length > 0 && !allResolved}
            onClick={() => {
              setMerged(true);
              const fakeHash = shortHash(makeHash("merge-" + branchName + Date.now()));
              logCommand(
                `git merge ${branchName}`,
                result.conflicts.length > 0
                  ? `Auto-merging...\nResolved ${result.conflicts.length} conflict${result.conflicts.length !== 1 ? "s" : ""}\nMerge made by the 'ort' strategy.\n[main ${fakeHash}] Merge branch '${branchName}'`
                  : `Merge made by the 'ort' strategy.\n[main ${fakeHash}] Merge branch '${branchName}'`
              );
              // only safe to run for real if the real checked-out branch actually matches what
              // this preview shows merging into — otherwise a real `git merge` would land on
              // whatever branch is actually checked out, not the "main" depicted here.
              if (isInVsCode() && currentBranchName === mainBranch().name) {
                dispatchAndLog({ kind: "merge", branchName });
              }
            }}
            icon={<GitMerge size={14} />}
          >
            {result.conflicts.length > 0 ? "Complete merge" : "Create merge commit"}
          </Button>
        </>
      )}

      <AnimatePresence>
        {merged && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
            <Panel glass className="border-git-commit/25 bg-git-commit/6">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-git-commit/15 text-git-commit"
                >
                  <CheckCircle2 size={20} />
                </motion.div>
                <div>
                  <div className="text-[14px] font-semibold text-[var(--text-primary)]">Merge complete</div>
                  <div className="text-[12px] text-[var(--text-secondary)]">
                    Created a new merge commit on <span className="font-medium">{mainBranch().name}</span> joining {branchName}.
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-4">
                <div className="h-2.5 w-2.5 rounded-full bg-git-history" />
                <div className="h-px w-10 bg-[var(--border-strong)]" />
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-git-commit"
                >
                  <GitMerge size={9} className="text-git-commit" />
                </motion.div>
                <div className="h-px w-10 bg-[var(--border-strong)]" />
                <div className="h-2.5 w-2.5 rounded-full bg-git-branch" />
              </div>
              <Button variant="ghost" size="sm" className="mt-4" onClick={() => selectBranch(mergeableBranches()[0]?.name ?? "")} icon={<RotateCcw size={12} />}>
                Try another merge
              </Button>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BranchPreviewNode({
  label,
  subject,
  color,
  align = "left",
}: {
  label: string;
  subject: string;
  color: string;
  align?: "left" | "right";
}) {
  return (
    <div className={clsx("flex w-[220px] min-w-0 flex-col gap-1.5", align === "right" ? "items-end text-right" : "items-start")}>
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: color + "55", color }}>
        {label}
      </span>
      <span className="block w-full truncate text-[12px] text-[var(--text-secondary)]">{subject}</span>
    </div>
  );
}

function StatBox({ label, value, tone = "history" }: { label: string; value: number; tone?: "history" | "commit" | "conflict" }) {
  const toneClass = tone === "conflict" ? "text-git-conflict" : tone === "commit" ? "text-git-commit" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 text-center">
      <div className={clsx("font-tabular text-xl font-semibold", toneClass)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{label}</div>
    </div>
  );
}
