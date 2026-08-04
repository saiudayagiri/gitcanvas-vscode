import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

class BranchItem extends vscode.TreeItem {
  constructor(name: string, isCurrent: boolean) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(isCurrent ? "git-branch" : "circle-outline");
    this.contextValue = "gitCanvas.branch";
    if (isCurrent) this.description = "current";
  }
}

/**
 * A real, read-only branch list for whatever git repo is open — native TreeView rather
 * than a webview, since this is exactly what VS Code's own list widgets already do well.
 */
export class BranchesTreeProvider implements vscode.TreeDataProvider<BranchItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BranchItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<BranchItem[]> {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) return [];

    try {
      const { stdout } = await execFileAsync("git", ["branch", "--format=%(HEAD) %(refname:short)"], { cwd });
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const isCurrent = line.startsWith("*");
          const name = line.replace(/^\*?\s*/, "");
          return new BranchItem(name, isCurrent);
        });
    } catch {
      return [];
    }
  }
}
