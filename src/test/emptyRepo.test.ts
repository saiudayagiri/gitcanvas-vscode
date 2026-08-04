import * as assert from "assert";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtempSync } from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { buildSnapshot } from "../buildSnapshot";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

// git's commit timestamps only resolve to the second — hundreds of commits created in a tight
// loop can easily land in the same second, which makes `--date-order`'s tie-breaking order
// effectively arbitrary rather than reflecting real creation order. Pinning an explicit,
// strictly increasing date per commit keeps recency-window tests deterministic.
async function commitAt(cwd: string, epochSeconds: number, message: string): Promise<string> {
  const date = `${epochSeconds} +0000`;
  const { stdout } = await execFileAsync("git", ["commit", "--allow-empty", "-q", "-m", message], {
    cwd,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return stdout.trim();
}

// A repo the user just ran `git init` on and hasn't committed to yet — no branches exist
// (`for-each-ref` has nothing to list before the first commit), and `git log` fails outright
// since HEAD doesn't resolve. This is the exact real-world state that used to crash the
// webview: mainBranch()'s `branches[0]` fallback returned undefined, and pages that did
// getCommit(mainBranch().headHash)! threw on render.
suite("buildSnapshot() against a genuinely empty repository", () => {
  test("returns empty commits/branches instead of throwing", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "gitcanvas-empty-repo-test-"));
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "test@example.com"]);
    await git(cwd, ["config", "user.name", "Test User"]);

    const snapshot = await buildSnapshot(cwd);

    assert.deepStrictEqual(snapshot.commits, []);
    assert.deepStrictEqual(snapshot.branches, []);
    assert.deepStrictEqual(snapshot.workingFiles, []);
  });
});

// getLog() only returns the most recent 300 commits repo-wide. A branch that hasn't been
// touched in a while can easily have a head commit older than that — this reproduces exactly
// that (a "stale-branch" forked a few commits in, then 305 more commits land on main), which
// used to crash the whole webview the moment the Branches page rendered: every branch's
// headHash is handed straight to the UI, and getCommit(branch.headHash)! threw on a hash the
// snapshot's commit list didn't contain.
suite("buildSnapshot() with a branch head older than the commit-log recency window", () => {
  test("backfills the out-of-window head's ancestry too, so it reconnects instead of floating disconnected", async function () {
    this.timeout(30_000);
    const cwd = mkdtempSync(path.join(tmpdir(), "gitcanvas-backfill-test-"));
    await git(cwd, ["init", "-q", "-b", "main"]);
    await git(cwd, ["config", "user.email", "test@example.com"]);
    await git(cwd, ["config", "user.name", "Test User"]);
    // 2000-01-01T00:00:00Z as a base — every filler afterward gets a later timestamp than every
    // stale-branch commit, so the recency window has an unambiguous, deterministic cutoff.
    const base = 946_684_800;
    await commitAt(cwd, base, "root");
    await commitAt(cwd, base + 1, "c1");
    await commitAt(cwd, base + 2, "fork-point");
    await git(cwd, ["branch", "stale-branch"]);
    await git(cwd, ["checkout", "-q", "stale-branch"]);
    await commitAt(cwd, base + 3, "stale-1");
    await commitAt(cwd, base + 4, "stale-2");
    await commitAt(cwd, base + 5, "stale-head");
    await git(cwd, ["checkout", "-q", "main"]);

    for (let i = 0; i < 305; i++) {
      await commitAt(cwd, base + 1000 + i, `filler ${i}`);
    }

    const snapshot = await buildSnapshot(cwd);
    const byHash = new Map(snapshot.commits.map((c) => [c.hash, c]));

    const staleBranch = snapshot.branches.find((b) => b.name === "stale-branch");
    assert.ok(staleBranch, "stale-branch should still be listed");
    const staleHead = byHash.get(staleBranch!.headHash);
    assert.ok(staleHead, "stale-branch's head commit must be resolvable in the snapshot");
    assert.strictEqual(staleHead!.subject, "stale-head");

    // Walk the stale branch's own ancestry — every parent along the way must also resolve, all
    // the way back to the true root. Backfilling only the lone head commit (the original,
    // narrower fix) would leave stale-2/stale-1/fork-point/c1/root all unresolvable, which is
    // exactly what rendered as a disconnected floating dot with no edges in the commit graph.
    let current = staleHead;
    const seenSubjects: string[] = [];
    while (current) {
      seenSubjects.push(current.subject);
      if (current.parents.length === 0) break;
      const parent: typeof current | undefined = byHash.get(current.parents[0]);
      assert.ok(parent, `parent of "${current.subject}" (${current.parents[0]}) must be resolvable in the snapshot`);
      current = parent!;
    }
    assert.deepStrictEqual(seenSubjects, ["stale-head", "stale-2", "stale-1", "fork-point", "c1", "root"]);
  });
});
