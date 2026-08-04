import * as Dialog from "@radix-ui/react-dialog";
import { useState, useEffect } from "react";
import { Settings, X } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { Button } from "../ui/Button";
import type { ReactNode } from "react";

export function ConfigModal({ children }: { children: ReactNode }) {
  const gitConfig = useUIStore((s) => s.gitConfig);
  const updateGitConfig = useUIStore((s) => s.updateGitConfig);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(gitConfig);

  useEffect(() => {
    if (open) setDraft(gitConfig);
  }, [open, gitConfig]);

  const save = () => {
    const changed: Partial<typeof gitConfig> = {};
    for (const key of Object.keys(draft) as (keyof typeof draft)[]) {
      if (draft[key] !== gitConfig[key]) changed[key] = draft[key];
    }
    if (Object.keys(changed).length > 0) updateGitConfig(changed);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50 animate-fade-in" />
        <Dialog.Content className="glass animate-pop fixed left-1/2 top-1/2 z-100 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border-default)] p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
              <Settings size={16} /> Git config
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]">
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3">
            <Field label="user.name" value={draft.userName} onChange={(v) => setDraft((d) => ({ ...d, userName: v }))} />
            <Field label="user.email" value={draft.userEmail} onChange={(v) => setDraft((d) => ({ ...d, userEmail: v }))} />
            <Field
              label="init.defaultBranch"
              value={draft.defaultBranch}
              onChange={(v) => setDraft((d) => ({ ...d, defaultBranch: v }))}
            />
            <Field label="core.editor" value={draft.editor} onChange={(v) => setDraft((d) => ({ ...d, editor: v }))} />
          </div>

          <Button variant="primary" className="mt-5 w-full" onClick={save}>
            Save config
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-[12px] text-[var(--text-primary)]"
      />
    </label>
  );
}
