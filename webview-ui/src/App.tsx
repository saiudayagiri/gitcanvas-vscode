import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { FolderGit2, RefreshCw, GitBranch, Sparkles, Waypoints } from "lucide-react";
import { ThemeProvider } from "@/context/ThemeContext";
import { EducationalModeProvider } from "@/context/EducationalModeContext";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { CommitGraphPage } from "@/pages/CommitGraphPage";
import { WorkingTreePage } from "@/pages/WorkingTreePage";
import { BranchExplorerPage } from "@/pages/BranchExplorerPage";
import { FileHistoryPage } from "@/pages/FileHistoryPage";
import { MergeSimulatorPage } from "@/pages/MergeSimulatorPage";
import { RebaseSimulatorPage } from "@/pages/RebaseSimulatorPage";
import { RemoteSyncPage } from "@/pages/RemoteSyncPage";
import { ReflogPage } from "@/pages/ReflogPage";
import { WelcomePage } from "@/pages/WelcomePage";
import { cloneRepo, isInVsCode, onHostMessage, postToHost, runVsCodeCommand } from "@/lib/vscode-bridge";
import { useUIStore } from "@/store/ui-store";
import { RealConflictModal } from "@/components/conflict/RealConflictModal";

/** Shown instead of the (seeded demo) app whenever the extension host can't hand us a real
 * repository — no folder open, or the open folder isn't a git repo — so the user is never
 * left staring at fictional data that looks exactly like a working real repository. */
function NoRepoScreen({ message }: { message: string }) {
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<{ ok: boolean; text: string } | null>(null);

  const startClone = async () => {
    const url = cloneUrl.trim();
    if (!url || cloning) return;
    setCloning(true);
    setCloneResult(null);
    try {
      const { output } = await cloneRepo(url);
      setCloneResult({ ok: true, text: output });
    } catch (err) {
      setCloneResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[var(--bg-canvas)] px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-git-conflict/10 text-git-conflict">
        <FolderGit2 size={22} strokeWidth={2} />
      </div>
      <div>
        <h1 className="text-[16px] font-semibold text-[var(--text-primary)]">Can't open this repository</h1>
        <p className="mt-1.5 max-w-sm text-[13px] text-[var(--text-secondary)]">{message}</p>
      </div>

      <div className="w-full max-w-md text-left">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Clone a repository
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void startClone()}
            placeholder="https://github.com/user/repo.git"
            spellCheck={false}
            className="focus-ring mono-hash h-9 min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <Button
            size="sm"
            variant="primary"
            icon={<GitBranch size={12} />}
            disabled={cloneUrl.trim().length === 0 || cloning}
            onClick={() => void startClone()}
          >
            {cloning ? "Cloning…" : "Clone"}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
          Runs <span className="mono-hash">git clone {cloneUrl.trim() || "<url>"}</span> — you'll pick the destination
          folder, then get asked to open the clone.
        </p>
        {cloneResult && (
          <pre
            className={`mono-hash mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border px-3 py-2 text-[11px] ${
              cloneResult.ok
                ? "border-git-commit/25 bg-git-commit/8 text-[var(--text-secondary)]"
                : "border-git-conflict/25 bg-git-conflict/8 text-git-conflict"
            }`}
          >
            {cloneResult.text}
          </pre>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" icon={<Sparkles size={12} />} onClick={() => runVsCodeCommand("git.init")}>
          Initialize repository
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw size={12} />}
          onClick={() => postToHost({ type: "requestSnapshot" })}
        >
          Already have a repo open? Try again
        </Button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[var(--bg-canvas)]">
      <div className="flex h-11 w-11 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-git-remote text-white">
        <Waypoints size={20} strokeWidth={2.5} />
      </div>
      <p className="text-[12px] text-[var(--text-tertiary)]">Reading the repository…</p>
    </div>
  );
}

/** Requests real repo data from the extension host (a no-op in standalone browser preview)
 * and hydrates the store when it arrives. Lives above the router so `repoDataVersion` can
 * key a full remount — the simplest way to guarantee every page picks up live data without
 * auditing each page's memo dependencies by hand.
 *
 * Renders a loading screen until the host actually answers — never the seeded demo data.
 * Without this, the fictional lumen-analytics repo (fake commits, fake people) would flash
 * on screen first and only get replaced once the real snapshot (or "no repo" error) arrives,
 * which reads as "this tool is showing me someone else's project" for however long that
 * round-trip takes. Standalone browser preview (npm run dev, no VS Code host) skips this
 * entirely and shows the demo data immediately, since that's its whole purpose there. */
function RepoDataBridge({ children }: { children: React.ReactNode }) {
  const repoDataVersion = useUIStore((s) => s.repoDataVersion);
  const hydrateFromRepo = useUIStore((s) => s.hydrateFromRepo);
  const applyStatusUpdate = useUIStore((s) => s.applyStatusUpdate);
  const hostError = useUIStore((s) => s.hostError);
  const setHostError = useUIStore((s) => s.setHostError);
  const [ready, setReady] = useState(!isInVsCode());

  useEffect(() => {
    if (!isInVsCode()) return;
    const unsubscribe = onHostMessage((message) => {
      if (message.type === "repoSnapshot") {
        hydrateFromRepo(message.snapshot);
        setReady(true);
      } else if (message.type === "error") {
        setHostError(message.message);
        setReady(true);
      } else if (message.type === "statusUpdate") {
        // no repoDataVersion bump here on purpose — this is the whole point of the lightweight
        // path, a plain store update through React's normal re-render, not a full remount.
        applyStatusUpdate(message.workingFiles, message.stagedFiles, message.stashes);
      }
    });
    postToHost({ type: "ready" });
    return unsubscribe;
  }, [hydrateFromRepo, applyStatusUpdate, setHostError]);

  if (!ready) return <LoadingScreen />;
  if (hostError) return <NoRepoScreen message={hostError} />;
  return <div key={repoDataVersion}>{children}</div>;
}

function App() {
  return (
    <ThemeProvider>
      <EducationalModeProvider>
        <TooltipProvider>
          {/* Rendered outside RepoDataBridge's `key={repoDataVersion}` remount boundary — every
              conflict-file resolve triggers a fresh snapshot refresh (and thus a remount of
              everything under that key), which would otherwise reset this modal's own local
              state and flash its loading spinner after every single click. */}
          <RealConflictModal />
          <RepoDataBridge>
            <HashRouter>
              <Routes>
                <Route path="/welcome" element={<WelcomePage />} />
                <Route element={<AppShell />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/graph" element={<CommitGraphPage />} />
                  <Route path="/working-tree" element={<WorkingTreePage />} />
                  <Route path="/branches" element={<BranchExplorerPage />} />
                  <Route path="/history" element={<FileHistoryPage />} />
                  <Route path="/merge" element={<MergeSimulatorPage />} />
                  <Route path="/rebase" element={<RebaseSimulatorPage />} />
                  <Route path="/remote" element={<RemoteSyncPage />} />
                  <Route path="/reflog" element={<ReflogPage />} />
                </Route>
              </Routes>
            </HashRouter>
          </RepoDataBridge>
        </TooltipProvider>
      </EducationalModeProvider>
    </ThemeProvider>
  );
}

export default App;
