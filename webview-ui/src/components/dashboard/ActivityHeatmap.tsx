import { motion } from "framer-motion";
import { buildHeatmap } from "@/lib/date";
import { commits } from "@/lib/mock-data";
import { Tooltip } from "../ui/Tooltip";

function levelClass(count: number) {
  if (count === 0) return "bg-[var(--bg-surface-3)]";
  if (count === 1) return "bg-git-commit/35";
  if (count === 2) return "bg-git-commit/60";
  return "bg-git-commit";
}

export function ActivityHeatmap() {
  const cols = buildHeatmap(commits.map((c) => c.committedAt), 14);
  const totalCommits = commits.length;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">{totalCommits}</span> commits in the last 14 weeks
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
          <span>Less</span>
          {[0, 1, 2, 3].map((l) => (
            <span key={l} className={`h-2.5 w-2.5 rounded-[3px] ${levelClass(l)}`} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="mt-3 flex gap-[3px] overflow-x-auto pb-1">
        {cols.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {col.map((day, di) => (
              <Tooltip key={day.date} content={`${day.count} commit${day.count !== 1 ? "s" : ""} on ${day.date}`}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: (wi * 7 + di) * 0.002 }}
                  className={`h-2.5 w-2.5 rounded-[3px] ${levelClass(day.count)}`}
                />
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
