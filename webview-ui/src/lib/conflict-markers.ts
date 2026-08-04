import { SNIPPETS, extOf, seededPick } from "./diff-content";
import { fnv1a } from "./hash";

export type ConflictResolution = "ours" | "theirs" | "both" | "manual" | null;

export function buildConflictMarkerText(path: string, oursLabel: string, theirsLabel: string, seed: string): string {
  const pool = SNIPPETS[extOf(path)];
  const baseSeed = fnv1a(seed + path);
  const oursLines = Array.from({ length: 3 }, (_, i) => seededPick(pool, baseSeed, i));
  const theirsLines = Array.from({ length: 3 }, (_, i) => seededPick(pool, baseSeed, i + 40));
  return [`<<<<<<< ${oursLabel}`, ...oursLines, "=======", ...theirsLines, `>>>>>>> ${theirsLabel}`].join("\n");
}

export function hasConflictMarkers(text: string): boolean {
  return text.includes("<<<<<<<") || text.includes("=======") || text.includes(">>>>>>>");
}

export function isFileResolved(resolution: ConflictResolution, manualContent?: string): boolean {
  if (resolution === "manual") return Boolean(manualContent) && !hasConflictMarkers(manualContent!);
  return resolution !== null;
}
