import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, ArrowRightLeft, FileCode2, SquareArrowOutUpRight, Rows3, UserRound } from "lucide-react";
import { fileList, buildFileIndex } from "@/lib/file-history";
import { FileStatusIcon, fileStatusLabel, fileStatusRole } from "@/components/ui/FileStatusIcon";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { BlamePanel } from "@/components/diff/BlamePanel";
import { authors, timeAgo } from "@/lib/mock-data";
import { useUIStore } from "@/store/ui-store";
import clsx from "clsx";

type View = "timeline" | "blame";

export function FileHistoryPage() {
  const files = useMemo(() => fileList(), []);
  const index = useMemo(() => buildFileIndex(), []);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    files.find((f) => f.path === "src/pages/Settings.tsx")?.path ?? files[0]?.path
  );
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [view, setView] = useState<View>("timeline");

  const filtered = query.trim()
    ? files.filter((f) => f.path.toLowerCase().includes(query.toLowerCase()))
    : files;

  const record = selected ? index.get(selected) : undefined;
  const maxChange = record ? Math.max(...record.events.map((e) => e.change.insertions + e.change.deletions), 1) : 1;

  return (
    <div className="flex h-full">
      <div className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border-subtle)]">
        <div className="p-4">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files…"
              className="focus-ring h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] pl-8 pr-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
          </div>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
          {filtered.map((f) => {
            const latest = f.events[0];
            const filename = f.path.split("/").pop();
            return (
              <button
                key={f.path}
                onClick={() => setSelected(f.path)}
                className={clsx(
                  "focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                  selected === f.path ? "bg-[var(--bg-surface-2)]" : "hover:bg-[var(--bg-surface)]"
                )}
              >
                <FileStatusIcon status={latest.change.status} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">{filename}</div>
                  <div className="truncate text-[10px] text-[var(--text-tertiary)]">{f.events.length} commits &middot; {timeAgo(latest.commit.committedAt)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {record ? (
          <div className="mx-auto max-w-[820px] px-8 py-8">
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
              <FileCode2 size={14} />
              <span className="font-mono">{record.path}</span>
            </div>

            {record.renameChain.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-git-remote/20 bg-git-remote/8 px-3 py-2.5 text-[12px]">
                <ArrowRightLeft size={13} className="shrink-0 text-git-remote" />
                <span className="text-[var(--text-secondary)]">Rename chain:</span>
                {record.renameChain.map((p, i) => (
                  <span key={p} className="flex items-center gap-2">
                    <span className={clsx("font-mono", i === record.renameChain.length - 1 ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>
                      {p}
                    </span>
                    {i < record.renameChain.length - 1 && <span className="text-git-remote">&rarr;</span>}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{record.events.length} commits</div>
                <div className="mt-0.5 flex items-center gap-2 font-tabular text-[11px]">
                  <span className="text-git-commit">+{record.totalInsertions}</span>
                  <span className="text-git-conflict">−{record.totalDeletions}</span>
                </div>
              </div>
              <AvatarStack authors={[...record.contributors].map((id) => authors[id])} size={24} />
            </div>

            <EducationalNote
              what="This is the file's full lifeline — every commit that touched it, including the moment it was renamed."
              why="Git doesn't store renames explicitly; it detects them by comparing file content similarity between commits. That's why `git log --follow` is needed to trace history across a rename."
              command={`git log --follow -- ${record.path}`}
            />

            <div className="mb-3 mt-6 flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
              <button
                onClick={() => setView("timeline")}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors",
                  view === "timeline" ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                )}
              >
                <Rows3 size={12} /> Timeline
              </button>
              <button
                onClick={() => setView("blame")}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors",
                  view === "blame" ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                )}
              >
                <UserRound size={12} /> Blame
              </button>
            </div>

            {view === "blame" && (
              <>
                <BlamePanel record={record} />
                <div className="mt-4">
                  <EducationalNote
                    what="Every line below is attributed to the commit that last changed it — a synthesized file body, since this prototype doesn't store real file contents."
                    why="Blame walks backward from HEAD, and for each line, stops at the most recent commit whose diff touched it. It's the fastest way to find out who to ask about a confusing line, or which commit introduced a bug."
                    command={`git blame ${record.path}`}
                  />
                </div>
              </>
            )}

            {view === "timeline" && (
            <div className="relative">
              <div className="absolute bottom-2 left-[15px] top-2 w-px bg-[var(--border-subtle)]" />
              <div className="space-y-1">
                {record.events.map((e, i) => {
                  const key = e.commit.hash + e.change.path;
                  const expanded = expandedHash === key;
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedHash((cur) => (cur === key ? null : key))}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") setExpandedHash((cur) => (cur === key ? null : key));
                        }}
                        className={clsx(
                          "focus-ring group relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[var(--bg-surface)]",
                          expanded && "bg-[var(--bg-surface)]"
                        )}
                      >
                        <div className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--bg-canvas)]">
                          <Avatar author={e.commit.author} size={26} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{e.commit.subject}</span>
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation();
                                inspectCommit(e.commit.hash);
                              }}
                              className="focus-ring shrink-0 rounded p-0.5 text-[var(--text-tertiary)] opacity-0 hover:text-[var(--text-primary)] group-hover:opacity-100"
                              title="Open commit"
                            >
                              <SquareArrowOutUpRight size={11} />
                            </button>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                            <Badge role={fileStatusRole(e.change.status)} className="!px-1.5 !py-0.5 !text-[10px]">
                              {fileStatusLabel(e.change.status)}
                            </Badge>
                            <span>{e.commit.author.name}</span>
                            <span>&middot;</span>
                            <span>{timeAgo(e.commit.committedAt)}</span>
                          </div>
                        </div>
                        <div className="flex w-28 shrink-0 items-center justify-end gap-2">
                          <div className="font-tabular text-[11px]">
                            <span className="text-git-commit">+{e.change.insertions}</span>{" "}
                            <span className="text-git-conflict">−{e.change.deletions}</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--bg-surface-3)]">
                          <div
                            className="h-full bg-git-commit"
                            style={{ width: `${Math.max(((e.change.insertions + e.change.deletions) / maxChange) * 100, 6)}%` }}
                          />
                        </div>
                      </div>
                      <AnimatePresence>
                        {expanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="ml-11 mr-2 mt-1 overflow-hidden"
                          >
                            <DiffViewer path={e.change.path} insertions={e.change.insertions} deletions={e.change.deletions} seed={e.commit.hash} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-[var(--text-tertiary)]">
            Select a file to see its history
          </div>
        )}
      </div>
    </div>
  );
}
