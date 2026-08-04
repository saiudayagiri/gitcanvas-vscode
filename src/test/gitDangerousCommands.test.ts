import * as assert from "assert";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { GitConflictError, runGitCommand } from "../gitWriteCommands";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

function initRepo(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), "gitcanvas-dangerous-test-"));
  return cwd;
}

// reset / revert / cherry-pick / merge / rebase — the operations that can move HEAD
// destructively or leave a repo mid-conflict. Each gets its own throwaway repo, isolated
// from every other suite.
suite("Git reset/revert/cherry-pick/merge/rebase against a real repo", () => {
  test("reset --soft moves HEAD but keeps changes staged", async () => {
    const cwd = initRepo();
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "one\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "c1"]);
    const c1 = await git(cwd, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "two\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "c2"]);

    await runGitCommand(cwd, { kind: "reset", hash: c1, mode: "soft" });
    assert.strictEqual(await git(cwd, ["rev-parse", "HEAD"]), c1);
    assert.strictEqual(await git(cwd, ["diff", "--cached", "--name-only"]), "a.txt");
  });

  test("reset --hard discards uncommitted changes and matches the target exactly", async () => {
    const cwd = initRepo();
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "one\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "c1"]);
    const c1 = await git(cwd, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "uncommitted mess\n");

    await runGitCommand(cwd, { kind: "reset", hash: c1, mode: "hard" });
    assert.strictEqual(fs.readFileSync(path.join(cwd, "a.txt"), "utf-8"), "one\n");
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), "");
  });

  test("revert (clean) creates a real inverse commit", async () => {
    const cwd = initRepo();
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "base\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "base"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "base\nadded\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "add a line"]);
    const toRevert = await git(cwd, ["rev-parse", "HEAD"]);

    await runGitCommand(cwd, { kind: "revert", hash: toRevert });
    assert.strictEqual(fs.readFileSync(path.join(cwd, "a.txt"), "utf-8"), "base\n");
    assert.strictEqual(await git(cwd, ["log", "-1", "--format=%s"]), `Revert "add a line"`);
  });

  // Sets up two branches with a genuine, real content conflict on shared.txt and returns
  // both branches' pre-merge HEADs so callers can assert against them.
  async function setUpConflictingBranches(cwd: string, featureBranch = "feature") {
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "base"]);

    await git(cwd, ["checkout", "-q", "-b", featureBranch]);
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\nfeature-change\n");
    await git(cwd, ["commit", "-qam", "feature change"]);
    const featureHead = await git(cwd, ["rev-parse", "HEAD"]);

    await git(cwd, ["checkout", "-q", "main"]);
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\nmain-change\n");
    await git(cwd, ["commit", "-qam", "main change"]);
    const mainHeadBefore = await git(cwd, ["rev-parse", "HEAD"]);

    return { featureHead, mainHeadBefore };
  }

  test("a real merge conflict throws GitConflictError and leaves the conflict open for real resolution", async () => {
    const cwd = initRepo();
    await setUpConflictingBranches(cwd);

    await assert.rejects(
      runGitCommand(cwd, { kind: "merge", branchName: "feature" }),
      (err: unknown) => err instanceof GitConflictError && err.op === "merge"
    );

    // the whole point: this is a real, still-open conflict, not silently thrown away
    assert.ok(fs.existsSync(path.join(cwd, ".git", "MERGE_HEAD")), "merge should still be in progress");
    assert.match(await git(cwd, ["status", "--porcelain"]), /^UU shared\.txt$/m);
  });

  test("resolveConflictFile('theirs') + continueConflictOp completes a real merge", async () => {
    const cwd = initRepo();
    await setUpConflictingBranches(cwd);
    await assert.rejects(runGitCommand(cwd, { kind: "merge", branchName: "feature" }));

    await runGitCommand(cwd, { kind: "resolveConflictFile", path: "shared.txt", resolution: "theirs" });
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), "M  shared.txt", "should be staged, not still unmerged");

    await runGitCommand(cwd, { kind: "continueConflictOp", op: "merge" });
    assert.ok(!fs.existsSync(path.join(cwd, ".git", "MERGE_HEAD")), "merge should be finished");
    assert.strictEqual(fs.readFileSync(path.join(cwd, "shared.txt"), "utf-8"), "base\nfeature-change\n");
    const parents = await git(cwd, ["log", "-1", "--format=%P"]);
    assert.strictEqual(parents.split(" ").length, 2, "should be a real merge commit with two parents");
  });

  test("resolveConflictFile('both') writes ours and theirs concatenated to the real file", async () => {
    const cwd = initRepo();
    await setUpConflictingBranches(cwd);
    await assert.rejects(runGitCommand(cwd, { kind: "merge", branchName: "feature" }));

    await runGitCommand(cwd, { kind: "resolveConflictFile", path: "shared.txt", resolution: "both" });
    assert.strictEqual(fs.readFileSync(path.join(cwd, "shared.txt"), "utf-8"), "base\nmain-change\nbase\nfeature-change\n");
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), "M  shared.txt");
  });

  test("abortConflictOp aborts a real merge conflict and restores the pre-merge state", async () => {
    const cwd = initRepo();
    const { mainHeadBefore } = await setUpConflictingBranches(cwd);
    await assert.rejects(runGitCommand(cwd, { kind: "merge", branchName: "feature" }));

    await runGitCommand(cwd, { kind: "abortConflictOp", op: "merge" });
    assert.strictEqual(await git(cwd, ["rev-parse", "HEAD"]), mainHeadBefore, "HEAD should not have moved");
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), "", "working tree should be clean after abort");
    assert.ok(!fs.existsSync(path.join(cwd, ".git", "MERGE_HEAD")), "no merge should be left in progress");
  });

  test("a clean merge (no conflict) applies for real", async () => {
    const cwd = initRepo();
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "a\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "base"]);

    await git(cwd, ["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(cwd, "b.txt"), "b\n"); // a different file — no overlap
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "add b.txt"]);
    await git(cwd, ["checkout", "-q", "main"]);

    await runGitCommand(cwd, { kind: "merge", branchName: "feature" });
    assert.ok(fs.existsSync(path.join(cwd, "b.txt")), "merge should have brought in b.txt");
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), "");
  });

  test("a real rebase conflict auto-aborts and leaves the repo clean", async () => {
    const cwd = initRepo();
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "base"]);

    await git(cwd, ["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\nfeature-change\n");
    await git(cwd, ["commit", "-qam", "feature change"]);
    const featureHeadBefore = await git(cwd, ["rev-parse", "HEAD"]);

    await git(cwd, ["checkout", "-q", "main"]);
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\nmain-change\n");
    await git(cwd, ["commit", "-qam", "main change"]);

    await git(cwd, ["checkout", "-q", "feature"]);
    await assert.rejects(runGitCommand(cwd, { kind: "rebase", branchName: "main" }), /CONFLICT|automatically aborted/i);

    assert.strictEqual(await git(cwd, ["rev-parse", "HEAD"]), featureHeadBefore, "feature's HEAD should be unchanged");
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), "");
    assert.ok(!fs.existsSync(path.join(cwd, ".git", "rebase-merge")) && !fs.existsSync(path.join(cwd, ".git", "rebase-apply")), "no rebase should be left in progress");
  });

  test("a real cherry-pick conflict throws GitConflictError and leaves CHERRY_PICK_HEAD in progress", async () => {
    const cwd = initRepo();
    const { featureHead } = await setUpConflictingBranches(cwd);

    await assert.rejects(
      runGitCommand(cwd, { kind: "cherryPick", hash: featureHead }),
      (err: unknown) => err instanceof GitConflictError && err.op === "cherryPick"
    );

    assert.ok(fs.existsSync(path.join(cwd, ".git", "CHERRY_PICK_HEAD")));
    assert.match(await git(cwd, ["status", "--porcelain"]), /^UU shared\.txt$/m);
  });

  test("resolveConflictFile('theirs') + continueConflictOp completes a real cherry-pick", async () => {
    const cwd = initRepo();
    const { featureHead, mainHeadBefore } = await setUpConflictingBranches(cwd);
    await assert.rejects(runGitCommand(cwd, { kind: "cherryPick", hash: featureHead }));

    // "theirs" here is the cherry-picked commit's own content — picking it produces a real,
    // non-empty change relative to main's parent tree (picking "ours" would reproduce main's
    // existing content exactly and git would refuse an empty cherry-pick commit).
    await runGitCommand(cwd, { kind: "resolveConflictFile", path: "shared.txt", resolution: "theirs" });
    await runGitCommand(cwd, { kind: "continueConflictOp", op: "cherryPick" });

    assert.ok(!fs.existsSync(path.join(cwd, ".git", "CHERRY_PICK_HEAD")), "cherry-pick should be finished");
    assert.strictEqual(fs.readFileSync(path.join(cwd, "shared.txt"), "utf-8"), "base\nfeature-change\n");
    const newHead = await git(cwd, ["rev-parse", "HEAD"]);
    assert.notStrictEqual(newHead, mainHeadBefore, "a new commit should have been created");
    assert.strictEqual(await git(cwd, ["log", "-1", "--format=%P"]), mainHeadBefore, "should be a normal single-parent commit on top of main");
  });

  test("abortConflictOp aborts a real cherry-pick conflict and restores the pre-pick state", async () => {
    const cwd = initRepo();
    const { featureHead, mainHeadBefore } = await setUpConflictingBranches(cwd);
    await assert.rejects(runGitCommand(cwd, { kind: "cherryPick", hash: featureHead }));

    await runGitCommand(cwd, { kind: "abortConflictOp", op: "cherryPick" });
    assert.strictEqual(await git(cwd, ["rev-parse", "HEAD"]), mainHeadBefore);
    assert.strictEqual(await git(cwd, ["status", "--porcelain"]), "");
    assert.ok(!fs.existsSync(path.join(cwd, ".git", "CHERRY_PICK_HEAD")));
  });

  test("a real revert conflict resolves and continues for real", async () => {
    const cwd = initRepo();
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "base"]);
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\nadded-by-commit-to-revert\n");
    await git(cwd, ["commit", "-qam", "add a line"]);
    const toRevert = await git(cwd, ["rev-parse", "HEAD"]);
    // a later, unrelated-looking edit to the same line the revert needs to touch — real conflict
    fs.writeFileSync(path.join(cwd, "shared.txt"), "base\nadded-by-commit-to-revert\nand-then-this\n");
    await git(cwd, ["commit", "-qam", "edit on top"]);

    await assert.rejects(
      runGitCommand(cwd, { kind: "revert", hash: toRevert }),
      (err: unknown) => err instanceof GitConflictError && err.op === "revert"
    );
    assert.ok(fs.existsSync(path.join(cwd, ".git", "REVERT_HEAD")));

    await runGitCommand(cwd, { kind: "resolveConflictFile", path: "shared.txt", resolution: "manual", content: "base\nand-then-this\n" });
    await runGitCommand(cwd, { kind: "continueConflictOp", op: "revert" });

    assert.ok(!fs.existsSync(path.join(cwd, ".git", "REVERT_HEAD")));
    assert.strictEqual(fs.readFileSync(path.join(cwd, "shared.txt"), "utf-8"), "base\nand-then-this\n");
  });

  test("pushForce with no upstream publishes the branch (push --force -u)", async () => {
    const bare = initRepo();
    await git(bare, ["init", "-q", "--bare"]);

    const cwd = initRepo();
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    await git(cwd, ["remote", "add", "origin", bare]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "one\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "c1"]);

    await assert.rejects(git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]));
    await runGitCommand(cwd, { kind: "pushForce" });
    assert.strictEqual(await git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]), "origin/main");
    assert.strictEqual(await git(bare, ["rev-parse", "main"]), await git(cwd, ["rev-parse", "HEAD"]));
  });

  test("pushForce (--force-with-lease) refuses a stale view of the remote, then succeeds after fetching", async () => {
    const bare = initRepo();
    await git(bare, ["init", "-q", "--bare"]);

    const cwd = initRepo();
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "t@example.com"]);
    await git(cwd, ["config", "user.name", "T"]);
    await git(cwd, ["remote", "add", "origin", bare]);
    fs.writeFileSync(path.join(cwd, "a.txt"), "base\n");
    await git(cwd, ["add", "."]);
    await git(cwd, ["commit", "-q", "-m", "base"]);
    await git(cwd, ["push", "-q", "-u", "origin", "main"]);

    // a second clone pushes a commit our first clone hasn't fetched — origin has moved
    const otherClone = initRepo();
    await git(otherClone, ["clone", "-q", bare, "."]);
    await git(otherClone, ["config", "user.email", "other@example.com"]);
    await git(otherClone, ["config", "user.name", "Other"]);
    fs.writeFileSync(path.join(otherClone, "b.txt"), "from-other\n");
    await git(otherClone, ["add", "."]);
    await git(otherClone, ["commit", "-q", "-m", "other's commit"]);
    await git(otherClone, ["push", "-q"]);
    const otherHead = await git(otherClone, ["rev-parse", "HEAD"]);

    // our clone, unaware, rewrites its own history — a real force-push scenario
    await git(cwd, ["commit", "-q", "--amend", "-m", "base (rewritten)"]);

    await assert.rejects(runGitCommand(cwd, { kind: "pushForce" }), /stale info|rejected/i);
    assert.strictEqual(await git(bare, ["rev-parse", "main"]), otherHead, "the refused push must not have touched the remote");

    await git(cwd, ["fetch", "-q", "origin"]);
    await runGitCommand(cwd, { kind: "pushForce" });
    assert.strictEqual(await git(bare, ["rev-parse", "main"]), await git(cwd, ["rev-parse", "HEAD"]), "after fetching, the lease matches and the force-push succeeds");
  });
});
