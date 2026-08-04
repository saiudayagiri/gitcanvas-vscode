import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, GitBranch, GitCommitHorizontal, Archive, ArrowRightLeft } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { getCommit } from "@/lib/mock-data";
import { shortHash as fullShortHash } from "@/lib/hash";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

export function BranchSwitchGuard() {
  const pendingCheckout = useUIStore((s) => s.pendingCheckout);
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const detachedHash = useUIStore((s) => s.detachedHash);
  const workingFiles = useUIStore((s) => s.workingFiles);
  const stagedFiles = useUIStore((s) => s.stagedFiles);
  const confirmCheckout = useUIStore((s) => s.confirmCheckout);
  const cancelCheckout = useUIStore((s) => s.cancelCheckout);

  const dirtyCount = workingFiles.length + stagedFiles.length;
  const fromLabel = currentBranchName ?? (detachedHash ? fullShortHash(detachedHash) : "HEAD");
  const targetLabel = pendingCheckout
    ? pendingCheckout.type === "branch"
      ? pendingCheckout.name
      : getCommit(pendingCheckout.hash)?.shortHash ?? fullShortHash(pendingCheckout.hash)
    : "";
  const command = pendingCheckout
    ? pendingCheckout.type === "branch"
      ? `git switch ${pendingCheckout.name}`
      : `git checkout ${targetLabel}`
    : "";

  return (
    <AnimatePresence>
      {pendingCheckout && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 bg-black/50"
            onClick={cancelCheckout}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-1/2 z-100 w-full max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <Panel glass className="border-git-staged/25">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-git-staged/15 text-git-staged">
                  <AlertTriangle size={17} />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Uncommitted changes</h2>
                  <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                    You have {dirtyCount} uncommitted file{dirtyCount !== 1 ? "s" : ""} on{" "}
                    <span className="font-medium text-[var(--text-primary)]">{fromLabel}</span>. What should happen
                    to them when you {pendingCheckout.type === "branch" ? "switch to" : "check out"}{" "}
                    <span className="font-medium text-[var(--text-primary)]">{targetLabel}</span>?
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <button
                  onClick={() => confirmCheckout("bring")}
                  className="focus-ring flex w-full items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-left transition-colors hover:border-git-branch/40 hover:bg-git-branch/8"
                >
                  <ArrowRightLeft size={16} className="shrink-0 text-git-branch" />
                  <div>
                    <div className="text-[13px] font-medium text-[var(--text-primary)]">Bring changes with me</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      Keep them in the working directory on the new branch — what `git switch` does by default.
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => confirmCheckout("stash")}
                  className="focus-ring flex w-full items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 text-left transition-colors hover:border-git-remote/40 hover:bg-git-remote/8"
                >
                  <Archive size={16} className="shrink-0 text-git-remote" />
                  <div>
                    <div className="text-[13px] font-medium text-[var(--text-primary)]">Stash, then switch</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      Set them aside on {fromLabel} so the working directory starts clean.
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                  {pendingCheckout.type === "branch" ? <GitBranch size={11} /> : <GitCommitHorizontal size={11} />}
                  {command}
                </span>
                <Button variant="ghost" size="sm" onClick={cancelCheckout}>
                  Cancel
                </Button>
              </div>
            </Panel>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
