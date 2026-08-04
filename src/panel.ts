import * as vscode from "vscode";
import * as fs from "fs";
import { GitService } from "./gitService";
import { buildSnapshot, toWorkingFile } from "./buildSnapshot";
import { GitConflictError, cloneRepository, runGitCommand } from "./gitWriteCommands";
import { resolveDataRequest } from "./gitDataRequests";
import type { HostMessage, WebviewMessage } from "./protocol";

/** Commands that only ever touch the working tree — `git status` alone reflects everything
 * they can change, so they never need the full log/branches/tags/stashes rebuild. */
const STATUS_ONLY_COMMAND_KINDS = new Set(["stage", "unstage", "stageAll", "unstageAll", "discard", "clean"]);

/** Commands that touch the working tree AND the stash list, but nothing else a full snapshot
 * would add (no new commit, no branch/ref change) — still cheap to reflect without a remount. */
const STATUS_AND_STASH_COMMAND_KINDS = new Set(["stashPush", "stashApply", "stashPop", "stashDrop"]);

/**
 * Manages the single GitCanvas webview panel — a full editor tab, since the design
 * (commit graph, merge/rebase simulators, dashboard) needs the width of the editor area,
 * not the narrow sidebar.
 */
export class GitCanvasPanel {
  public static currentPanel: GitCanvasPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private repoRoot: string | null = null;
  public lastSnapshotCommitCount = -1; // exposed for the extension's own test suite

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (GitCanvasPanel.currentPanel) {
      GitCanvasPanel.currentPanel.panel.reveal(column);
      return GitCanvasPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel("gitCanvas", "GitCanvas", column ?? vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "webview-ui", "dist")],
    });

    GitCanvasPanel.currentPanel = new GitCanvasPanel(panel, extensionUri);
    return GitCanvasPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.webview.html = this.buildHtml(panel.webview, extensionUri);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message.type === "ready" || message.type === "requestSnapshot") {
        void this.refresh();
      } else if (message.type === "runCommand") {
        void this.handleCommand(message.requestId, message.command);
      } else if (message.type === "requestData") {
        void this.handleDataRequest(message.requestId, message.request);
      } else if (message.type === "runVsCodeCommand") {
        void vscode.commands.executeCommand(message.command);
      } else if (message.type === "cloneRepo") {
        void this.handleClone(message.requestId, message.url);
      }
    }, null, this.disposables);
  }

  private async handleClone(requestId: string, url: string): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Clone here",
      title: "Choose the folder to clone into",
    });
    const parentDir = picked?.[0]?.fsPath;
    if (!parentDir) {
      this.post({ type: "commandResult", requestId, ok: false, error: "Clone cancelled — no destination folder was chosen." });
      return;
    }
    try {
      const { output, dest } = await cloneRepository(url, parentDir);
      this.post({ type: "commandResult", requestId, ok: true, output: output || `Cloned into ${dest}` });
      const open = await vscode.window.showInformationMessage(
        `Cloned into ${dest}. Open it now?`,
        "Open",
        "Open in New Window"
      );
      if (open) {
        void vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(dest), {
          forceNewWindow: open === "Open in New Window",
        });
      }
    } catch (err) {
      this.post({ type: "commandResult", requestId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async resolveRepoRoot(): Promise<string | null> {
    if (!this.repoRoot) {
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      this.repoRoot = cwd ? await GitService.findRepoRoot(cwd) : null;
    }
    return this.repoRoot;
  }

  private async handleCommand(requestId: string, command: Parameters<typeof runGitCommand>[1]): Promise<void> {
    const repoRoot = await this.resolveRepoRoot();
    if (!repoRoot) {
      this.post({ type: "commandResult", requestId, ok: false, error: "No repository is open." });
      return;
    }
    try {
      const output = await runGitCommand(repoRoot, command);
      this.post({ type: "commandResult", requestId, ok: true, output });
      // reflect the real state change immediately, don't wait for the file watcher — but a
      // stage/unstage/stash click shouldn't bump repoDataVersion and remount the whole webview,
      // which used to bounce you off the Staging Area/Stashes pane back to Working Directory on
      // every single click.
      if (STATUS_ONLY_COMMAND_KINDS.has(command.kind)) {
        await this.refreshStatusOnly();
      } else if (STATUS_AND_STASH_COMMAND_KINDS.has(command.kind)) {
        await this.refreshStatusOnly(true);
      } else {
        await this.refresh();
      }
    } catch (err) {
      if (err instanceof GitConflictError) {
        // a real, resolvable conflict — not a failure the webview should show as an error toast.
        // Always the full picture here: a conflict mid-merge/rebase/cherry-pick/revert touches
        // HEAD and branch state well beyond what a status-only refresh would cover.
        this.post({ type: "commandResult", requestId, ok: true, output: err.message, conflict: err.op });
        await this.refresh();
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: "commandResult", requestId, ok: false, error: message });
    }
  }

  private async handleDataRequest(requestId: string, request: Parameters<typeof resolveDataRequest>[1]): Promise<void> {
    const repoRoot = await this.resolveRepoRoot();
    if (!repoRoot) {
      this.post({ type: "dataResult", requestId, ok: false, error: "No repository is open." });
      return;
    }
    try {
      const data = await resolveDataRequest(repoRoot, request);
      this.post({ type: "dataResult", requestId, ok: true, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: "dataResult", requestId, ok: false, error: message });
    }
  }

  public async refresh(): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) {
      this.post({ type: "error", message: "No folder is open — open a git repository first." });
      return;
    }
    const repoRoot = await this.resolveRepoRoot();
    if (!repoRoot) {
      this.post({ type: "error", message: "The open folder isn't a git repository." });
      return;
    }

    try {
      const snapshot = await buildSnapshot(repoRoot);
      this.lastSnapshotCommitCount = snapshot.commits.length;
      this.post({ type: "repoSnapshot", snapshot });
    } catch (err) {
      this.post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** A plain working-tree edit (nothing staged, no commit, no branch change) only ever changes
   * `git status` — re-running the full commit-log/branches/tags/stashes/remotes fetch for that
   * is pure waste, and the extra latency was the actual bug behind "changes not reflected". This
   * skips straight to `git status` and posts just the two file lists — plus, for stash
   * push/apply/pop/drop (the other case that can't move the commit log or branches but does
   * change the stash list), the stash list too, so those commands stay on this same light path
   * instead of needing the full repoSnapshot rebuild+remount just to update one extra list. */
  public async refreshStatusOnly(includeStashes = false): Promise<void> {
    if (!this.repoRoot) return;
    try {
      const git = new GitService(this.repoRoot);
      const [rawStatus, rawStashes] = await Promise.all([git.getStatus(), includeStashes ? git.getStashes() : null]);
      const workingFiles = rawStatus.filter((f) => f.state !== "staged").map(toWorkingFile);
      const stagedFiles = rawStatus.filter((f) => f.state === "staged").map(toWorkingFile);
      const stashes = rawStashes?.map((s) => ({ id: `stash-${s.index}`, message: s.message, branchName: s.branch, createdAt: s.createdAt }));
      this.post({ type: "statusUpdate", workingFiles, stagedFiles, ...(stashes ? { stashes } : {}) });
    } catch {
      // best-effort — the next full refresh (or the debounced git-internals watcher) recovers
    }
  }

  private post(message: HostMessage) {
    void this.panel.webview.postMessage(message);
  }

  private buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const distUri = vscode.Uri.joinPath(extensionUri, "webview-ui", "dist");
    const indexPath = vscode.Uri.joinPath(distUri, "index.html").fsPath;
    let html = fs.readFileSync(indexPath, "utf-8");

    // Rewrite every relative asset reference (built with vite's `base: "./"`) to a
    // webview-safe URI, since the page doesn't load from a normal http(s) origin.
    html = html.replace(/(src|href)="\.\/(.*?)"/g, (_match, attr, relPath) => {
      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, relPath as string));
      return `${attr}="${assetUri.toString()}"`;
    });

    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `connect-src ${webview.cspSource}`,
    ].join("; ");

    html = html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);
    // Vite emits `<script type="module" ...>` without a nonce attribute — add one so it
    // clears the CSP script-src rule above (module scripts are otherwise blocked by default).
    html = html.replace('<script type="module"', `<script type="module" nonce="${nonce}"`);

    return html;
  }

  public dispose() {
    GitCanvasPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
