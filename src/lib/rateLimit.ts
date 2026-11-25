// In-memory sliding-window limiter. Holds per warm serverless instance only
// (same trade-off as the login limiter in /api/auth) — a cheap guard against
// runaway clients and token guessing, not a global quota.
const hits = new Map<string, number[]>();

function prune(now: number, windowMs: number) {
  if (hits.size < 5000) return;
  for (const [k, v] of hits) if (v.every((t) => now - t > windowMs)) hits.delete(k);
}

/** Records a hit; returns how many ms the caller must wait if over the limit, else 0. */
export function hit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  prune(now, windowMs);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max ? Math.max(1, windowMs - (now - recent[0])) : 0;
}

/** Whether the key is already over the limit, without recording a hit. */
export function peek(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  return recent.length >= max ? Math.max(1, windowMs - (now - recent[0])) : 0;
}

export function resetRateLimits() { hits.clear(); }
