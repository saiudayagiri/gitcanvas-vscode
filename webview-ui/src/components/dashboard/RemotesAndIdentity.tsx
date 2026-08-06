import { useState } from "react";
import { Cloud, GitFork, Globe, Pencil, Plus, Trash2, Check, X as XIcon, UserRound, AlertTriangle } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { useUIStore } from "@/store/ui-store";
import { remote as originRemote } from "@/lib/mock-data";
import { isInVsCode } from "@/lib/vscode-bridge";
import type { RemoteEntry } from "@/store/ui-store";

/** origin is *your* copy of the project (where push goes by default); upstream is the
 * convention for the original project you forked from. Any other name gets a neutral globe. */
function remoteMeta(name: string) {
  if (name === "origin")
    return { icon: <Cloud size={13} />, tint: "text-git-remote bg-git-remote/10", hint: "your copy — push goes here by default" };
  if (name === "upstream")
    return { icon: <GitFork size={13} />, tint: "text-git-branch bg-git-branch/10", hint: "the source project you forked from" };
  return { icon: <Globe size={13} />, tint: "text-[var(--text-tertiary)] bg-[var(--bg-surface-3)]", hint: "additional remote" };
}

export function RemotesPanel() {
  const snapshotRemotes = useUIStore((s) => s.remotes);
  const additionalRemotes = useUIStore((s) => s.additionalRemotes);
  const removedRemoteNames = useUIStore((s) => s.removedRemoteNames);
  const addRemote = useUIStore((s) => s.addRemote);
  const removeRemote = useUIStore((s) => s.removeRemote);
  const editRemote = useUIStore((s) => s.editRemote);

  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  // hydrated real remotes first; the seeded origin only when standalone; session-added ones
  // merged in (they also appear in the next real snapshot — dedupe by name keeps one copy).
  const byName = new Map<string, RemoteEntry>();
  for (const r of [...snapshotRemotes, ...(isInVsCode() ? [] : [{ name: originRemote.name, url: originRemote.url }]), ...additionalRemotes]) {
    if (!byName.has(r.name)) byName.set(r.name, r);
  }
  const remotes = [...byName.values()].filter((r) => !removedRemoteNames.includes(r.name));

  return (
    <Panel>
      <PanelHeader title="Remotes" subtitle="Where this repository syncs — exactly what `git remote -v` reports" />
      <div className="space-y-1.5">
        {remotes.length === 0 && (
          <p className="rounded-lg border border-dashed border-[var(--border-default)] px-3 py-3 text-center text-[11px] text-[var(--text-tertiary)]">
            No remotes yet — this repository is local-only until you add one.
          </p>
        )}
        {remotes.map((r) => {
          const meta = remoteMeta(r.name);
          const isEditing = editing === r.name;
          return (
            <div
              key={r.name}
              className="group flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.tint}`} title={meta.hint}>
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{r.name}</span>
                  <span className="hidden truncate text-[10px] text-[var(--text-tertiary)] sm:inline">· {meta.hint}</span>
                </div>
                {isEditing ? (
                  <input
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setError(editRemote(r.name, editUrl));
                        setEditing(null);
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    autoFocus
                    spellCheck={false}
                    className="focus-ring mt-0.5 h-6 w-full rounded border border-[var(--border-default)] bg-[var(--bg-surface)] px-1.5 font-mono text-[10px] text-[var(--text-primary)]"
                  />
                ) : (
                  <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">{r.url}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => {
                        setError(editRemote(r.name, editUrl));
                        setEditing(null);
                      }}
                      title="Save URL (git remote set-url)"
                      className="focus-ring rounded p-1 text-git-commit hover:bg-git-commit/10"
                    >
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditing(null)} title="Cancel" className="focus-ring rounded p-1 text-[var(--text-tertiary)]">
                      <XIcon size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditing(r.name);
                        setEditUrl(r.url);
                        setError(null);
                      }}
                      title="Edit URL (git remote set-url)"
                      className="focus-ring rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      <Pencil size={12} />
                    </button>
                    {r.name !== "origin" && (
                      <button
                        onClick={() => setError(removeRemote(r.name))}
                        title="Remove remote (git remote remove)"
                        className="focus-ring rounded p-1 text-[var(--text-tertiary)] hover:text-git-conflict"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            setError(null);
          }}
          placeholder="name (e.g. upstream)"
          className="focus-ring h-8 w-32 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
        <input
          value={newUrl}
          onChange={(e) => {
            setNewUrl(e.target.value);
            setError(null);
          }}
          placeholder="git@github.com:org/repo.git"
          spellCheck={false}
          className="focus-ring h-8 min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 font-mono text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={12} />}
          disabled={!newName.trim() || !newUrl.trim()}
          onClick={() => {
            const err = addRemote(newName, newUrl);
            setError(err);
            if (!err) {
              setNewName("");
              setNewUrl("");
            }
          }}
        >
          Add
        </Button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-git-conflict">{error}</p>}

      <EducationalNote
        what="A remote is just a bookmarked URL of another copy of this repository. 'origin' is yours (created by clone); 'upstream' conventionally points at the project you forked."
        why="Nothing syncs automatically — fetch, pull, and push each talk to one of these URLs. That's the entire relationship between your repo and the outside world."
        command="git remote -v"
      />
    </Panel>
  );
}

export function IdentityPanel() {
  const gitConfig = useUIStore((s) => s.gitConfig);
  const updateGitConfig = useUIStore((s) => s.updateGitConfig);
  const [name, setName] = useState(gitConfig.userName);
  const [email, setEmail] = useState(gitConfig.userEmail);
  const [saved, setSaved] = useState(false);

  const missing = !gitConfig.userName.trim() || !gitConfig.userEmail.trim();
  const dirty = name !== gitConfig.userName || email !== gitConfig.userEmail;

  const save = () => {
    const partial: Partial<typeof gitConfig> = {};
    if (name !== gitConfig.userName) partial.userName = name;
    if (email !== gitConfig.userEmail) partial.userEmail = email;
    if (Object.keys(partial).length === 0) return;
    updateGitConfig(partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <Panel>
      <PanelHeader title="Committer identity" subtitle="Recorded on every commit you make" />
      {missing && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-git-staged/25 bg-git-staged/8 px-3 py-2 text-[11px] text-git-staged">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Git refuses to commit until a name and email are set — fill these in first on any new machine.
        </div>
      )}
      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-tertiary)]">
            <UserRound size={11} /> user.name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your Name"
            className="focus-ring h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] text-[var(--text-tertiary)]">user.email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            spellCheck={false}
            className="focus-ring h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 font-mono text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
        </label>
        <Button size="sm" variant={dirty ? "primary" : "secondary"} className="w-full" disabled={!dirty} onClick={save} icon={<Check size={12} />}>
          {saved ? "Saved to global config" : "Save identity"}
        </Button>
      </div>
      <EducationalNote
        what="Every commit permanently records this name and email as its author — it's how `git blame` and contributor graphs know who did what."
        why="It lives in your global git config (not this repo), so setting it once covers every repository on this machine."
        command={`git config --global user.name "${name || "Your Name"}"`}
      />
    </Panel>
  );
}
