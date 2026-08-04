const PALETTE = [
  "#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#3fd68c",
  "#38d9d9", "#5b9dff", "#748ffc", "#b48dff", "#f783ac",
];

function seedToIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function colorForSeed(seed: string): string {
  return PALETTE[seedToIndex(seed, PALETTE.length)];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
