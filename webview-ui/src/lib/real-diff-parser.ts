import type { DiffHunk, DiffLine } from "./diff-content";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** Parses raw `git diff`/`git show` unified-diff text (as produced by getFileDiff on the
 * extension host) into the same DiffHunk[] shape the DiffViewer already renders. Returns
 * an empty array for binary diffs (no `@@` hunks), which the viewer already treats as
 * "Binary or empty diff". */
export function parseUnifiedDiff(raw: string): DiffHunk[] {
  const lines = raw.split("\n");
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLineNo = 0;
  let newLineNo = 0;

  for (const line of lines) {
    const headerMatch = HUNK_HEADER.exec(line);
    if (headerMatch) {
      oldLineNo = Number(headerMatch[1]);
      newLineNo = Number(headerMatch[3]);
      current = { header: line, lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue; // still in the diff --git / index / --- / +++ preamble

    if (line.startsWith("\\")) continue; // "\ No newline at end of file"

    if (line.startsWith("+")) {
      current.lines.push({ type: "add", content: line.slice(1), oldLineNo: null, newLineNo: newLineNo++ });
    } else if (line.startsWith("-")) {
      current.lines.push({ type: "remove", content: line.slice(1), oldLineNo: oldLineNo++, newLineNo: null });
    } else if (line.startsWith(" ") || line === "") {
      current.lines.push({ type: "context", content: line.slice(1), oldLineNo: oldLineNo++, newLineNo: newLineNo++ });
    }
    // any other line (e.g. a stray "diff --git" for a second file in a multi-file show
    // output) ends the current hunk sequence implicitly by never matching the branches above
  }

  return hunks;
}

export type { DiffHunk, DiffLine };
