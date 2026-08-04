import { motion } from "framer-motion";
import { health } from "@/lib/mock-data";
import { useUIStore } from "@/store/ui-store";

export function HealthGauge() {
  const stashCount = useUIStore((s) => s.stashes.length) + health.stashCount;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const score = health.score;
  const color = score >= 85 ? "var(--color-git-commit)" : score >= 60 ? "var(--color-git-staged)" : "var(--color-git-conflict)";

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--bg-surface-3)" strokeWidth="8" />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-tabular text-xl font-bold text-[var(--text-primary)]">{score}</span>
          <span className="text-[10px] text-[var(--text-tertiary)]">/ 100</span>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 text-[12px]">
        <Row label="Loose objects" value={health.looseObjects} />
        <Row label="Largest file" value={`${health.largestFileMB} MB`} />
        <Row label="Stashes" value={stashCount} />
        <Row label="Unmerged branches" value={health.unmergedBranches} warn={health.unmergedBranches > 0} />
      </div>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className={`font-tabular font-medium ${warn ? "text-git-staged" : "text-[var(--text-secondary)]"}`}>
        {value}
      </span>
    </div>
  );
}
