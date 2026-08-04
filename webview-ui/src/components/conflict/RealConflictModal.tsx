import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { AlertTriangle, Ban, Check, GitMerge, Loader2, PenLine } from "lucide-react";
import clsx from "clsx";
import { useUIStore } from "@/store/ui-store";
import { requestData } from "@/lib/vscode-bridge";
import { dispatchAndLogAsync } from "@/lib/dispatch-command";
import { hasConflictMarkers } from "@/lib/conflict-markers";
import type { ConflictFileRaw, ConflictOp } from "@/lib/vscode-protocol";
import { Button } from "../ui/Button";

const OP_LABEL: Record<ConflictOp, string> = { merge: "Merge", revert: "Revert", cherryPick: "Cherry-pick" };
const OP_GIT_COMMAND: Record<ConflictOp, string> = { merge: "git merge", revert: "git revert", cherryPick: "git cherry-pick" };

type Resolution = "ours" | "theirs" | "both" | "manual";

/** Opens whenever a real merge/revert/cherry-pick stops on a real conflict (see
 * store.realConflictOp, set from dispatchRealCommand/dispatchAndLogAsync). Every choice here
 * writes to the actual repository — `git checkout --ours/--theirs`, a real combined write for
 * "both", or the user's own edit of the file's real on-disk conflict markers — then stages it
 * for real. Continue/Abort drive the real `--continue`/`--abort` for whichever operation is
 * mid-flight. This replaces what used to be a cosmetic preview with no effect on the real repo. */
export function RealConflictModal() {
  const op = useUIStore((s) => s.realConflictOp);
  const clear = useUIStore((s) => s.clearRealConflictOp);

  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<ConflictFileRaw[]>([]);
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<"continue" | "abort" | null>(null);

  useEffect(() => {
    if (!op) return;
    setLoading(true);
    setResolved({});
    setFiles([]);
    requestData({ kind: "conflicts" })
      .then((data) => {
        if (data.kind === "conflicts") setFiles(data.files);
      })
      .finally(() => setLoading(false));
  }, [op]);

  if (!op) return null;

  const allResolved = files.length > 0 && files.every((f) => resolved[f.path]);

  const resolveFile = async (filePath: string, resolution: Resolution, content?: string) => {
    setBusyPath(filePath);
    const commandText =
      resolution === "ours"
        ? `git checkout --ours -- ${filePath}`
        : resolution === "theirs"
          ? `git checkout --theirs -- ${filePath}`
          : `git add ${filePath}`;
    useUIStore.getState().logCommand(commandText);
    try {
      await dispatchAndLogAsync({ kind: "resolveConflictFile", path: filePath, resolution, content });
      setResolved((r) => ({ ...r, [filePath]: resolution }));
    } catch {
      // real failure already landed in lastCommandError and surfaces via the global toast
    } finally {
      setBusyPath(null);
    }
  };

  const finish = async (action: "continue" | "abort") => {
    setFinishing(action);
    useUIStore.getState().logCommand(`${OP_GIT_COMMAND[op]} --${action}`);
    try {
      await dispatchAndLogAsync(
        action === "continue" ? { kind: "continueConflictOp", op } : { kind: "abortConflictOp", op }
      );
      clear();
    } catch {
      // real failure already landed in lastCommandError and surfaces via the global toast
    } finally {
      setFinishing(null);
    }
  };

  return (
    <Dialog.Root open onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50 animate-fade-in" />
        <Dialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="glass animate-pop fixed left-1/2 top-1/2 z-100 flex max-h-[80vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-git-conflict/30 p-5 shadow-2xl"
        >
          <Dialog.Title className="flex items-center gap-2 text-[15px] font-semibold text-git-conflict">
            <AlertTriangle size={16} />
            {OP_LABEL[op]} stopped on a real conflict
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[12px] text-[var(--text-secondary)]">
            {files.length} file{files.length !== 1 ? "s" : ""} conflicted for real in your repository. Resolve each
            one below — every choice writes to the actual file on disk.
          </Dialog.Description>

          <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-[var(--text-tertiary)]">
                <Loader2 size={14} className="animate-spin" /> Reading real conflict state…
              </div>
            ) : (
              files.map((f) => (
                <RealConflictFileRow
                  key={f.path}
                  file={f}
                  resolution={resolved[f.path] ?? null}
                  busy={busyPath === f.path}
                  onResolve={(resolution, content) => resolveFile(f.path, resolution, content)}
                />
              ))
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-4">
            <Button
              variant="danger"
              size="sm"
              icon={<Ban size={13} />}
              onClick={() => finish("abort")}
              disabled={finishing !== null}
            >
              {finishing === "abort" ? "Aborting…" : `Abort ${OP_LABEL[op].toLowerCase()}`}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<GitMerge size={13} />}
              onClick={() => finish("continue")}
              disabled={!allResolved || finishing !== null}
            >
              {finishing === "continue" ? "Continuing…" : `Continue ${OP_LABEL[op].toLowerCase()}`}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RealConflictFileRow({
  file,
  resolution,
  busy,
  onResolve,
}: {
  file: ConflictFileRaw;
  resolution: Resolution | null;
  busy: boolean;
  onResolve: (resolution: Resolution, content?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.workingContent);
  const lineCount = (text: string) => (text ? text.split("\n").length : 0);
  const resolved = resolution !== null;

  const startManual = () => {
    setDraft(file.workingContent);
    setEditing(true);
  };

  const saveManual = () => {
    onResolve("manual", draft);
    setEditing(false);
  };

  const optionClass = (active: boolean) =>
    clsx(
      "rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-colors disabled:opacity-50",
      active ? "border-accent/50 bg-accent/12" : "border-[var(--border-default)] hover:border-[var(--border-strong)]"
    );

  return (
    <div className="rounded-lg border border-git-conflict/25 bg-[var(--bg-surface)] p-2.5">
      <div className="flex items-center justify-between">
        <span className="truncate font-mono text-[11px] text-[var(--text-primary)]">{file.path}</span>
        {busy ? (
          <Loader2 size={13} className="shrink-0 animate-spin text-[var(--text-tertiary)]" />
        ) : resolved ? (
          <Check size={13} className="shrink-0 text-git-commit" />
        ) : null}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => onResolve("ours")} className={optionClass(resolution === "ours")}>
          <div className="font-medium text-[var(--text-primary)]">Keep ours (HEAD)</div>
          <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{lineCount(file.oursContent)} lines</div>
        </button>
        <button disabled={busy} onClick={() => onResolve("theirs")} className={optionClass(resolution === "theirs")}>
          <div className="font-medium text-[var(--text-primary)]">Keep theirs</div>
          <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{lineCount(file.theirsContent)} lines</div>
        </button>
        <button disabled={busy} onClick={() => onResolve("both")} className={optionClass(resolution === "both")}>
          <div className="font-medium text-[var(--text-primary)]">Keep both</div>
          <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">ours then theirs, concatenated</div>
        </button>
        <button disabled={busy} onClick={startManual} className={optionClass(resolution === "manual")}>
          <div className="flex items-center gap-1 font-medium text-[var(--text-primary)]">
            <PenLine size={11} /> Edit manually
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">edit the real conflict markers</div>
        </button>
      </div>
      {editing && (
        <div className="mt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            spellCheck={false}
            className="focus-ring w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2 font-mono text-[11px] leading-5 text-[var(--text-primary)]"
          />
          <div className="mt-1.5 flex items-center justify-between">
            {hasConflictMarkers(draft) ? (
              <p className="text-[10px] text-git-conflict">
                Remove the &lt;&lt;&lt;&lt;&lt;&lt;&lt; / ======= / &gt;&gt;&gt;&gt;&gt;&gt;&gt; markers first.
              </p>
            ) : (
              <p className="text-[10px] text-[var(--text-tertiary)]">Looks resolved — save to write it to disk.</p>
            )}
            <Button size="sm" variant="secondary" disabled={hasConflictMarkers(draft) || busy} onClick={saveManual}>
              Save resolution
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
