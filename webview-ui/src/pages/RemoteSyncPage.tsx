import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  HardDrive,
  Cloud,
  Download,
  Upload,
  RefreshCw,
  GitMerge,
  CheckCircle2,
  XCircle,
  ArrowRight,
  GitCommitHorizontal,
  AlertTriangle,
  Plus,
  Trash2,
} from "lucide-react";
import { branches, getCommit, mainBranch, remote, timeAgo } from "@/lib/mock-data";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EducationalNote } from "@/components/ui/EducationalNote";
import { Avatar } from "@/components/ui/Avatar";
import { useUIStore } from "@/store/ui-store";
import { useAllBranches, useCurrentBranch } from "@/hooks/useCurrentBranch";
import { dispatchAndLog, dispatchAndLogAsync } from "@/lib/dispatch-command";
import { isInVsCode } from "@/lib/vscode-bridge";
import clsx from "clsx";

export function RemoteSyncPage() {
  return isInVsCode() ? <LiveRemoteSyncPage /> : <SimulatedRemoteSyncPage />;
}

// ---------------------------------------------------------------------------
// Live — every number and action below is real: ahead/behind come from the current
// branch's actual upstream comparison, fetch/pull/push/force-push run for real against the
// real remote, and the remote list is whatever `git remote -v` actually reports.
// ---------------------------------------------------------------------------
function LiveRemoteSyncPage() {
  const [busy, setBusy] = useState<null | "fetch" | "pull" | "push" | "forcePush">(null);
  const [confirmingForce, setConfirmingForce] = useState(false);
  const logCommand = useUIStore((s) => s.logCommand);
  const realRemotes = useUIStore((s) => s.remotes);
  const addRemote = useUIStore((s) => s.addRemote);
  const removeRemote = useUIStore((s) => s.removeRemote);
  const [remoteName, setRemoteName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const currentBranch = useCurrentBranch() ?? mainBranch();
  const allBranches = useAllBranches();
  const localHead = getCommit(currentBranch.headHash);
  const upstreamName = currentBranch.upstream;
  const upstreamBranch = upstreamName ? allBranches.find((b) => b.kind === "remote" && b.name === upstreamName) : undefined;
  const remoteHead = upstreamBranch ? getCommit(upstreamBranch.headHash) : undefined;

  const ahead = currentBranch.ahead;
  const behind = currentBranch.behind;
  const synced = ahead === 0 && behind === 0;

  const run = async (kind: "fetch" | "pull" | "push" | "forcePush", command: string, gitCommand: Parameters<typeof dispatchAndLogAsync>[0]) => {
    setBusy(kind);
    logCommand(command);
    try {
      await dispatchAndLogAsync(gitCommand);
    } catch {
      // real failure already landed in lastCommandError and surfaces via the global toast
    } finally {
      setBusy(null);
    }
  };

  const handleForcePush = () => {
    if (!confirmingForce) {
      setConfirmingForce(true);
      setTimeout(() => setConfirmingForce(false), 2500);
      return;
    }
    setConfirmingForce(false);
    void run("forcePush", "git push --force-with-lease", { kind: "pushForce" });
  };

  return (
    <div className="mx-auto max-w-[980px] px-8 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Remote Sync</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        {remote.name} &middot; {remote.url} &middot; last fetched {timeAgo(remote.lastFetched)}
      </p>

      <Panel className="mt-5" glass padded={false}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-0 p-6">
          <SyncNode icon={<HardDrive size={16} />} title="Local" subtitle={currentBranch.name} role="branch">
            {localHead && <HeadRow commit={localHead} merged={synced} role="branch" />}
            {ahead > 0 && (
              <StatusPill role="commit" icon={<Upload size={11} />}>
                {ahead} to push
              </StatusPill>
            )}
          </SyncNode>

          <div className="relative mx-2 flex w-24 flex-col items-center justify-center gap-3">
            <Connector active={busy === "push" || busy === "forcePush"} direction="right" color="var(--color-git-commit)" />
            <Connector active={busy === "fetch" || busy === "pull"} direction="left" color="var(--color-git-remote)" />
          </div>

          <SyncNode icon={<Cloud size={16} />} title="Remote" subtitle={upstreamName ?? "no upstream"} role="remote">
            {remoteHead ? (
              <HeadRow commit={remoteHead} merged={synced} role="remote" />
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--border-default)] px-3 py-2.5 text-center text-[11px] text-[var(--text-tertiary)]">
                {upstreamName ? "Unknown — fetch to check" : "This branch has no upstream yet"}
              </div>
            )}
            {behind > 0 && (
              <StatusPill role="remote" icon={<Download size={11} />}>
                {behind} to pull
              </StatusPill>
            )}
          </SyncNode>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-2 text-[12px]">
            {synced ? (
              <span className="flex items-center gap-1.5 text-git-commit">
                <CheckCircle2 size={14} /> Up to date
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-git-conflict">
                <GitMerge size={14} /> Diverged — {ahead} ahead, {behind} behind
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run("fetch", "git fetch --all", { kind: "fetch" })}
              disabled={busy !== null}
              icon={<RefreshCw size={12} className={busy === "fetch" ? "animate-spin" : ""} />}
            >
              Fetch
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run("pull", "git pull", { kind: "pull" })}
              disabled={busy !== null || behind === 0}
              icon={<Download size={12} />}
            >
              Pull
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => run("push", "git push", { kind: "push" })}
              disabled={busy !== null || ahead === 0}
              icon={<Upload size={12} />}
            >
              Push
            </Button>
            {ahead > 0 && behind > 0 && (
              <Button
                size="sm"
                variant="danger"
                onClick={handleForcePush}
                disabled={busy !== null}
                icon={<AlertTriangle size={12} />}
              >
                {confirmingForce ? "Confirm force push?" : "Force push"}
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <EducationalNote
        what="Fetch downloads the remote's commits without touching your branch. Pull does that, then merges (or rebases) them in."
        why="A push is only accepted if it's a fast-forward — the remote must not have any commit your local branch doesn't already contain. Force-with-lease overrides that, but refuses if someone else pushed since your last fetch, so you can't clobber work you haven't even seen."
        command={behind > 0 ? "git pull" : ahead > 0 ? "git push" : "git fetch --all"}
      />

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MiniStat label="Ahead" value={ahead} icon={<Upload size={13} />} role="commit" />
        <MiniStat label="Behind" value={behind} icon={<Download size={13} />} role="remote" />
        <MiniStat label="Last synced" value={timeAgo(remote.lastSynced)} icon={<RefreshCw size={13} />} role="history" />
      </div>

      <Panel className="mt-5">
        <PanelHeader title="Remotes" subtitle="The remote repositories this project knows about" />
        <div className="space-y-1.5">
          {realRemotes.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-[var(--text-primary)]">{r.name}</div>
                <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">{r.url}</div>
              </div>
              {r.name !== "origin" && (
                <button
                  onClick={() => removeRemote(r.name)}
                  title="Remove remote"
                  className="focus-ring shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-git-conflict"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={remoteName}
            onChange={(e) => {
              setRemoteName(e.target.value);
              setRemoteError(null);
            }}
            placeholder="name (e.g. upstream)"
            className="focus-ring h-8 w-36 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <input
            value={remoteUrl}
            onChange={(e) => {
              setRemoteUrl(e.target.value);
              setRemoteError(null);
            }}
            placeholder="git@github.com:org/repo.git"
            className="focus-ring h-8 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={12} />}
            disabled={!remoteName.trim() || !remoteUrl.trim()}
            onClick={() => {
              const err = addRemote(remoteName, remoteUrl);
              if (err) {
                setRemoteError(err);
              } else {
                setRemoteName("");
                setRemoteUrl("");
              }
            }}
          >
            Add
          </Button>
        </div>
        {remoteError && <p className="mt-1.5 text-[11px] text-git-conflict">{remoteError}</p>}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulated — standalone design-prototype fallback (npm run dev, outside VS Code). Every
// action here is a scripted animation over the seeded lumen-analytics demo data; nothing in
// this component ever runs against a real repository.
// ---------------------------------------------------------------------------
type Phase = "diverged" | "fetched" | "pulled" | "pushed";

function SimulatedRemoteSyncPage() {
  const [phase, setPhase] = useState<Phase>("diverged");
  const [rejected, setRejected] = useState(false);
  const [confirmingForce, setConfirmingForce] = useState(false);
  const [busy, setBusy] = useState<null | "fetch" | "pull" | "push">(null);
  const logCommand = useUIStore((s) => s.logCommand);
  const additionalRemotes = useUIStore((s) => s.additionalRemotes);
  const removedRemoteNames = useUIStore((s) => s.removedRemoteNames);
  const addRemote = useUIStore((s) => s.addRemote);
  const removeRemote = useUIStore((s) => s.removeRemote);
  const [remoteName, setRemoteName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const originMain = branches.find((b) => b.name === "origin/main")!;
  const localHead = getCommit(mainBranch().headHash)!;
  const remoteHead = getCommit(originMain.headHash)!;

  const run = (action: "fetch" | "pull" | "push", duration: number, onDone: () => void) => {
    setBusy(action);
    setTimeout(() => {
      setBusy(null);
      onDone();
    }, duration);
  };

  const handleFetch = () => {
    logCommand(
      "git fetch origin",
      `From github.com:acme/lumen-analytics\n   ${mainBranch().headHash.slice(0, 7)}..${remoteHead.shortHash}  main -> origin/main`
    );
    dispatchAndLog({ kind: "fetch" });
    run("fetch", 700, () => setPhase((p) => (p === "diverged" ? "fetched" : p)));
  };
  const handlePull = () => {
    logCommand(
      "git pull origin main",
      `Merge made by the 'ort' strategy.\n 1 file changed`
    );
    dispatchAndLog({ kind: "pull" });
    run("pull", 900, () => {
      setPhase("pulled");
    });
  };
  const handlePush = () => {
    if (phase === "diverged" || phase === "fetched") {
      logCommand(
        "git push origin main",
        `! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs\nhint: Updates were rejected because the remote contains work that you do not have locally.`
      );
      setRejected(true);
      setTimeout(() => setRejected(false), 900);
      return;
    }
    logCommand("git push origin main", `To github.com:acme/lumen-analytics.git\n   main -> main`);
    dispatchAndLog({ kind: "push" });
    run("push", 700, () => setPhase("pushed"));
  };
  const handleForcePush = () => {
    if (!confirmingForce) {
      setConfirmingForce(true);
      setTimeout(() => setConfirmingForce(false), 2500);
      return;
    }
    setConfirmingForce(false);
    logCommand(
      "git push --force origin main",
      `+ ${remoteHead.shortHash}...${localHead.shortHash} main -> main (forced update)\nWARNING: origin/main's previous history is no longer reachable from any branch.`
    );
    run("push", 700, () => setPhase("pushed"));
  };

  const localAhead = phase === "pushed" ? 0 : phase === "pulled" ? 1 : 1;
  const localBehind = phase === "diverged" || phase === "fetched" ? 1 : 0;
  const remoteKnown = phase !== "diverged";
  const synced = phase === "pulled" || phase === "pushed";
  const visibleRemotes = [
    { name: remote.name, url: remote.url, protected: true },
    ...additionalRemotes.map((r) => ({ ...r, protected: false })),
  ].filter((r) => !removedRemoteNames.includes(r.name));

  return (
    <div className="mx-auto max-w-[980px] px-8 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Remote Sync</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        {remote.name} &middot; {remote.url} &middot; last fetched {timeAgo(remote.lastFetched)}
      </p>

      <Panel className="mt-5" glass padded={false}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-0 p-6">
          {/* Local */}
          <SyncNode
            icon={<HardDrive size={16} />}
            title="Local"
            subtitle="main"
            role="branch"
          >
            <HeadRow commit={localHead} merged={phase === "pulled" || phase === "pushed"} role="branch" />
            {localAhead > 0 && (
              <StatusPill role="commit" icon={<Upload size={11} />}>
                {localAhead} to push
              </StatusPill>
            )}
          </SyncNode>

          {/* Connector */}
          <div className="relative mx-2 flex w-24 flex-col items-center justify-center gap-3">
            <Connector active={busy === "push"} direction="right" color="var(--color-git-commit)" />
            <Connector active={busy === "fetch" || busy === "pull"} direction="left" color="var(--color-git-remote)" />
            <AnimatePresence>
              {rejected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1, x: [0, -6, 6, -4, 4, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute -top-8 flex items-center gap-1 rounded-full bg-git-conflict/15 px-2 py-1 text-[10px] font-semibold text-git-conflict"
                >
                  <XCircle size={11} /> rejected
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Remote */}
          <SyncNode icon={<Cloud size={16} />} title="Remote" subtitle="origin/main" role="remote">
            {remoteKnown ? (
              <HeadRow commit={remoteHead} merged={phase === "pulled" || phase === "pushed"} role="remote" />
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--border-default)] px-3 py-2.5 text-center text-[11px] text-[var(--text-tertiary)]">
                Unknown — fetch to check
              </div>
            )}
            {localBehind > 0 && remoteKnown && (
              <StatusPill role="remote" icon={<Download size={11} />}>
                {localBehind} to pull
              </StatusPill>
            )}
          </SyncNode>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-2 text-[12px]">
            {synced ? (
              <span className="flex items-center gap-1.5 text-git-commit">
                <CheckCircle2 size={14} /> {phase === "pushed" ? "Up to date" : "Merged locally — ready to push"}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-git-conflict">
                <GitMerge size={14} /> Diverged — 1 ahead, 1 behind
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleFetch} disabled={busy !== null || phase !== "diverged"} icon={<RefreshCw size={12} className={busy === "fetch" ? "animate-spin" : ""} />}>
              Fetch
            </Button>
            <Button size="sm" variant="secondary" onClick={handlePull} disabled={busy !== null || synced} icon={<Download size={12} />}>
              Pull
            </Button>
            <Button size="sm" variant="primary" onClick={handlePush} disabled={busy !== null || phase === "pushed"} icon={<Upload size={12} />}>
              Push
            </Button>
            {(phase === "diverged" || phase === "fetched") && (
              <Button
                size="sm"
                variant="danger"
                onClick={handleForcePush}
                disabled={busy !== null}
                icon={<AlertTriangle size={12} />}
              >
                {confirmingForce ? "Confirm force push?" : "Force push"}
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <EducationalNote
        what={
          phase === "pushed"
            ? "Local and remote now point at the same commit — nothing left to synchronize."
            : phase === "pulled"
            ? "Pull fetched the remote's commit and merged it into your branch. Your branch is now ahead — push to publish that merge."
            : "Fetch downloads the remote's commits without touching your branch. Pull does that, then merges (or rebases) them in."
        }
        why="A push is only accepted if it's a fast-forward — the remote must not have any commit your local branch doesn't already contain. Since origin/main has a commit you don't have, Git rejects the push until you incorporate it."
        command={phase === "diverged" ? "git fetch origin" : phase === "fetched" ? "git pull origin main" : "git push origin main"}
      />

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MiniStat label="Ahead" value={localAhead} icon={<Upload size={13} />} role="commit" />
        <MiniStat label="Behind" value={localBehind} icon={<Download size={13} />} role="remote" />
        <MiniStat label="Last synced" value={timeAgo(remote.lastSynced)} icon={<RefreshCw size={13} />} role="history" />
      </div>

      <Panel className="mt-5">
        <PanelHeader title="Remotes" subtitle="The remote repositories this project knows about" />
        <div className="space-y-1.5">
          {visibleRemotes.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-[var(--text-primary)]">{r.name}</div>
                <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">{r.url}</div>
              </div>
              {!r.protected && (
                <button
                  onClick={() => removeRemote(r.name)}
                  title="Remove remote"
                  className="focus-ring shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-git-conflict"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={remoteName}
            onChange={(e) => {
              setRemoteName(e.target.value);
              setRemoteError(null);
            }}
            placeholder="name (e.g. upstream)"
            className="focus-ring h-8 w-36 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <input
            value={remoteUrl}
            onChange={(e) => {
              setRemoteUrl(e.target.value);
              setRemoteError(null);
            }}
            placeholder="git@github.com:org/repo.git"
            className="focus-ring h-8 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2.5 font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={12} />}
            disabled={!remoteName.trim() || !remoteUrl.trim()}
            onClick={() => {
              const err = addRemote(remoteName, remoteUrl);
              if (err) {
                setRemoteError(err);
              } else {
                setRemoteName("");
                setRemoteUrl("");
              }
            }}
          >
            Add
          </Button>
        </div>
        {remoteError && <p className="mt-1.5 text-[11px] text-git-conflict">{remoteError}</p>}
      </Panel>
    </div>
  );
}

function SyncNode({
  icon,
  title,
  subtitle,
  role,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  role: "branch" | "remote";
  children: React.ReactNode;
}) {
  const color = role === "branch" ? "var(--color-git-branch)" : "var(--color-git-remote)";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: color + "1a", color }}>
          {icon}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
          <div className="text-[11px] text-[var(--text-tertiary)]">{subtitle}</div>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function HeadRow({ commit, role, merged }: { commit: ReturnType<typeof getCommit>; role: "branch" | "remote"; merged: boolean }) {
  if (!commit) return null;
  const color = role === "branch" ? "var(--color-git-branch)" : "var(--color-git-remote)";
  return (
    <motion.div layout className="flex items-center gap-2 rounded-lg bg-[var(--bg-surface-2)] p-2">
      <Avatar author={commit.author} size={24} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-[var(--text-primary)]">{commit.subject}</div>
        <div className="mt-0.5 flex items-center gap-1.5 font-tabular text-[10px]" style={{ color }}>
          <GitCommitHorizontal size={10} />
          {commit.shortHash}
          {merged && <span className="text-[var(--text-tertiary)]">(merged)</span>}
        </div>
      </div>
    </motion.div>
  );
}

function StatusPill({ role, icon, children }: { role: "commit" | "remote"; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = role === "commit" ? "bg-git-commit/12 text-git-commit" : "bg-git-remote/12 text-git-remote";
  return (
    <div className={clsx("flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium", cls)}>
      {icon}
      {children}
    </div>
  );
}

function Connector({ active, direction, color }: { active: boolean; direction: "left" | "right"; color: string }) {
  return (
    <div className="relative h-1 w-full rounded-full bg-[var(--bg-surface-3)]">
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ x: direction === "right" ? "-100%" : "100%", opacity: 0 }}
            animate={{ x: direction === "right" ? "100%" : "-100%", opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
            className="absolute -top-1 h-3 w-3 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          />
        )}
      </AnimatePresence>
      <ArrowRight
        size={12}
        className={clsx(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          direction === "left" && "rotate-180"
        )}
        style={{ color: "var(--text-tertiary)" }}
      />
    </div>
  );
}

function MiniStat({ label, value, icon, role }: { label: string; value: React.ReactNode; icon: React.ReactNode; role: "commit" | "remote" | "history" }) {
  const cls = role === "commit" ? "text-git-commit" : role === "remote" ? "text-git-remote" : "text-[var(--text-primary)]";
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
      <div className={clsx("flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--bg-surface-2)]", cls)}>{icon}</div>
      <div>
        <div className={clsx("font-tabular text-[15px] font-semibold", cls)}>{value}</div>
        <div className="text-[11px] text-[var(--text-tertiary)]">{label}</div>
      </div>
    </div>
  );
}
