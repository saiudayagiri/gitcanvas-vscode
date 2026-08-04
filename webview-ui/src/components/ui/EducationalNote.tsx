import { AnimatePresence, motion } from "framer-motion";
import { GraduationCap, Undo2, Terminal } from "lucide-react";
import { useEducationalMode } from "@/context/EducationalModeContext";

export function EducationalNote({
  what,
  why,
  command,
  undo,
}: {
  what: string;
  why: string;
  command?: string;
  undo?: string;
}) {
  const { enabled } = useEducationalMode();
  return (
    <AnimatePresence>
      {enabled && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 12 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="rounded-xl border border-accent/25 bg-accent/8 p-3.5 text-[13px] leading-relaxed">
            <div className="mb-1.5 flex items-center gap-1.5 text-accent font-semibold text-xs uppercase tracking-wide">
              <GraduationCap size={13} strokeWidth={2.5} />
              What's happening
            </div>
            <p className="text-[var(--text-primary)]">{what}</p>
            <p className="mt-1.5 text-[var(--text-secondary)]">{why}</p>
            {(command || undo) && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-accent/15 pt-2.5">
                {command && (
                  <div className="flex items-center gap-1.5">
                    <Terminal size={12} className="text-[var(--text-tertiary)]" />
                    <code className="mono-hash text-[12px] text-[var(--text-secondary)]">{command}</code>
                  </div>
                )}
                {undo && (
                  <div className="flex items-center gap-1.5">
                    <Undo2 size={12} className="text-[var(--text-tertiary)]" />
                    <code className="mono-hash text-[12px] text-[var(--text-secondary)]">{undo}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
