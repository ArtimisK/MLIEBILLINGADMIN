// In-memory login rate limiter. Resets on process restart — good enough for
// a single-instance internal tool. 5 failures → locked for 15 minutes.

const store = new Map<string, { count: number; resetAt: number }>();

const MAX   = 5;
const WINDOW = 15 * 60 * 1000; // 15 minutes in ms

export function checkLimit(ip: string): { allowed: boolean; remaining: number } {
  const now   = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) return { allowed: true, remaining: MAX };
  if (entry.count >= MAX)            return { allowed: false, remaining: 0 };
  return { allowed: true, remaining: MAX - entry.count };
}

export function recordFailure(ip: string): void {
  const now   = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW });
  } else {
    store.set(ip, { count: entry.count + 1, resetAt: entry.resetAt });
  }
}

export function clearLimit(ip: string): void {
  store.delete(ip);
}
