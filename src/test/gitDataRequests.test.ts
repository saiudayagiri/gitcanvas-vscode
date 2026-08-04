import * as assert from "assert";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { resolveDataRequest } from "../gitDataRequests";
import { runGitCommand } from "../gitWriteCommands";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

suite("Real diff / reflog / blame data requests", () => {
  let cwd: string;

  suiteSetup(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), "gitcanvas-data-test-"));
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "line1\nline2\nline3\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "c1"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "line1\nCHANGED\nline3\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "c2"]);
    await git(cwd, ["checkout", "-q", "-b", "feature"]);
  });

  test("diff request returns a real unified diff for the commit", async () => {
    const c2 = await git(cwd, ["rev-parse", "HEAD"]);
    const result = await resolveDataRequest(cwd, { kind: "diff", hash: c2, path: "a.txt" });
    assert.strictEqual(result.kind, "diff");
    if (result.kind !== "diff") return;
    assert.match(result.diff, /^diff --git a\/a\.txt b\/a\.txt/);
    assert.match(result.diff, /-line2/);
    assert.match(result.diff, /\+CHANGED/);
  });

  test("diff request for a nonexistent path returns empty", async () => {
    const c2 = await git(cwd, ["rev-parse", "HEAD"]);
    const result = await resolveDataRequest(cwd, { kind: "diff", hash: c2, path: "does-not-exist.txt" });
    assert.strictEqual(result.kind, "diff");
    if (result.kind !== "diff") return;
    assert.strictEqual(result.diff, "");
  });

  test("reflog request reflects real HEAD movements, newest first", async () => {
    const result = await resolveDataRequest(cwd, { kind: "reflog" });
    assert.strictEqual(result.kind, "reflog");
    if (result.kind !== "reflog") return;
    assert.ok(result.entries.length >= 3, `expected at least 3 reflog entries, got ${result.entries.length}`);
    assert.strictEqual(result.entries[0].action, "checkout"); // the most recent op was `checkout -b feature`
    assert.ok(result.entries.every((e) => e.hash.length === 40), "every entry should carry a full real hash");
    // newest first: timestamps should be non-increasing
    for (let i = 1; i < result.entries.length; i++) {
      assert.ok(result.entries[i - 1].timestamp >= result.entries[i].timestamp);
    }
  });

  test("blame request attributes each real line to the commit that introduced it", async () => {
    const result = await resolveDataRequest(cwd, { kind: "blame", path: "a.txt" });
    assert.strictEqual(result.kind, "blame");
    if (result.kind !== "blame") return;
    assert.strictEqual(result.lines.length, 3);
    assert.strictEqual(result.lines[0].content, "line1");
    assert.strictEqual(result.lines[1].content, "CHANGED");
    assert.strictEqual(result.lines[2].content, "line3");
    // line 2 was introduced by c2, lines 1 and 3 are still from c1
    assert.notStrictEqual(result.lines[1].hash, result.lines[0].hash);
    assert.strictEqual(result.lines[0].hash, result.lines[2].hash);
    assert.strictEqual(result.lines[1].subject, "c2");
    assert.strictEqual(result.lines[0].authorEmail, "t@example.com");
  });

  test("write commands now resolve with git's real printed output", async () => {
    fs.writeFileSync(path.join(cwd, "b.txt"), "new file\n");
    await runGitCommand(cwd, { kind: "stage", path: "b.txt" });
    const output = await runGitCommand(cwd, { kind: "commit", message: "add b.txt", amend: false });
    assert.match(output, /add b\.txt/, `expected real commit output to mention the message, got: ${output}`);
  });
});
