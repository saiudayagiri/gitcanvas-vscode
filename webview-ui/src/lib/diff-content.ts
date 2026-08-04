import { fnv1a } from "./hash";

export type DiffLineType = "add" | "remove" | "context";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

const SNIPPETS: Record<string, string[]> = {
  tsx: [
    "const [isOpen, setIsOpen] = useState(false);",
    "return (",
    "  <div className=\"flex items-center gap-2\">",
    "    {label}",
    "  </div>",
    ");",
    "useEffect(() => {",
    "  if (!mounted) return;",
    "}, [mounted]);",
    "export function Component({ children }: Props) {",
    "  const value = useMemo(() => compute(input), [input]);",
    "onClick={() => handleSelect(item.id)}",
    "className={clsx(\"rounded-lg\", active && \"bg-accent\")}",
  ],
  ts: [
    "export function formatValue(input: number): string {",
    "  return input.toLocaleString();",
    "}",
    "interface Props {",
    "  id: string;",
    "  onChange: (value: string) => void;",
    "}",
    "const result = await fetch(`/api/${id}`);",
    "if (!response.ok) throw new Error(\"Request failed\");",
    "export const config = {",
    "  retries: 3,",
    "  timeoutMs: 5000,",
    "};",
  ],
  css: [
    "  display: flex;",
    "  align-items: center;",
    "  gap: 0.5rem;",
    "  color: var(--text-primary);",
    "  border-radius: 8px;",
    "  transition: background 0.15s ease;",
    "}",
    ".container {",
    "  max-width: 1180px;",
    "  margin: 0 auto;",
  ],
  sql: [
    "ALTER TABLE billing_events",
    "  ADD COLUMN processed_at TIMESTAMPTZ;",
    "CREATE INDEX idx_billing_events_customer",
    "  ON billing_events (customer_id);",
    "UPDATE billing_events SET status = 'pending'",
    "  WHERE status IS NULL;",
  ],
  yml: [
    "  - name: Install dependencies",
    "    run: npm ci",
    "  - name: Run tests",
    "    run: npm test",
    "on:",
    "  push:",
    "    branches: [main]",
  ],
  json: [
    "  \"version\": \"1.4.0\",",
    "  \"private\": true,",
    "  \"scripts\": {",
    "    \"build\": \"vite build\"",
    "  },",
  ],
  md: [
    "## Setup",
    "Run `npm install` then `npm run dev`.",
    "- Requires Node 20+",
    "See CONTRIBUTING.md for details.",
  ],
  default: [
    "// updated implementation",
    "function process(input) {",
    "  return input;",
    "}",
  ],
};

export function extOf(path: string): string {
  const ext = path.split(".").pop() ?? "";
  return SNIPPETS[ext] ? ext : "default";
}

export function seededPick<T>(arr: T[], seed: number, offset: number): T {
  const idx = Math.abs((seed + offset * 2654435761) | 0) % arr.length;
  return arr[idx];
}

export { SNIPPETS };

/** Deterministic, plausible-looking diff hunks — stable per (path, seed), sized to match real insertion/deletion counts. */
export function generateDiff(path: string, insertions: number, deletions: number, seed: string): DiffHunk[] {
  const ext = extOf(path);
  const pool = SNIPPETS[ext];
  const baseSeed = fnv1a(seed + path);

  const cappedAdd = Math.min(insertions, 24);
  const cappedDel = Math.min(deletions, 24);
  if (cappedAdd === 0 && cappedDel === 0) return [];

  const lines: DiffLine[] = [];
  let oldLn = Math.max(1, (baseSeed % 80) + 1);
  let newLn = oldLn;

  // one leading context line
  lines.push({ type: "context", content: seededPick(pool, baseSeed, 0), oldLineNo: oldLn++, newLineNo: newLn++ });

  for (let i = 0; i < cappedDel; i++) {
    lines.push({ type: "remove", content: seededPick(pool, baseSeed, i + 1), oldLineNo: oldLn++, newLineNo: null });
  }
  for (let i = 0; i < cappedAdd; i++) {
    lines.push({ type: "add", content: seededPick(pool, baseSeed, i + 50), oldLineNo: null, newLineNo: newLn++ });
  }

  // one trailing context line
  lines.push({ type: "context", content: seededPick(pool, baseSeed, 99), oldLineNo: oldLn++, newLineNo: newLn++ });

  const truncatedNote =
    insertions > 24 || deletions > 24
      ? [{ type: "context" as const, content: `… ${insertions + deletions - cappedAdd - cappedDel} more lines not shown`, oldLineNo: null, newLineNo: null }]
      : [];

  return [
    {
      header: `@@ -${lines[0].oldLineNo},${cappedDel + 2} +${lines[0].newLineNo},${cappedAdd + 2} @@`,
      lines: [...lines, ...truncatedNote],
    },
  ];
}
