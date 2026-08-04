import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        "focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" &&
          "bg-accent text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_4px_12px_-2px_rgba(110,107,246,0.5)] hover:bg-accent-strong",
        variant === "secondary" &&
          "border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-3)] hover:border-[var(--border-strong)]",
        variant === "ghost" && "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
        variant === "danger" && "bg-git-conflict/12 text-git-conflict hover:bg-git-conflict/20 border border-git-conflict/25",
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
