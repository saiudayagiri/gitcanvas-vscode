import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { Tag as TagIcon } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { Button } from "../ui/Button";

export function TagPopover({ hash, shortHash }: { hash: string; shortHash: string }) {
  const createTag = useUIStore((s) => s.createTag);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const submit = () => {
    const err = createTag(name, hash);
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
        <Button size="sm" variant="ghost" icon={<TagIcon size={12} />}>
          Tag
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="glass animate-pop z-50 w-64 rounded-xl border border-[var(--border-default)] p-3 shadow-2xl"
        >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Tag {shortHash}
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="v2.5.0"
            className="focus-ring h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          {error && <p className="mt-1.5 text-[11px] text-git-conflict">{error}</p>}
          <Button variant="primary" size="sm" className="mt-2.5 w-full" onClick={submit} disabled={name.trim().length === 0}>
            Create tag
          </Button>
          <div className="mt-2 text-[10px] text-[var(--text-tertiary)]">git tag {name || "<name>"} {shortHash}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
