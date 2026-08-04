import * as assert from "assert";
import { assignLanes } from "../laneAssignment";
import type { RawCommit } from "../gitService";

function commit(hash: string, parents: string[]): RawCommit {
  return {
    hash,
    parents,
    authorName: "Test",
    authorEmail: "test@example.com",
    committerName: "Test",
    committerEmail: "test@example.com",
    authoredAt: "2026-01-01T00:00:00Z",
    committedAt: "2026-01-01T00:00:00Z",
    subject: hash,
    body: "",
    refs: [],
    signStatus: "N",
    files: [],
  };
}

// Graph (newest first, as assignLanes requires):
//
//   c5 (main tip)
//   f2 (feature tip)
//   f1
//   c4
//   c3  <- fork point: main and feature both converge here
//   d1  <- a short-lived, unrelated branch forking off c2, well below feature
//   c2
//   c1 (root)
//
// feature forks from c3 and never merges back (still open). d1 forks from c2 — deeper in
// history, after feature's own lane has already been freed at the c3 convergence. If lanes are
// freed and reused correctly, d1 should land in the exact lane feature just vacated, not a
// brand-new one — proving space gets reused across non-overlapping time ranges instead of
// staying permanently reserved for whichever branch happened to claim it first.
suite("assignLanes() frees and reuses lanes at convergence points", () => {
  test("an unrelated branch further back in history reuses a lane an earlier branch already vacated", () => {
    const commits: RawCommit[] = [
      commit("c5", ["c4"]),
      commit("f2", ["f1"]),
      commit("f1", ["c3"]),
      commit("c4", ["c3"]),
      commit("c3", ["d1-parent-placeholder"]), // placeholder overwritten below to keep order readable
      commit("d1", ["c2"]),
      commit("c2", ["c1"]),
      commit("c1", []),
    ];
    // c3's real parent is c2 — fixed up here so the literal array above stays easy to read top-to-bottom.
    commits[4] = commit("c3", ["c2"]);

    const laneOf = assignLanes(commits);

    assert.strictEqual(laneOf.get("f2"), laneOf.get("f1"), "feature's own two commits should share one lane");
    assert.notStrictEqual(laneOf.get("f2"), laneOf.get("c5"), "feature's lane must differ from main's");

    const featureLane = laneOf.get("f2");
    assert.strictEqual(laneOf.get("d1"), featureLane, "d1 should reuse the lane feature vacated at the c3 convergence, not allocate a new one");

    // main's trunk — its own tip plus all shared ancestry back to root — stays on one lane throughout.
    const mainLane = laneOf.get("c5");
    assert.strictEqual(laneOf.get("c4"), mainLane);
    assert.strictEqual(laneOf.get("c3"), mainLane);
    assert.strictEqual(laneOf.get("c2"), mainLane);
    assert.strictEqual(laneOf.get("c1"), mainLane);
  });
});
