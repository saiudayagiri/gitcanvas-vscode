import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { GitBranchPlus } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { useHeadHash, useCurrentBranch, useIsDetached } from "@/hooks/useCurrentBranch";
import { getCommit } from "@/lib/mock-data";
import { Button } from "../ui/Button";
import type { ReactNode } from "react";

export function NewBranchPopover({ children }: { children?: ReactNode }) {
  const createBranch = useUIStore((s) => s.createBranch);
  const headHash = useHeadHash();
  const currentBranch = useCurrentBranch();
  const detached = useIsDetached();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fromLabel = currentBranch?.name ?? (headHash ? getCommit(headHash)?.shortHash : "HEAD");

  const submit = () => {
    const err = createBranch(name);
    if (err) {
      setError(err);
      return;
    }
    setName("");
    setError(null);
    setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setName("");
          setError(null);
        }
      }}
    >
      <Popover.Trigger asChild>
        {children ?? (
          <Button size="sm" variant="secondary" icon={<GitBranchPlus size={13} />}>
            New branch
          </Button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          className="glass animate-pop z-50 w-72 rounded-xl border border-[var(--border-default)] p-3 shadow-2xl"
        >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            New branch {detached ? "(detached HEAD)" : ""} from {fromLabel}
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="feature/my-branch"
            className="focus-ring h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          {error && <p className="mt-1.5 text-[11px] text-git-conflict">{error}</p>}
          <Button variant="primary" size="sm" className="mt-2.5 w-full" onClick={submit} disabled={name.trim().length === 0}>
            Create &amp; switch
          </Button>
          <div className="mt-2 text-[10px] text-[var(--text-tertiary)]">git checkout -b {name || "<name>"}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
