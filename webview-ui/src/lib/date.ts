export function toDayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function buildHeatmap(dates: string[], weeks = 12, now = new Date("2026-07-18T12:00:00Z")) {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = toDayKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  // align end to the Saturday of this week so the grid is a clean rectangle
  const dayOfWeek = end.getUTCDay();
  end.setUTCDate(end.getUTCDate() + (6 - dayOfWeek));

  const totalDays = weeks * 7;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - totalDays + 1);

  const cols: { date: string; count: number }[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w++) {
    const col: { date: string; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const key = cursor.toISOString().slice(0, 10);
      col.push({ date: key, count: counts.get(key) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    cols.push(col);
  }
  return cols;
}
