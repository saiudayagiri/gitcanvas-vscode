import * as RTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={250} skipDelayDuration={100}>
      {children}
    </RTooltip.Provider>
  );
}

export function Tooltip({
  children,
  content,
  side = "top",
}: {
  children: ReactNode;
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={8}
          className="glass animate-fade-in z-50 max-w-xs rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] shadow-xl"
        >
          {content}
          <RTooltip.Arrow className="fill-[var(--bg-surface-2)]" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
