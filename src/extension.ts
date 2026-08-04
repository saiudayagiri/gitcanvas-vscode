import * as vscode from "vscode";
import { GitCanvasPanel } from "./panel";
import { BranchesTreeProvider } from "./branchesTreeView";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("gitCanvas.open", () => {
      GitCanvasPanel.createOrShow(context.extensionUri);
    })
  );

  const branchesProvider = new BranchesTreeProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider("gitCanvas.branches", branchesProvider));

  // Debounced so a burst of events (a build writing dozens of files, a branch switch touching
  // both refs and the working tree) triggers one refresh, not one per file. Two tiers: a real
  // history change (commit, branch, tag) needs the full commit-log/branches rebuild, but a plain
  // working-tree edit or `git add` only ever changes `git status` — forcing the full rebuild for
  // that was the actual cause of "changes reflected late" (a full `git log --numstat` over 300
  // commits, plus a full webview remount, just to show one edited file). `pendingFullRefresh`
  // only ever gets set true by a real history event and is never downgraded back to false by a
  // working-tree event, so a checkout that touches both still gets the full refresh it needs.
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingFullRefresh = false;
  const scheduleRefresh = (full: boolean) => {
    branchesProvider.refresh();
    if (full) pendingFullRefresh = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const doFull = pendingFullRefresh;
      pendingFullRefresh = false;
      if (doFull) void GitCanvasPanel.currentPanel?.refresh();
      else void GitCanvasPanel.currentPanel?.refreshStatusOnly();
    }, 150);
  };

  // HEAD/refs changes — an actual commit, branch switch, merge, or tag. Needs the full rebuild.
  const historyWatcher = vscode.workspace.createFileSystemWatcher("**/.git/{HEAD,refs/heads/**,refs/tags/**}");
  context.subscriptions.push(
    historyWatcher,
    historyWatcher.onDidChange(() => scheduleRefresh(true)),
    historyWatcher.onDidCreate(() => scheduleRefresh(true)),
    historyWatcher.onDidDelete(() => scheduleRefresh(true))
  );

  // The working tree itself, plus `.git/index` (staging) — both only ever change `git status`.
  // This pattern also matches inside `.git/` (nothing excludes it), so a real history change
  // fires this too; harmless, since it can only ever escalate `pendingFullRefresh`, never
  // downgrade it.
  const treeWatcher = vscode.workspace.createFileSystemWatcher("**/*");
  context.subscriptions.push(
    treeWatcher,
    treeWatcher.onDidChange(() => scheduleRefresh(false)),
    treeWatcher.onDidCreate(() => scheduleRefresh(false)),
    treeWatcher.onDidDelete(() => scheduleRefresh(false))
  );

  // exposed for the extension's own test suite — not part of the public API.
  // Must go through this (not a direct `import { GitCanvasPanel } from "./panel"` in the
  // test file) because the running extension loads the esbuild-bundled dist/extension.js, a
  // separate module instance from whatever the test compiles from src/ — importing the class
  // straight from source gets a disconnected copy whose statics never see the real panel.
  return { branchesProvider, getCurrentPanel: () => GitCanvasPanel.currentPanel };
}

export function deactivate() {}
