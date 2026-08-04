import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { History, AlertTriangle } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import type { ResetMode } from "@/store/ui-store";
import { Button } from "../ui/Button";

const MODES: { mode: ResetMode; label: string; description: string; danger?: boolean }[] = [
  {
    mode: "soft",
    label: "Soft",
    description: "Move the branch pointer only. Everything since this commit becomes staged, ready to re-commit.",
  },
  {
    mode: "mixed",
    label: "Mixed",
    description: "Move the branch pointer and unstage everything. Changes stay in your working directory.",
  },
  {
    mode: "hard",
    label: "Hard",
    description: "Move the branch pointer and discard all uncommitted changes. This can't be undone here.",
    danger: true,
  },
];

export function ResetPopover({ hash, shortHash }: { hash: string; shortHash: string }) {
  const resetTo = useUIStore((s) => s.resetTo);
  const [confirmingHard, setConfirmingHard] = useState(false);

  const run = (mode: ResetMode) => {
    if (mode === "hard" && !confirmingHard) {
      setConfirmingHard(true);
      return;
    }
    resetTo(hash, mode);
    setConfirmingHard(false);
  };

  return (
    <Popover.Root onOpenChange={() => setConfirmingHard(false)}>
      <Popover.Trigger asChild>
        <Button size="sm" variant="ghost" icon={<History size={12} />}>
          Reset here
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          className="glass animate-pop z-50 w-80 rounded-xl border border-[var(--border-default)] p-3 shadow-2xl"
        >
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Reset branch to {shortHash}
          </div>
          <div className="space-y-1.5">
            {MODES.map((m) => (
              <button
                key={m.mode}
                onClick={() => run(m.mode)}
                className={`focus-ring flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                  m.danger
                    ? confirmingHard
                      ? "border-git-conflict/50 bg-git-conflict/12"
                      : "border-git-conflict/20 bg-git-conflict/5 hover:bg-git-conflict/10"
                    : "border-[var(--border-default)] bg-[var(--bg-surface-2)] hover:border-[var(--border-strong)]"
                }`}
              >
                {m.danger && (confirmingHard ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-git-conflict" /> : null)}
                <div>
                  <div className={`text-[12px] font-semibold ${m.danger ? "text-git-conflict" : "text-[var(--text-primary)]"}`}>
                    {m.mode === "hard" && confirmingHard ? "Confirm hard reset?" : `${m.label} reset`}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                    {m.mode === "hard" && confirmingHard
                      ? "Click again to permanently discard your uncommitted changes."
                      : m.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-2.5 border-t border-[var(--border-subtle)] pt-2 text-[11px] text-[var(--text-tertiary)]">
            git reset --{confirmingHard ? "hard" : "<mode>"} {shortHash}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
