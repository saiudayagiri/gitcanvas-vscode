import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";

export function DiscardFileButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <button
      onClick={() => {
        if (confirming) {
          onConfirm();
          setConfirming(false);
        } else {
          setConfirming(true);
        }
      }}
      className={
        "focus-ring flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[10px] font-medium transition-all " +
        (confirming
          ? "border-git-conflict/50 bg-git-conflict/12 text-git-conflict opacity-100"
          : "border-[var(--border-default)] text-[var(--text-tertiary)] opacity-60 hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100")
      }
    >
      <Undo2 size={10} />
      {confirming ? "Confirm?" : "Discard"}
    </button>
  );
}
