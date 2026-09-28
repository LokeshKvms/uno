export type Limiter = () => boolean;

export function tokenBucket(perSecond: number, burst: number, now: () => number = Date.now): Limiter {
  let tokens = burst;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - last) * perSecond) / 1000);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
