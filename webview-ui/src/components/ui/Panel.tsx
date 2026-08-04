import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export function Panel({
  children,
  className,
  glass = false,
  padded = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { glass?: boolean; padded?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-[var(--border-subtle)]",
        glass ? "glass" : "bg-[var(--bg-surface)]",
        padded && "p-5",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        {eyebrow && (
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
            {eyebrow}
          </div>
        )}
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
