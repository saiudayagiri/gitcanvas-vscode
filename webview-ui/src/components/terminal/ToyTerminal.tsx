import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TerminalSquare, X, Trash2 } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { useCurrentBranch, useHeadHash } from "@/hooks/useCurrentBranch";
import { getCommit } from "@/lib/mock-data";

export function ToyTerminal() {
  const open = useUIStore((s) => s.terminalOpen);
  const setOpen = useUIStore((s) => s.setTerminalOpen);
  const log = useUIStore((s) => s.commandLog);
  const branch = useCurrentBranch();
  const headHash = useHeadHash();
  const promptLabel = branch?.name ?? (headHash ? getCommit(headHash)?.shortHash ?? "HEAD" : "HEAD");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log, open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "`" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;
        e.preventDefault();
        useUIStore.getState().toggleTerminal();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 260, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 overflow-hidden border-t border-[var(--border-default)] bg-[#0a0a0d]"
        >
          <div className="flex h-8 items-center justify-between border-b border-white/10 px-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-white/60">
              <TerminalSquare size={13} />
              Terminal — every GUI action, shown as the real git command
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => useUIStore.setState({ commandLog: [] })}
                className="focus-ring flex h-6 w-6 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white/80"
                title="Clear"
              >
                <Trash2 size={12} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="focus-ring flex h-6 w-6 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white/80"
                title="Close (`)"
              >
                <X size={12} />
              </button>
            </div>
          </div>
          <div ref={scrollRef} className="h-[calc(100%-2rem)] overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed">
            {log.length === 0 && (
              <div className="text-white/30">
                Stage a file, commit, push, or switch a branch — the equivalent git command will show up here.
              </div>
            )}
            {log.map((entry) => (
              <div key={entry.id} className="mb-1.5">
                <div className="flex items-start gap-1.5">
                  <span className="shrink-0 text-git-commit">➜</span>
                  <span className="shrink-0 text-git-branch">{promptLabel}</span>
                  <span className="whitespace-pre-wrap break-all text-white/90">{entry.command}</span>
                </div>
                {entry.output && (
                  <div className="whitespace-pre-wrap pl-5 text-white/45">{entry.output}</div>
                )}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-white/50">
              <span className="text-git-commit">➜</span>
              <span className="text-git-branch">{promptLabel}</span>
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="h-3.5 w-1.5 bg-white/50"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ToyTerminalToggle() {
  const open = useUIStore((s) => s.terminalOpen);
  const toggle = useUIStore((s) => s.toggleTerminal);
  const count = useUIStore((s) => s.commandLog.length);

  return (
    <button
      onClick={toggle}
      className={
        "focus-ring flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors " +
        (open
          ? "border-accent/30 bg-accent/12 text-accent"
          : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]")
      }
      title="Toggle terminal (`)"
    >
      <TerminalSquare size={14} />
      Terminal
      {count > 0 && (
        <span className="rounded-full bg-[var(--bg-surface-3)] px-1.5 py-0.5 font-tabular text-[10px] text-[var(--text-tertiary)]">
          {count}
        </span>
      )}
    </button>
  );
}
