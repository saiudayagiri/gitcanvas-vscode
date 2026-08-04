import { CheckCircle2, PenLine } from "lucide-react";
import clsx from "clsx";
import { buildConflictMarkerText, hasConflictMarkers, isFileResolved, type ConflictResolution } from "@/lib/conflict-markers";

export function ConflictFileCard({
  path,
  oursLabel,
  theirsLabel,
  oursInsertions,
  oursDeletions,
  theirsInsertions,
  theirsDeletions,
  resolution,
  manualContent,
  seed,
  onResolve,
  onManualChange,
}: {
  path: string;
  oursLabel: string;
  theirsLabel: string;
  oursInsertions: number;
  oursDeletions: number;
  theirsInsertions: number;
  theirsDeletions: number;
  resolution: ConflictResolution;
  manualContent?: string;
  seed: string;
  onResolve: (choice: ConflictResolution) => void;
  onManualChange: (content: string) => void;
}) {
  const resolved = isFileResolved(resolution, manualContent);

  const startManual = () => {
    onResolve("manual");
    if (!manualContent) onManualChange(buildConflictMarkerText(path, oursLabel, theirsLabel, seed));
  };

  const optionClass = (active: boolean) =>
    clsx(
      "rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-colors",
      active ? "border-accent/50 bg-accent/12" : "border-[var(--border-default)] hover:border-[var(--border-strong)]"
    );

  return (
    <div className="rounded-lg border border-git-conflict/25 bg-[var(--bg-surface)] p-2.5">
      <div className="flex items-center justify-between">
        <span className="truncate font-mono text-[11px] text-[var(--text-primary)]">{path}</span>
        {resolved && <CheckCircle2 size={13} className="shrink-0 text-git-commit" />}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <button onClick={() => onResolve("ours")} className={optionClass(resolution === "ours")}>
          <div className="font-medium text-[var(--text-primary)]">Keep ours ({oursLabel})</div>
          <div className="mt-0.5 font-tabular text-git-commit">
            +{oursInsertions} <span className="text-git-conflict">−{oursDeletions}</span>
          </div>
        </button>
        <button onClick={() => onResolve("theirs")} className={optionClass(resolution === "theirs")}>
          <div className="font-medium text-[var(--text-primary)]">Keep theirs ({theirsLabel})</div>
          <div className="mt-0.5 font-tabular text-git-commit">
            +{theirsInsertions} <span className="text-git-conflict">−{theirsDeletions}</span>
          </div>
        </button>
        <button onClick={() => onResolve("both")} className={optionClass(resolution === "both")}>
          <div className="font-medium text-[var(--text-primary)]">Keep both</div>
          <div className="mt-0.5 font-tabular text-git-commit">
            +{oursInsertions + theirsInsertions} <span className="text-git-conflict">−{Math.min(oursDeletions, theirsDeletions)}</span>
          </div>
        </button>
        <button onClick={startManual} className={optionClass(resolution === "manual")}>
          <div className="flex items-center gap-1 font-medium text-[var(--text-primary)]">
            <PenLine size={11} /> Edit manually
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">write the merged result yourself</div>
        </button>
      </div>
      {resolution === "manual" && (
        <div className="mt-2">
          <textarea
            value={manualContent ?? ""}
            onChange={(e) => onManualChange(e.target.value)}
            rows={7}
            spellCheck={false}
            className="focus-ring w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2 font-mono text-[11px] leading-5 text-[var(--text-primary)]"
          />
          {hasConflictMarkers(manualContent ?? "") ? (
            <p className="mt-1 text-[10px] text-git-conflict">
              Remove the &lt;&lt;&lt;&lt;&lt;&lt;&lt; / ======= / &gt;&gt;&gt;&gt;&gt;&gt;&gt; markers to mark this file resolved.
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-git-commit">
              <CheckCircle2 size={10} /> Resolved.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
