import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GitMerge } from "lucide-react";
import { commits, getCommit, mainBranch } from "@/lib/mock-data";
import { useUIStore } from "@/store/ui-store";
import { useAllBranches } from "@/hooks/useCurrentBranch";
import { Tooltip } from "../ui/Tooltip";

const ROLE_STROKE: Record<string, string> = {
  commit: "var(--color-git-commit)",
  branch: "var(--color-git-branch)",
  staged: "var(--color-git-staged)",
  history: "var(--color-git-history)",
  remote: "var(--color-git-remote)",
  conflict: "var(--color-git-conflict)",
};

const ROW_H = 46;
const LEFT_LABEL_W = 200;

export function BranchTopology() {
  const [hovered, setHovered] = useState<string | null>(null);
  const inspectCommit = useUIStore((s) => s.inspectCommit);
  const currentBranchName = useUIStore((s) => s.currentBranchName);
  const headOverride = useUIStore((s) => s.headOverride);
  const effectiveHead = (b: { name: string; headHash: string }) =>
    b.name === currentBranchName && headOverride ? headOverride : b.headHash;

  const allBranches = useAllBranches();
  const local = useMemo(() => allBranches.filter((b) => b.kind === "local"), [allBranches]);
  const defaultBranchName = mainBranch().name;

  // Guards against a branch whose head (or fork point) commit isn't in the loaded commit set —
  // normally backfilled by the host now, but this stays safe rather than crashing if it ever
  // isn't (a stale snapshot mid-refresh, for instance).
  const renderable = useMemo(
    () => local.filter((b) => getCommit(effectiveHead(b)) && (!b.forkedFromHash || getCommit(b.forkedFromHash))),
    [local, currentBranchName, headOverride]
  );

  const genesisT = useMemo(
    () => Math.min(...commits.map((c) => +new Date(c.committedAt))),
    []
  );

  const { minT, maxT } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const b of renderable) {
      const headT = +new Date(getCommit(effectiveHead(b))!.committedAt);
      const forkT = b.forkedFromHash ? +new Date(getCommit(b.forkedFromHash)!.committedAt) : genesisT;
      min = Math.min(min, forkT);
      max = Math.max(max, headT);
    }
    return { minT: min, maxT: max };
  }, [renderable, genesisT, currentBranchName, headOverride]);

  const width = 760;
  const scaleX = (t: number) => {
    const span = maxT - minT || 1;
    return ((t - minT) / span) * (width - 40) + 10;
  };

  return (
    <div className="overflow-x-auto">
      <svg width={width + LEFT_LABEL_W} height={renderable.length * ROW_H + 20} className="min-w-full">
        {renderable.map((b, i) => {
          const y = i * ROW_H + ROW_H / 2 + 10;
          const head = getCommit(effectiveHead(b))!;
          const fork = b.forkedFromHash ? getCommit(b.forkedFromHash) : null;
          const merged = b.mergedIntoHash ? getCommit(b.mergedIntoHash) : null;
          const startT = fork ? +new Date(fork.committedAt) : genesisT;
          const endT = merged ? +new Date(merged.committedAt) : +new Date(head.committedAt);
          const x1 = scaleX(startT);
          const x2 = scaleX(endT);
          const color = ROLE_STROKE[b.color];
          const dimmed = hovered && hovered !== b.name;

          return (
            <g key={b.name} opacity={dimmed ? 0.3 : 1}>
              <foreignObject x={0} y={y - 12} width={LEFT_LABEL_W - 12} height={24}>
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-primary)]">
                  {b.name === currentBranchName && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-git-branch" />}
                  <span className="truncate">{b.name}</span>
                </div>
              </foreignObject>

              {/* connector to fork point on main */}
              {fork && b.name !== defaultBranchName && (
                <line
                  x1={x1}
                  y1={ROW_H / 2 + 10}
                  x2={x1}
                  y2={y}
                  stroke="var(--border-strong)"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                />
              )}

              <motion.line
                x1={LEFT_LABEL_W + x1}
                y1={y}
                x2={LEFT_LABEL_W + x1}
                y2={y}
                initial={{ x2: LEFT_LABEL_W + x1 }}
                animate={{ x2: LEFT_LABEL_W + x2 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                stroke={color}
                strokeWidth={5}
                strokeLinecap="round"
                onMouseEnter={() => setHovered(b.name)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              />

              {/* fork point dot */}
              {fork && b.name !== defaultBranchName && (
                <circle cx={LEFT_LABEL_W + x1} cy={y} r={4} fill="var(--bg-surface)" stroke={color} strokeWidth={2} />
              )}

              {/* head or merge marker */}
              <Tooltip
                content={
                  merged
                    ? `Merged ${merged.shortHash}`
                    : `${b.name === currentBranchName ? "HEAD" : "Tip"} ${head.shortHash} — ${head.subject}`
                }
              >
                <g onClick={() => inspectCommit(merged ? merged.hash : head.hash)} style={{ cursor: "pointer" }}>
                  {merged ? (
                    <circle cx={LEFT_LABEL_W + x2} cy={y} r={7} fill="var(--bg-surface)" stroke={color} strokeWidth={2.5} />
                  ) : (
                    <circle cx={LEFT_LABEL_W + x2} cy={y} r={5} fill={color} />
                  )}
                </g>
              </Tooltip>
              {merged && (
                <foreignObject x={LEFT_LABEL_W + x2 - 7} y={y - 7} width={14} height={14}>
                  <GitMerge size={10} strokeWidth={3} color={color} />
                </foreignObject>
              )}
              {!merged && b.name !== defaultBranchName && (
                <foreignObject x={LEFT_LABEL_W + x2 + 10} y={y - 8} width={100} height={16}>
                  <span className="whitespace-nowrap text-[10px] font-medium" style={{ color }}>
                    open
                  </span>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
