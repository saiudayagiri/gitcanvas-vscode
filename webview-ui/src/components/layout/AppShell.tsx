import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { CommitInspector } from "../commit-inspector/CommitInspector";
import { BranchSwitchGuard } from "../branch-switch/BranchSwitchGuard";
import { ToyTerminal } from "../terminal/ToyTerminal";
import { CommandErrorToast } from "./CommandErrorToast";
import { ErrorBoundary } from "../ErrorBoundary";

export function AppShell() {
  // keyed on route so navigating away from a crashed page resets the boundary instead of
  // permanently showing the error screen for the rest of the session.
  const location = useLocation();
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-canvas)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <ToyTerminal />
      </div>
      <CommandPalette />
      <CommitInspector />
      <BranchSwitchGuard />
      <CommandErrorToast />
    </div>
  );
}
