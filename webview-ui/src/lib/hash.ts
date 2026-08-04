// Deterministic, realistic-looking hex hash generator for mock data.
// Not cryptographic — just needs to look like a real Git SHA and stay stable.
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function makeHash(seed: string): string {
  let out = "";
  let cursor = seed;
  while (out.length < 40) {
    const n = fnv1a(cursor);
    out += n.toString(16).padStart(8, "0");
    cursor = cursor + n.toString(16);
  }
  return out.slice(0, 40);
}

export function shortHash(hash: string, len = 7): string {
  return hash.slice(0, len);
}
