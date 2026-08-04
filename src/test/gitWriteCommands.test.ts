import * as assert from "assert";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { cloneRepository, cloneTargetDirName, runGitCommand } from "../gitWriteCommands";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

// Verifies against the real git CLI directly — not buildSnapshot() — so this can't pass
// just because our own read and write paths happen to agree with each other. Runs in its
// own throwaway repo (not the shared VS Code workspace fixture other suites use) since
// mocha doesn't guarantee cross-file suite ordering and these tests mutate real state.
suite("Git write commands mutate the real repository", () => {
  let cwd: string;

  suiteSetup(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), "gitcanvas-write-test-"));
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "test@example.com"]);
    await git(cwd, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(cwd, "README.md"), "hello\n");
    await git(cwd, ["add", "README.md"]);
    await git(cwd, ["commit", "-q", "-m", "initial commit"]);
  });

  test("stage / unstage a file", async () => {
    fs.writeFileSync(path.join(cwd, "write-test.txt"), "hello\n");
    await runGitCommand(cwd, { kind: "stage", path: "write-test.txt" });
    let status = await git(cwd, ["status", "--porcelain"]);
    assert.match(status, /^A  write-test\.txt$/m, `expected staged add, got:\n${status}`);

    await runGitCommand(cwd, { kind: "unstage", path: "write-test.txt" });
    status = await git(cwd, ["status", "--porcelain"]);
    assert.match(status, /^\?\? write-test\.txt$/m, `expected untracked again, got:\n${status}`);
  });

  test("unstageAll moves every staged file back to the working tree", async () => {
    fs.writeFileSync(path.join(cwd, "unstage-a.txt"), "a\n");
    fs.writeFileSync(path.join(cwd, "unstage-b.txt"), "b\n");
    await runGitCommand(cwd, { kind: "stage", path: "unstage-a.txt" });
    await runGitCommand(cwd, { kind: "stage", path: "unstage-b.txt" });
    let staged = await git(cwd, ["diff", "--cached", "--name-only"]);
    assert.strictEqual(staged, "unstage-a.txt\nunstage-b.txt");

    await runGitCommand(cwd, { kind: "unstageAll" });
    staged = await git(cwd, ["diff", "--cached", "--name-only"]);
    assert.strictEqual(staged, "", "nothing should remain staged after unstageAll");
    const status = await git(cwd, ["status", "--porcelain"]);
    assert.match(status, /\?\? unstage-a\.txt/);
    assert.match(status, /\?\? unstage-b\.txt/);

    // clean up so later tests in this shared-repo suite (e.g. stageAll + commit) see the exact
    // file set they expect, not these two leftover untracked files.
    fs.unlinkSync(path.join(cwd, "unstage-a.txt"));
    fs.unlinkSync(path.join(cwd, "unstage-b.txt"));
  });

  test("discard an untracked file removes it from disk", async () => {
    const filePath = path.join(cwd, "write-test.txt");
    assert.ok(fs.existsSync(filePath), "precondition: file should exist before discard");
    await runGitCommand(cwd, { kind: "discard", path: "write-test.txt", wasUntracked: true });
    assert.ok(!fs.existsSync(filePath), "file should be gone after discarding an untracked file");
  });

  test("stageAll + commit creates a real commit", async () => {
    fs.writeFileSync(path.join(cwd, "committed.txt"), "content\n");
    await runGitCommand(cwd, { kind: "stageAll" });
    const staged = await git(cwd, ["diff", "--cached", "--name-only"]);
    assert.strictEqual(staged, "committed.txt");

    await runGitCommand(cwd, { kind: "commit", message: "test: add committed.txt", amend: false });
    const lastSubject = await git(cwd, ["log", "-1", "--format=%s"]);
    assert.strictEqual(lastSubject, "test: add committed.txt");
    const clean = await git(cwd, ["status", "--porcelain"]);
    assert.strictEqual(clean, "", "working tree should be clean right after commit");
  });

  test("amend changes the last commit's message without adding a new one", async () => {
    const countBefore = await git(cwd, ["rev-list", "--count", "HEAD"]);
    await runGitCommand(cwd, { kind: "commit", message: "test: amended message", amend: true });
    const countAfter = await git(cwd, ["rev-list", "--count", "HEAD"]);
    assert.strictEqual(countAfter, countBefore, "amend must not add a new commit");
    const subject = await git(cwd, ["log", "-1", "--format=%s"]);
    assert.strictEqual(subject, "test: amended message");
  });

  test("createBranch creates and switches, deleteBranch removes it", async () => {
    await runGitCommand(cwd, { kind: "createBranch", name: "test/write-branch" });
    const current = await git(cwd, ["branch", "--show-current"]);
    assert.strictEqual(current, "test/write-branch");

    await runGitCommand(cwd, { kind: "checkoutBranch", name: "main" });
    assert.strictEqual(await git(cwd, ["branch", "--show-current"]), "main");

    await runGitCommand(cwd, { kind: "deleteBranch", name: "test/write-branch", force: true });
    const branches = await git(cwd, ["branch", "--format=%(refname:short)"]);
    assert.ok(!branches.split("\n").includes("test/write-branch"), "branch should be deleted");
  });

  test("createTag and deleteTag", async () => {
    const head = await git(cwd, ["rev-parse", "HEAD"]);
    await runGitCommand(cwd, { kind: "createTag", name: "v-write-test", hash: head });
    assert.ok((await git(cwd, ["tag"])).split("\n").includes("v-write-test"));

    await runGitCommand(cwd, { kind: "deleteTag", name: "v-write-test" });
    assert.ok(!(await git(cwd, ["tag"])).split("\n").includes("v-write-test"));
  });

  test("stashPush / stashPop round-trips real uncommitted changes", async () => {
    fs.appendFileSync(path.join(cwd, "README.md"), "stash me\n");
    const beforeStash = await git(cwd, ["status", "--porcelain"]);
    assert.notStrictEqual(beforeStash, "", "precondition: there should be a dirty file");

    await runGitCommand(cwd, { kind: "stashPush", message: "test stash" });
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), "", "working tree should be clean after stash push");
    assert.ok((await git(cwd, ["stash", "list"])).includes("test stash"));

    await runGitCommand(cwd, { kind: "stashPop", index: 0 });
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), beforeStash, "stash pop should restore the exact dirty state");
    assert.strictEqual(await git(cwd, ["stash", "list"]), "", "stash list should be empty after pop");

    // clean up so later runs of this file (or other suites) start from a known state
    await git(cwd, ["checkout", "--", "README.md"]);
  });

  test("stashPush includes untracked files (plain `git stash` would refuse them)", async () => {
    fs.writeFileSync(path.join(cwd, "only-untracked.txt"), "not yet tracked\n");
    await runGitCommand(cwd, { kind: "stashPush", message: "untracked-only stash" });
    assert.ok(!fs.existsSync(path.join(cwd, "only-untracked.txt")), "the untracked file should be stashed away");
    assert.ok((await git(cwd, ["stash", "list"])).includes("untracked-only stash"));

    await runGitCommand(cwd, { kind: "stashPop", index: 0 });
    const status = await git(cwd, ["status", "--porcelain"]);
    assert.match(status, /^\?\? only-untracked\.txt$/m, `expected the file back as untracked, got:\n${status}`);
    fs.unlinkSync(path.join(cwd, "only-untracked.txt"));
  });

  test("cloneRepository clones for real and rejects flag-like or garbage URLs", async () => {
    // clone the suite's own repo locally — same code path as a network URL, no network needed
    const parent = mkdtempSync(path.join(tmpdir(), "gitcanvas-clone-test-"));
    const { output, dest } = await cloneRepository(cwd, parent);
    assert.ok(fs.existsSync(path.join(dest, ".git")), "clone destination should be a real git repo");
    assert.ok(output.length > 0, "git clone's own output should be surfaced");
    const clonedLog = await git(dest, ["log", "-1", "--format=%s"]);
    assert.ok(clonedLog.length > 0, "cloned repo should have the source's history");

    await assert.rejects(cloneRepository("--upload-pack=touch /tmp/pwned", parent), /valid repository URL/);
    await assert.rejects(cloneRepository("", parent), /valid repository URL/);
    await assert.rejects(cloneRepository(cwd, parent), /already exists/, "same URL again → same dir name → refuses");

    assert.strictEqual(cloneTargetDirName("https://github.com/user/repo.git"), "repo");
    assert.strictEqual(cloneTargetDirName("git@github.com:user/my-app.git"), "my-app");
  });

  test("unstage works before the first commit, when HEAD doesn't exist yet", async () => {
    // A brand-new repo has no HEAD for `restore --staged` to restore from — the exact situation
    // every beginner is in while staging their very first commit.
    const freshCwd = mkdtempSync(path.join(tmpdir(), "gitcanvas-empty-unstage-"));
    await git(freshCwd, ["init", "-q", "-b", "main"]);
    fs.writeFileSync(path.join(freshCwd, "first.txt"), "one\n");
    fs.writeFileSync(path.join(freshCwd, "second.txt"), "two\n");
    await runGitCommand(freshCwd, { kind: "stageAll" });

    await runGitCommand(freshCwd, { kind: "unstage", path: "first.txt" });
    let status = await git(freshCwd, ["status", "--porcelain"]);
    assert.match(status, /^\?\? first\.txt$/m, `expected first.txt untracked again, got:\n${status}`);
    assert.match(status, /^A  second\.txt$/m, "second.txt should still be staged");

    await runGitCommand(freshCwd, { kind: "unstageAll" });
    status = await git(freshCwd, ["status", "--porcelain"]);
    assert.match(status, /^\?\? first\.txt$/m);
    assert.match(status, /^\?\? second\.txt$/m, `expected everything untracked, got:\n${status}`);
  });

  test("empty commit message is rejected without touching the repo", async () => {
    const countBefore = await git(cwd, ["rev-list", "--count", "HEAD"]);
    await assert.rejects(runGitCommand(cwd, { kind: "commit", message: "   ", amend: false }));
    const countAfter = await git(cwd, ["rev-list", "--count", "HEAD"]);
    assert.strictEqual(countAfter, countBefore);
  });

  test("clean removes untracked files from disk", async () => {
    fs.writeFileSync(path.join(cwd, "untracked-a.txt"), "a\n");
    fs.writeFileSync(path.join(cwd, "untracked-b.txt"), "b\n");
    await runGitCommand(cwd, { kind: "clean" });
    assert.ok(!fs.existsSync(path.join(cwd, "untracked-a.txt")));
    assert.ok(!fs.existsSync(path.join(cwd, "untracked-b.txt")));
  });

  test("addRemote and removeRemote manage real remotes", async () => {
    await runGitCommand(cwd, { kind: "addRemote", name: "upstream", url: "https://example.invalid/repo.git" });
    let remotes = await git(cwd, ["remote", "-v"]);
    assert.match(remotes, /^upstream\s+https:\/\/example\.invalid\/repo\.git/m);

    await runGitCommand(cwd, { kind: "removeRemote", name: "upstream" });
    remotes = await git(cwd, ["remote", "-v"]);
    assert.ok(!remotes.includes("upstream"));
  });

  test("setConfig writes real global git config, scoped to a throwaway config file", async () => {
    // GIT_CONFIG_GLOBAL (git >= 2.32) redirects every `--global` read/write to this file
    // instead of the real ~/.gitconfig — without it, this test would silently overwrite the
    // machine's actual global user.name.
    const fakeGlobalConfig = path.join(mkdtempSync(path.join(tmpdir(), "gitcanvas-fake-config-")), "gitconfig");
    const original = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = fakeGlobalConfig;
    try {
      await runGitCommand(cwd, { kind: "setConfig", key: "user.name", value: "Config Test User" });
      const value = await git(cwd, ["config", "--global", "user.name"]);
      assert.strictEqual(value, "Config Test User");
    } finally {
      if (original === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = original;
    }
  });
});
