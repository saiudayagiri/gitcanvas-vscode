import * as assert from "assert";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { GitService } from "../gitService";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

// Real-world working trees hit two porcelain-v2 shapes the naive parsing used to mishandle:
// an entirely untracked directory collapses to one line with a trailing slash rather than one
// line per file inside it, and a file can be simultaneously staged AND further modified (status
// "AM") — both silently produced a broken or incomplete result the Working Tree page then
// couldn't render a name for.
suite("GitService.getStatus() against real working-tree edge cases", () => {
  test("an untracked directory is reported with its own path, not silently mangled", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "gitcanvas-status-test-"));
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "test@example.com"]);
    await git(cwd, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "hello\n");
    await git(cwd, ["add", "a.txt"]);
    await git(cwd, ["commit", "-q", "-m", "initial"]);

    fs.mkdirSync(path.join(cwd, "untracked-dir"));
    fs.writeFileSync(path.join(cwd, "untracked-dir", "inside.txt"), "new\n");

    const status = await new GitService(cwd).getStatus();
    const entry = status.find((f) => f.state === "untracked");
    assert.ok(entry, "the untracked directory should be reported");
    assert.ok(entry!.path.startsWith("untracked-dir"), `expected path to start with "untracked-dir", got "${entry!.path}"`);
  });

  test("a file that's staged AND further modified shows up as both, not collapsed into one", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "gitcanvas-status-test-"));
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "test@example.com"]);
    await git(cwd, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "line1\n");
    await git(cwd, ["add", "a.txt"]);
    await git(cwd, ["commit", "-q", "-m", "initial"]);

    fs.writeFileSync(path.join(cwd, "a.txt"), "line1\nline2\n");
    await git(cwd, ["add", "a.txt"]); // staged: line2 added
    fs.writeFileSync(path.join(cwd, "a.txt"), "line1\nline2\nline3\n");
    // now further modified beyond what's staged: line3 added, not yet staged

    const status = await new GitService(cwd).getStatus();
    const staged = status.find((f) => f.path === "a.txt" && f.state === "staged");
    const modified = status.find((f) => f.path === "a.txt" && f.state === "modified");
    assert.ok(staged, "the staged half of the change must be reported");
    assert.ok(modified, "the unstaged half of the change must also be reported, not dropped");
  });
});
