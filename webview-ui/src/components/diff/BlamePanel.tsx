import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { FileRecord } from "@/lib/file-history";
import { getBlame as getSyntheticBlame } from "@/lib/blame";
import { timeAgo, authors } from "@/lib/mock-data";
import { shortHash } from "@/lib/hash";
import { isInVsCode, requestData } from "@/lib/vscode-bridge";
import type { BlameRawLine } from "@/lib/vscode-protocol";
import { useUIStore } from "@/store/ui-store";
import { Avatar } from "../ui/Avatar";

interface DisplayLine {
  lineNo: number;
  content: string;
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
}

export function BlamePanel({ record }: { record: FileRecord }) {
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const [realLines, setRealLines] = useState<BlameRawLine[] | null>(null);
  const [loading, setLoading] = useState(isInVsCode());
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInVsCode()) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    requestData({ kind: "blame", path: record.path })
      .then((data) => {
        if (!cancelled && data.kind === "blame") setRealLines(data.lines);
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
  }, [record.path]);

  const lines: DisplayLine[] = useMemo(() => {
    if (isInVsCode()) {
      return (realLines ?? []).map((l) => ({
        lineNo: l.lineNo,
        content: l.content,
        hash: l.hash,
        shortHash: shortHash(l.hash),
        authorName: l.authorName,
        authorEmail: l.authorEmail,
        authoredAt: l.authoredAt,
        subject: l.subject,
      }));
    }
    return getSyntheticBlame(record).map((l) => ({
      lineNo: l.lineNo,
      content: l.content,
      hash: l.commit.hash,
      shortHash: l.commit.shortHash,
      authorName: l.commit.author.name,
      authorEmail: l.commit.author.email,
      authoredAt: l.commit.committedAt,
      subject: l.commit.subject,
    }));
  }, [realLines, record]);

  const blocks = useMemo(() => {
    const out: { line: DisplayLine; lines: DisplayLine[] }[] = [];
    for (const line of lines) {
      const last = out[out.length - 1];
      if (last && last.line.hash === line.hash) last.lines.push(line);
      else out.push({ line, lines: [line] });
    }
    return out;
  }, [lines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-8 text-[12px] text-[var(--text-tertiary)]">
        <Loader2 size={14} className="animate-spin" /> Running git blame…
      </div>
    );
  }

  if (fetchError) {
    return <div className="rounded-xl border border-git-conflict/25 bg-git-conflict/6 px-3.5 py-2.5 text-[12px] text-git-conflict">{fetchError}</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
      {blocks.map((block, bi) => {
        const author = Object.values(authors).find((a) => a.email === block.line.authorEmail) ?? {
          id: block.line.authorEmail,
          name: block.line.authorName,
          email: block.line.authorEmail,
          colorSeed: block.line.authorEmail,
        };
        return (
          <div key={bi} className={bi > 0 ? "flex border-t border-[var(--border-subtle)]" : "flex"}>
            <button
              onClick={() => inspectCommit(block.line.hash)}
              className="focus-ring flex w-[220px] shrink-0 flex-col items-start justify-center gap-1 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-left hover:bg-[var(--bg-surface-2)]"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <Avatar author={author} size={16} />
                <span className="truncate text-[11px] font-medium text-[var(--text-primary)]">{author.name}</span>
              </div>
              <div className="truncate text-[10.5px] text-[var(--text-secondary)]">{block.line.subject}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                <span className="mono-hash text-git-branch">{block.line.shortHash}</span>
                <span>&middot;</span>
                <span>{timeAgo(block.line.authoredAt)}</span>
              </div>
            </button>
            <div className="min-w-0 flex-1 bg-[var(--bg-canvas)] py-0.5">
              {block.lines.map((l) => (
                <div key={l.lineNo} className="flex items-center gap-3 px-3 py-[1px] font-mono text-[11.5px] leading-5">
                  <span className="w-7 shrink-0 select-none text-right text-[var(--text-tertiary)]">{l.lineNo}</span>
                  <span className="truncate text-[var(--text-secondary)]">{l.content}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
