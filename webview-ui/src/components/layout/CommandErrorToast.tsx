import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useUIStore } from "@/store/ui-store";

/** Surfaces failures from real git commands run in the background (stage, commit, push,
 * branch, stash, tag, ...) — these can't return an error synchronously through each store
 * action without changing every caller, so they land in `lastCommandError` instead. */
export function CommandErrorToast() {
  const error = useUIStore((s) => s.lastCommandError);
  const clear = useUIStore((s) => s.clearCommandError);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clear, 6000);
    return () => clearTimeout(timer);
  }, [error, clear]);

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="glass fixed bottom-5 left-1/2 z-[100] flex max-w-[520px] -translate-x-1/2 items-start gap-2.5 rounded-xl border border-git-conflict/30 bg-git-conflict/10 px-4 py-3 shadow-2xl"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-git-conflict" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-git-conflict">Git command failed</div>
            <div className="mt-0.5 whitespace-pre-line break-words text-[12px] text-[var(--text-secondary)]">{error}</div>
          </div>
          <button
            onClick={clear}
            className="focus-ring flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-git-conflict/15 hover:text-git-conflict"
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
