import { useEffect, useState } from "react";
import { Rows3, Columns3, Loader2 } from "lucide-react";
import { generateDiff, type DiffHunk, type DiffLine } from "@/lib/diff-content";
import { parseUnifiedDiff } from "@/lib/real-diff-parser";
import { isInVsCode, requestData } from "@/lib/vscode-bridge";
import clsx from "clsx";

export function DiffViewer({
  path,
  insertions,
  deletions,
  seed,
  allowSplit = true,
}: {
  path: string;
  insertions: number;
  deletions: number;
  seed: string;
  allowSplit?: boolean;
}) {
  const [split, setSplit] = useState(false);
  const [realHunks, setRealHunks] = useState<DiffHunk[] | null>(null);
  const [loading, setLoading] = useState(isInVsCode());
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInVsCode()) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    requestData({ kind: "diff", hash: seed, path })
      .then((data) => {
        if (cancelled || data.kind !== "diff") return;
        setRealHunks(parseUnifiedDiff(data.diff));
      })
      .catch((err: Error) => {
        if (!cancelled) setFetchError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seed, path]);

  const hunks = isInVsCode() ? (realHunks ?? []) : generateDiff(path, insertions, deletions, seed);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-[12px] text-[var(--text-tertiary)]">
        <Loader2 size={13} className="animate-spin" /> Loading diff…
      </div>
    );
  }

  if (fetchError) {
    return <div className="rounded-lg border border-git-conflict/25 bg-git-conflict/6 p-4 text-center text-[12px] text-git-conflict">{fetchError}</div>;
  }

  if (hunks.length === 0) {
    return <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-center text-[12px] text-[var(--text-tertiary)]">Binary or empty diff</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5">
        <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]">{path}</span>
        {allowSplit && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-[var(--border-default)] p-0.5">
            <button
              onClick={() => setSplit(false)}
              className={clsx("flex h-5 w-5 items-center justify-center rounded", !split ? "bg-[var(--bg-surface-3)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}
              title="Unified"
            >
              <Rows3 size={11} />
            </button>
            <button
              onClick={() => setSplit(true)}
              className={clsx("flex h-5 w-5 items-center justify-center rounded", split ? "bg-[var(--bg-surface-3)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}
              title="Split"
            >
              <Columns3 size={11} />
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        {hunks.map((hunk, i) => (
          <div key={i}>
            <div className="bg-git-remote/8 px-3 py-1 font-mono text-[11px] text-git-remote">{hunk.header}</div>
            {split ? <SplitHunk lines={hunk.lines} /> : <UnifiedHunk lines={hunk.lines} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function lineClasses(type: DiffLine["type"]) {
  return clsx(
    "px-2 whitespace-pre font-mono text-[11.5px] leading-[1.6]",
    type === "add" && "bg-git-commit/12 text-[var(--text-primary)]",
    type === "remove" && "bg-git-conflict/12 text-[var(--text-primary)]",
    type === "context" && "text-[var(--text-secondary)]"
  );
}

function UnifiedHunk({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="min-w-max">
      {lines.map((l, i) => (
        <div key={i} className="flex">
          <span className="w-9 shrink-0 select-none border-r border-[var(--border-subtle)] px-1.5 text-right font-mono text-[10px] text-[var(--text-tertiary)]">
            {l.oldLineNo ?? ""}
          </span>
          <span className="w-9 shrink-0 select-none border-r border-[var(--border-subtle)] px-1.5 text-right font-mono text-[10px] text-[var(--text-tertiary)]">
            {l.newLineNo ?? ""}
          </span>
          <span className={clsx(lineClasses(l.type), "flex-1")}>
            <span className="mr-1.5 select-none text-[var(--text-tertiary)]">
              {l.type === "add" ? "+" : l.type === "remove" ? "−" : " "}
            </span>
            {l.content}
          </span>
        </div>
      ))}
    </div>
  );
}

function SplitHunk({ lines }: { lines: DiffLine[] }) {
  const left = lines.filter((l) => l.type !== "add");
  const right = lines.filter((l) => l.type !== "remove");
  const rows = Math.max(left.length, right.length);
  return (
    <div className="grid min-w-[560px] grid-cols-2 divide-x divide-[var(--border-subtle)]">
      <div>
        {Array.from({ length: rows }).map((_, i) => {
          const l = left[i];
          return (
            <div key={i} className="flex">
              <span className="w-9 shrink-0 select-none border-r border-[var(--border-subtle)] px-1.5 text-right font-mono text-[10px] text-[var(--text-tertiary)]">
                {l?.oldLineNo ?? ""}
              </span>
              <span className={clsx(l ? lineClasses(l.type) : "", "flex-1 min-h-[1.6em]")}>{l?.content ?? ""}</span>
            </div>
          );
        })}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => {
          const l = right[i];
          return (
            <div key={i} className="flex">
              <span className="w-9 shrink-0 select-none border-r border-[var(--border-subtle)] px-1.5 text-right font-mono text-[10px] text-[var(--text-tertiary)]">
                {l?.newLineNo ?? ""}
              </span>
              <span className={clsx(l ? lineClasses(l.type) : "", "flex-1 min-h-[1.6em]")}>{l?.content ?? ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
