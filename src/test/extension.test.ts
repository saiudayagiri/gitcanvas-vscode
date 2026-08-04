import * as assert from "assert";
import * as vscode from "vscode";
import { buildSnapshot } from "../buildSnapshot";

async function waitFor(predicate: () => boolean, timeoutMs = 10_000, intervalMs = 100): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function getExports() {
  const ext = vscode.extensions.getExtension("saiudayagiri.gitcanvas")!;
  return ext.activate();
}

suite("GitCanvas extension", () => {
  test("activates and registers the open command", async () => {
    const ext = vscode.extensions.getExtension("saiudayagiri.gitcanvas");
    assert.ok(ext, "extension should be discoverable");
    await ext!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("gitCanvas.open"), "gitCanvas.open should be registered");
  });

  test("opening the panel does not throw and creates a visible editor tab", async () => {
    await vscode.commands.executeCommand("gitCanvas.open");
    // give the webview a moment to materialize as an editor tab
    await new Promise((resolve) => setTimeout(resolve, 500));

    const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    const panelTab = allTabs.find((t) => t.label === "GitCanvas");
    assert.ok(panelTab, "GitCanvas webview tab should be open");
  });

  test("branches TreeView lists real branches from the open workspace", async () => {
    const exports = await getExports();
    const items = await exports.branchesProvider.getChildren();
    const labels = items.map((i: vscode.TreeItem) => i.label);

    assert.ok(labels.includes("main"), `expected 'main' among ${JSON.stringify(labels)}`);
    assert.ok(labels.includes("feature/one"), `expected 'feature/one' among ${JSON.stringify(labels)}`);
    assert.ok(labels.includes("feature/two"), `expected 'feature/two' among ${JSON.stringify(labels)}`);

    const current = items.find((i: vscode.TreeItem) => i.label === "main");
    assert.strictEqual(current?.description, "current", "main should be marked as the current branch");
  });

  test("panel receives a real repo snapshot after opening", async function () {
    this.timeout(15_000);
    const exports = await getExports();
    await vscode.commands.executeCommand("gitCanvas.open");
    await waitFor(() => (exports.getCurrentPanel()?.lastSnapshotCommitCount ?? -1) >= 0);
    assert.strictEqual(exports.getCurrentPanel()?.lastSnapshotCommitCount, 2, "expected both real commits across all branches");
  });

  test("refreshStatusOnly() runs the lightweight working-tree-only path without throwing", async () => {
    const exports = await getExports();
    await vscode.commands.executeCommand("gitCanvas.open");
    await waitFor(() => (exports.getCurrentPanel()?.lastSnapshotCommitCount ?? -1) >= 0);
    // just needs to resolve cleanly — it posts a message rather than returning a value, so this
    // is mainly a regression guard against the toWorkingFile import/export wiring breaking.
    await exports.getCurrentPanel()!.refreshStatusOnly();
  });

  test("buildSnapshot() shapes real git data correctly", async () => {
    const cwd = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const snapshot = await buildSnapshot(cwd);

    assert.strictEqual(snapshot.commits.length, 2);
    assert.strictEqual(snapshot.currentBranchName, "main");
    assert.ok(snapshot.commits.some((c) => c.subject === "initial commit"));
    assert.ok(snapshot.commits.some((c) => c.subject === "add feature"));

    const branchNames = snapshot.branches.map((b) => b.name).sort();
    assert.deepStrictEqual(branchNames, ["feature/one", "feature/two", "main"]);

    const featureOne = snapshot.branches.find((b) => b.name === "feature/one")!;
    assert.strictEqual(featureOne.forkedFromHash, snapshot.branches.find((b) => b.name === "main")!.headHash);

    // real uncommitted state from the fixture: README.md modified, untracked.txt new
    const modified = snapshot.workingFiles.find((f) => f.path === "README.md");
    assert.strictEqual(modified?.state, "modified");
    const untracked = snapshot.workingFiles.find((f) => f.path === "untracked.txt");
    assert.strictEqual(untracked?.state, "untracked");

    assert.strictEqual(snapshot.currentUser.email, "test@example.com");

    // neither fixture commit is GPG-signed — gpgSigned must reflect that, not just default
    // to a hardcoded value that never actually checks the real signature status
    assert.ok(snapshot.commits.every((c) => c.gpgSigned === false), "unsigned fixture commits should report gpgSigned: false");

    assert.strictEqual(typeof snapshot.globalConfig.defaultBranch, "string");
    assert.strictEqual(typeof snapshot.globalConfig.editor, "string");
  });
});
