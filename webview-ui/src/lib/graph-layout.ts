import type { Branch, Commit, GitColorRole } from "@/types/git";
import { commits, branches as mockBranches } from "./mock-data";

export const ROW_HEIGHT = 64;
export const LANE_WIDTH = 52;
export const PADDING_X = 40;
export const PADDING_Y = 32;

export interface GraphNode {
  commit: Commit;
  x: number;
  y: number;
  row: number;
}

export interface GraphEdge {
  id: string;
  from: GraphNode;
  to: GraphNode;
  path: string;
  lane: number;
  laneColorVar: string;
  isMergeEdge: boolean;
}

export interface LaneInfo {
  lane: number;
  branchName: string;
  color: GitColorRole;
  x: number;
  topRow: number;
  bottomRow: number; // row where this branch's own lane actually ends (converges into another
  // branch's already-claimed history, or the loaded window runs out) — guide lines stop here
  // instead of at the bottom of the whole graph.
  stackIndex: number; // >0 when another branch shares the exact same tip commit
}

const DEFAULT_ROLE: GitColorRole = "history";

export function colorVar(role: GitColorRole): string {
  return `var(--color-git-${role})`;
}

/**
 * `headOverrides` maps a branch name to a commit hash that isn't its mock-data head —
 * used so a simulated `git reset` moves that branch's tip label/HEAD marker in the graph.
 * `branchList` defaults to the static mock branches, but callers pass the live list
 * (mock + session-created, minus deleted) so new/removed branches show up too.
 */
export function buildGraph(
  headOverrides?: Record<string, string>,
  branchList: Branch[] = mockBranches,
  extraCommits: Commit[] = []
) {
  const sorted = [...commits, ...extraCommits].sort((a, b) => +new Date(b.committedAt) - +new Date(a.committedAt));

  // Real lane numbers can have gaps — once a lane is allocated it keeps its index for the rest
  // of its chain even after neighboring lanes free up and get reused at lower indices. That's
  // invisible in git's own text graph but very visible here as wildly uneven spacing between
  // rendered lines. Compact *positions* down to only the lane numbers actually in play, while
  // every commit/edge/branch keeps its original `lane` value for color and identity lookups.
  const usedLanes = [...new Set(sorted.map((c) => c.lane))].sort((a, b) => a - b);
  const laneRank = new Map(usedLanes.map((lane, i) => [lane, i]));
  const xForLane = (lane: number) => PADDING_X + (laneRank.get(lane) ?? lane) * LANE_WIDTH;

  const nodesByHash = new Map<string, GraphNode>();

  sorted.forEach((commit, row) => {
    const x = xForLane(commit.lane);
    const y = PADDING_Y + row * ROW_HEIGHT;
    nodesByHash.set(commit.hash, { commit, x, y, row });
  });

  // A lane number gets reused by unrelated branches at different points in history (see
  // laneAssignment.ts), so it can no longer double as a color key — the same lane could be a
  // recent feature branch near the top and a totally different old branch further down. Color
  // instead follows branch *identity*: each branch's own color (already computed per-branch in
  // the snapshot) applies to its own unique commits, walking its first-parent chain down until
  // ownership shifts to a different, already-claimed lane. Shared trunk history below every
  // fork point isn't uniquely owned by any feature branch, so it falls back to the default.
  const commitColor = new Map<string, GitColorRole>();

  const stackCounters = new Map<string, number>();
  const lanes: LaneInfo[] = branchList
    .map((b) => {
      const headHash = headOverrides?.[b.name] ?? b.headHash;
      const headCommit = nodesByHash.get(headHash);
      if (!headCommit) return null;
      const lane = headCommit.commit.lane;

      let bottomRow = headCommit.row;
      let current: GraphNode | undefined = headCommit;
      while (current) {
        if (!commitColor.has(current.commit.hash)) commitColor.set(current.commit.hash, b.color);
        bottomRow = current.row;
        const parentHash: string | undefined = current.commit.parents[0];
        const parentNode: GraphNode | undefined = parentHash ? nodesByHash.get(parentHash) : undefined;
        if (!parentNode || parentNode.commit.lane !== lane) break;
        current = parentNode;
      }

      const key = `${lane}-${headCommit.row}`;
      const stackIndex = stackCounters.get(key) ?? 0;
      stackCounters.set(key, stackIndex + 1);
      return {
        lane,
        branchName: b.name,
        color: b.color,
        x: xForLane(lane),
        topRow: headCommit.row,
        bottomRow,
        stackIndex,
      };
    })
    .filter((l): l is LaneInfo => l !== null)
    .sort((a, b) => a.lane - b.lane);

  // How far right the commit-info column needs to start *at this specific row* — not the
  // widest point anywhere in the whole graph. A branch's lane only actually occupies horizontal
  // space between its own topRow and bottomRow (exactly the span its dashed guide line covers);
  // pinning every row's info card to the all-time-widest point (e.g. a brief 100-branch spike)
  // would leave the info column stranded far to the right for the rest of history, where only a
  // handful of lanes are ever active. Bounded by lanes.length per row, not commits, so this
  // stays cheap even for a long graph.
  const rowLocalMaxX = new Array<number>(sorted.length).fill(PADDING_X);
  for (const lane of lanes) {
    const from = Math.max(0, Math.min(lane.topRow, lane.bottomRow));
    const to = Math.min(sorted.length - 1, Math.max(lane.topRow, lane.bottomRow));
    for (let row = from; row <= to; row++) {
      if (lane.x > rowLocalMaxX[row]) rowLocalMaxX[row] = lane.x;
    }
  }

  const edges: GraphEdge[] = [];
  for (const node of nodesByHash.values()) {
    node.commit.parents.forEach((parentHash, i) => {
      const parentNode = nodesByHash.get(parentHash);
      if (!parentNode) return;
      const sameLane = parentNode.x === node.x;
      const path = sameLane
        ? `M ${node.x} ${node.y} L ${parentNode.x} ${parentNode.y}`
        : buildCurve(node.x, node.y, parentNode.x, parentNode.y);
      const lane = i === 0 ? node.commit.lane : parentNode.commit.lane;
      const colorHash = i === 0 ? node.commit.hash : parentNode.commit.hash;
      edges.push({
        id: `${node.commit.hash}-${parentHash}`,
        from: node,
        to: parentNode,
        path,
        lane,
        laneColorVar: colorVar(commitColor.get(colorHash) ?? DEFAULT_ROLE),
        isMergeEdge: node.commit.isMerge,
      });
    });
  }

  const width = PADDING_X * 2 + Math.max(0, usedLanes.length - 1) * LANE_WIDTH + LANE_WIDTH;
  const height = PADDING_Y * 2 + sorted.length * ROW_HEIGHT;

  return { nodes: [...nodesByHash.values()], edges, lanes, commitColor, rowLocalMaxX, width, height, sorted };
}

function buildCurve(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}
