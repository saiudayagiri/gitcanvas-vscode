import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { GitMerge, ShieldCheck, GitCommitHorizontal, CloudOff } from "lucide-react";
import { buildGraph, ROW_HEIGHT, LANE_WIDTH } from "@/lib/graph-layout";
import { useUIStore } from "@/store/ui-store";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { timeAgo } from "@/lib/mock-data";
import { usePanZoom } from "./usePanZoom";
import { useHeadHash, useAllBranches } from "@/hooks/useCurrentBranch";
import { useAllTags } from "@/hooks/useTags";
import { useLocalGraphCommits } from "@/hooks/useLocalGraphCommits";

const ROLE_STROKE: Record<string, string> = {
  commit: "var(--color-git-commit)",
  branch: "var(--color-git-branch)",
  staged: "var(--color-git-staged)",
  history: "var(--color-git-history)",
  remote: "var(--color-git-remote)",
  conflict: "var(--color-git-conflict)",
};

const ROW_CONTENT_WIDTH = 620;

export function CommitGraphCanvas({
  highlightedBranch,
  searchQuery,
  panZoom,
}: {
  highlightedBranch: string | null;
  searchQuery: string;
  panZoom: ReturnType<typeof usePanZoom>;
}) {
  const [hoveredHash, setHoveredHash] = useState<string | null>(null);
  const [hoveredLane, setHoveredLane] = useState<number | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const inspectedHash = useUIStore((s) => s.inspectedCommitHash);
  const requestCheckoutCommit = useUIStore((s) => s.requestCheckoutCommit);
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const headOverride = useUIStore((s) => s.headOverride);
  const dagHeadHash = useHeadHash();
  const allBranches = useAllBranches();
  const allTags = useAllTags();
  const localCommits = useLocalGraphCommits();
  const localHashes = useMemo(() => new Set(localCommits.map((c) => c.hash)), [localCommits]);
  const topLocalHash = localCommits[localCommits.length - 1]?.hash;
  // the branch tip visually sits on the newest local commit once one exists, else wherever reset left it
  const effectiveHeadHash = topLocalHash ?? dagHeadHash;
  const headHashOverrideTarget = topLocalHash ?? headOverride;
  const tagsByHash = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of allTags) map.set(t.hash, [...(map.get(t.hash) ?? []), t.name]);
    return map;
  }, [allTags]);
  const graph = useMemo(
    () =>
      buildGraph(
        currentBranchName && headHashOverrideTarget ? { [currentBranchName]: headHashOverrideTarget } : undefined,
        allBranches,
        localCommits
      ),
    [currentBranchName, headHashOverrideTarget, allBranches, localCommits]
  );

  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (hash: string) => {
    if (!query) return true;
    const c = graph.nodes.find((n) => n.commit.hash === hash)?.commit;
    if (!c) return false;
    return (
      c.subject.toLowerCase().includes(query) ||
      c.author.name.toLowerCase().includes(query) ||
      c.shortHash.includes(query)
    );
  };

  // Selecting an edge (any line in the graph) is the most specific focus a user can ask for —
  // it takes priority over branch-highlight/search dimming rather than combining with them, so
  // clicking a line always gives an unambiguous "just this connection" view.
  const selectedEdge = selectedEdgeId ? (graph.edges.find((e) => e.id === selectedEdgeId) ?? null) : null;

  const isDimmed = (lane: number, hash: string) => {
    if (selectedEdge) {
      return hash !== selectedEdge.from.commit.hash && hash !== selectedEdge.to.commit.hash;
    }
    if (highlightedBranch) {
      const laneOwner = graph.lanes.find((l) => l.lane === lane);
      if (laneOwner?.branchName !== highlightedBranch) return true;
    }
    if (query && !matchesQuery(hash)) return true;
    return false;
  };

  // The line that should visually lead: whichever branch is explicitly picked in the branch
  // panel, or — with nothing picked — the branch you're actually on. Its edges render bolder
  // and fully bright so the branch you care about reads at a glance instead of blending into
  // the rest of the graph.
  const emphasizedBranch = highlightedBranch ?? currentBranchName;
  const isEmphasizedLane = (lane: number) => graph.lanes.find((l) => l.lane === lane)?.branchName === emphasizedBranch;

  const totalWidth = graph.width + ROW_CONTENT_WIDTH;

  const { transform, onPointerDown, onPointerMove, onPointerUp, onWheel, setBounds } = panZoom;

  // The initial pan offset (60, 24) is also the boundary: you can never drag further toward the
  // top-left than where the graph already starts out, so there's always a fixed reference edge
  // instead of the canvas sliding into blank space. The opposite edge only moves as far as the
  // content actually extends — once the graph is smaller than the viewport in a direction, that
  // direction is pinned too, rather than leaving room to scroll into nothing.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ANCHOR_X = 60;
    const ANCHOR_Y = 24;
    const recompute = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const scale = transform.scale;
      const contentW = totalWidth * scale;
      const contentH = graph.height * scale;
      setBounds({
        minX: Math.min(ANCHOR_X, cw - contentW),
        maxX: ANCHOR_X,
        minY: Math.min(ANCHOR_Y, ch - contentH),
        maxY: ANCHOR_Y,
      });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [totalWidth, graph.height, transform.scale, setBounds]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onClick={() => setSelectedEdgeId(null)}
    >
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
          width: totalWidth,
          height: graph.height,
        }}
      >
        <svg width={totalWidth} height={graph.height} className="select-none overflow-visible">
          {/* lane guide lines — stop at this branch's own bottom row (where its history
              converges into another branch's), not the bottom of the whole graph, so a
              short-lived branch doesn't visually reserve space it isn't actually using. */}
          {graph.lanes.map((lane) => (
            <line
              key={`${lane.lane}-${lane.branchName}`}
              x1={lane.x}
              y1={32 + lane.topRow * ROW_HEIGHT}
              x2={lane.x}
              y2={32 + lane.bottomRow * ROW_HEIGHT}
              stroke="var(--border-subtle)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))}

          {/* edges — each is individually clickable: picking one pins it bright and dims
              everything else, so tracing one line through a busy graph doesn't require
              following it by eye through a tangle of overlapping siblings. */}
          {graph.edges.map((edge) => {
            const dimmed = isDimmed(edge.from.commit.lane, edge.from.commit.hash) || isDimmed(edge.to.commit.lane, edge.to.commit.hash);
            const isSelected = edge.id === selectedEdgeId;
            const emphasized = !dimmed && (isEmphasizedLane(edge.lane) || isSelected);
            return (
              <g
                key={edge.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEdgeId((cur) => (cur === edge.id ? null : edge.id));
                }}
              >
                <path d={edge.path} fill="none" stroke="transparent" strokeWidth={16} />
                <motion.path
                  d={edge.path}
                  fill="none"
                  stroke={edge.laneColorVar}
                  strokeWidth={emphasized ? 4.5 : 3}
                  strokeLinecap="round"
                  style={emphasized ? { filter: `drop-shadow(0 0 4px ${edge.laneColorVar})` } : undefined}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: dimmed ? (selectedEdge ? 0.08 : 0.15) : 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </g>
            );
          })}

          {/* branch tip labels — centered directly above their own tip commit (not offset to
              one side, which read as "floating near the info column" rather than clearly
              belonging to the node below it). Branches sharing the exact same tip commit stack
              straight up from there via stackIndex, so it's still unambiguous which name goes
              with which lane even when several point at one commit. Subtle at rest (equidistant
              lanes pack labels closer together than the old uneven spacing did, so full-
              brightness-always would get noisy with many branches), full brightness on hover. */}
          {graph.lanes.map((lane) => {
            const filteredOut = highlightedBranch && lane.branchName !== highlightedBranch;
            const isHovered = hoveredLane === lane.lane;
            const restOpacity = hoveredLane !== null ? 0.22 : 0.4;
            const opacity = filteredOut ? 0.15 : isHovered ? 1 : restOpacity;
            const LABEL_WIDTH = 220;
            return (
              <foreignObject
                key={`${lane.lane}-${lane.branchName}`}
                x={lane.x - LABEL_WIDTH / 2}
                y={lane.topRow * ROW_HEIGHT - 4 - lane.stackIndex * 26}
                width={LABEL_WIDTH}
                height={28}
                style={{ overflow: "visible", opacity, transition: "opacity 0.15s ease" }}
              >
                <div
                  className="flex justify-center"
                  onMouseEnter={() => setHoveredLane(lane.lane)}
                  onMouseLeave={() => setHoveredLane(null)}
                >
                  <span
                    className={clsx(
                      "mono-hash whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm transition-transform",
                      isHovered && "scale-110"
                    )}
                    style={{
                      borderColor: `color-mix(in oklab, ${ROLE_STROKE[lane.color]} 55%, transparent)`,
                      color: ROLE_STROKE[lane.color],
                      background: "var(--bg-surface)",
                    }}
                  >
                    {lane.branchName}
                  </span>
                </div>
              </foreignObject>
            );
          })}

          {/* nodes */}
          {graph.nodes.map(({ commit, x, y }) => {
            const isHead = commit.hash === effectiveHeadHash;
            const isLocal = localHashes.has(commit.hash);
            const dimmed = isDimmed(commit.lane, commit.hash);
            const hovered = hoveredHash === commit.hash;
            const selected = inspectedHash === commit.hash;
            const color = ROLE_STROKE[graph.commitColor.get(commit.hash) ?? "history"];
            return (
              <g key={commit.hash}>
                {isHead && (
                  <circle cx={x} cy={y} r={13} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5}>
                    <animate attributeName="r" values="10;15;10" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <motion.circle
                  cx={x}
                  cy={y}
                  r={commit.isMerge ? 8 : 6.5}
                  fill={commit.isMerge ? "var(--bg-canvas)" : isLocal ? "var(--bg-canvas)" : color}
                  stroke={color}
                  strokeWidth={commit.isMerge || isLocal ? 2.5 : 0}
                  strokeDasharray={isLocal && !commit.isMerge ? "2.5 2" : undefined}
                  initial={{ scale: 0 }}
                  animate={{ scale: hovered || selected ? 1.35 : 1, opacity: dimmed ? 0.25 : 1 }}
                  transition={{ duration: 0.2 }}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredHash(commit.hash)}
                  onMouseLeave={() => setHoveredHash(null)}
                  onClick={() => inspectCommit(commit.hash)}
                />
              </g>
            );
          })}

          {/* row info cards — start right after whatever's actually active *at this row*, not
              the widest point anywhere in the whole graph. A brief spike to 100 concurrent
              branches shouldn't strand every other row's info card 100 lanes out to the right
              when only a handful of lanes are ever active there. */}
          {graph.nodes.map(({ commit, x, y, row }) => {
            const dimmed = isDimmed(commit.lane, commit.hash);
            const hovered = hoveredHash === commit.hash;
            const selected = inspectedHash === commit.hash;
            const isHead = commit.hash === effectiveHeadHash;
            const isLocal = localHashes.has(commit.hash);
            const infoGap = LANE_WIDTH * 4;
            const infoX = Math.max(graph.rowLocalMaxX[row] + infoGap, x + infoGap);
            return (
              <foreignObject
                key={commit.hash + "-info"}
                x={infoX}
                y={y - ROW_HEIGHT / 2}
                width={ROW_CONTENT_WIDTH}
                height={ROW_HEIGHT}
                style={{ opacity: dimmed ? 0.3 : 1, transition: "x 0.2s ease" }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setHoveredHash(commit.hash)}
                  onMouseLeave={() => setHoveredHash(null)}
                  onClick={() => inspectCommit(commit.hash)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") inspectCommit(commit.hash);
                  }}
                  className="focus-ring inline-flex h-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left transition-colors"
                  style={{
                    maxWidth: ROW_CONTENT_WIDTH,
                    background: hovered || selected ? "var(--bg-surface-2)" : "transparent",
                    border: selected ? "1px solid var(--color-accent)" : "1px solid transparent",
                  }}
                >
                  <Avatar author={commit.author} size={26} />
                  {/* not flex-1 — the row should hug its own content (a short subject sits right
                      next to Checkout instead of stranding it 620px out), capped by max-w so a
                      long subject still truncates instead of blowing out the row's own max width */}
                  <div className="min-w-0 max-w-[380px] shrink">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                        {commit.subject}
                      </span>
                      {commit.isMerge && <GitMerge size={11} className="shrink-0 text-git-remote" />}
                      {commit.gpgSigned && <ShieldCheck size={11} className="shrink-0 text-git-commit" />}
                      {isLocal && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-surface-3)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]"
                          title={commit.command === "git push" ? "Pushed this session, not part of the seeded history" : "Local — not yet pushed to origin"}
                        >
                          {commit.command === "git push" ? "local · pushed" : (
                            <>
                              <CloudOff size={9} /> local · unpushed
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                      <span>{commit.author.name}</span>
                      <span>&middot;</span>
                      <span>{timeAgo(commit.committedAt)}</span>
                      <span className="mono-hash">{commit.shortHash}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!isHead && !isLocal && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          requestCheckoutCommit(commit.hash);
                        }}
                        title={`Checkout ${commit.shortHash} (detached HEAD)`}
                        className={clsx(
                          "focus-ring mr-1 flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-opacity",
                          hovered
                            ? "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] opacity-100"
                            : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] opacity-60"
                        )}
                      >
                        <GitCommitHorizontal size={10} /> Checkout
                      </button>
                    )}
                    {isHead && (
                      <Badge role="branch" className="!px-1.5 !py-0.5 !text-[10px]">
                        HEAD
                      </Badge>
                    )}
                    {(tagsByHash.get(commit.hash) ?? []).map((r) => (
                      <Badge key={r} role={graph.commitColor.get(commit.hash) ?? "history"} className="!px-1.5 !py-0.5 !text-[10px]">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
