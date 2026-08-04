import { AlertTriangle, Play, Ban } from "lucide-react";
import type { CherryPickConflictFile } from "@/lib/cherry-pick-sim";
import { isFileResolved, type ConflictResolution } from "@/lib/conflict-markers";
import { ConflictFileCard } from "../conflict/ConflictFileCard";
import { Button } from "../ui/Button";

export function CherryPickConflictPanel({
  conflict,
  resolutions,
  manualContents,
  onResolve,
  onManualChange,
  onContinue,
  onAbort,
}: {
  conflict: { hash: string; conflictingFiles: CherryPickConflictFile[] };
  resolutions: Record<string, ConflictResolution>;
  manualContents: Record<string, string>;
  onResolve: (path: string, choice: ConflictResolution) => void;
  onManualChange: (path: string, content: string) => void;
  onContinue: () => void;
  onAbort: () => void;
}) {
  const allResolved = conflict.conflictingFiles.every((f) => isFileResolved(resolutions[f.path] ?? null, manualContents[f.path]));

  return (
    <div className="mt-3 rounded-xl border border-git-conflict/30 bg-git-conflict/6 p-3">
      <div className="flex items-center gap-2 text-git-conflict">
        <AlertTriangle size={14} className="shrink-0" />
        <span className="text-[12px] font-semibold">Cherry-pick conflict</span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
        Your current branch already changed the file{conflict.conflictingFiles.length !== 1 ? "s" : ""} below since this
        commit's parent. Pick a resolution for each before continuing.
      </p>
      <div className="mt-2.5 space-y-2">
        {conflict.conflictingFiles.map((f) => (
          <ConflictFileCard
            key={f.path}
            path={f.path}
            oursLabel="current branch"
            theirsLabel="picked commit"
            oursInsertions={f.oursInsertions}
            oursDeletions={f.oursDeletions}
            theirsInsertions={f.theirsInsertions}
            theirsDeletions={f.theirsDeletions}
            resolution={resolutions[f.path] ?? null}
            manualContent={manualContents[f.path]}
            seed={`cherry-${conflict.hash}`}
            onResolve={(choice) => onResolve(f.path, choice)}
            onManualChange={(content) => onManualChange(f.path, content)}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={onContinue} disabled={!allResolved} icon={<Play size={12} />}>
          Continue
        </Button>
        <Button size="sm" variant="danger" onClick={onAbort} icon={<Ban size={12} />}>
          Abort
        </Button>
      </div>
    </div>
  );
}
