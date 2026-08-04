import * as Popover from "@radix-ui/react-popover";
import { Check, GitBranch, Cloud, ChevronsUpDown, Plus } from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { useAllBranches } from "@/hooks/useCurrentBranch";
import { Badge } from "@/components/ui/Badge";
import { NewBranchPopover } from "./NewBranchPopover";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

export function BranchSwitcherPopover({ children }: { children: ReactNode }) {
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const requestSwitchBranch = useUIStore((s) => s.requestSwitchBranch);
  const allBranches = useAllBranches();
  const local = allBranches.filter((b) => b.kind === "local");
  const remote = allBranches.filter((b) => b.kind === "remote");

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          className="glass animate-pop z-50 w-72 overflow-hidden rounded-xl border border-[var(--border-default)] p-1.5 shadow-2xl"
        >
          <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Switch branch
          </div>
          <div className="max-h-72 overflow-y-auto">
            {local.map((b) => (
              <BranchRow key={b.name} name={b.name} icon={<GitBranch size={13} />} current={b.name === currentBranchName} onSelect={() => requestSwitchBranch(b.name)} />
            ))}
            {remote.length > 0 && (
              <>
                <div className="mt-1 border-t border-[var(--border-subtle)] px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  Remote
                </div>
                {remote.map((b) => (
                  <BranchRow key={b.name} name={b.name} icon={<Cloud size={13} />} current={false} disabled onSelect={() => {}} />
                ))}
              </>
            )}
          </div>
          <div className="mt-1 border-t border-[var(--border-subtle)] pt-1">
            <NewBranchPopover>
              <button className="focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-accent hover:bg-[var(--bg-surface-2)]">
                <Plus size={13} />
                New branch…
              </button>
            </NewBranchPopover>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function BranchRow({
  name,
  icon,
  current,
  disabled,
  onSelect,
}: {
  name: string;
  icon: ReactNode;
  current: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--text-primary)] transition-colors enabled:hover:bg-[var(--bg-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-[var(--text-tertiary)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {current ? (
        <Badge role="branch" className="!px-1.5 !py-0.5 !text-[10px]">
          current
        </Badge>
      ) : (
        <Check size={13} className="text-transparent" />
      )}
    </button>
  );
}

export const BranchSwitcherTrigger = forwardRef<
  HTMLButtonElement,
  { name: string; detached?: boolean } & ComponentPropsWithoutRef<"button">
>(function BranchSwitcherTrigger({ name, detached, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      className="focus-ring group flex w-full items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-2 py-1 text-left transition-colors hover:border-[var(--border-strong)]"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${detached ? "bg-git-staged" : "bg-git-branch"}`} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]">
        {detached ? `detached @ ${name}` : name}
      </span>
      <ChevronsUpDown size={11} className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
});
