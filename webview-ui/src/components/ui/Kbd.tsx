export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface-3)] px-1.5 font-mono text-[10px] font-medium text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}
