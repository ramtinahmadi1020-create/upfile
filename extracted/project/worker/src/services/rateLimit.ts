// Sliding-window-ish rate limiter backed by D1.

import type { Env } from '../types/index.js';
import { now, run, first } from './db.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export async function checkRateLimit(env: Env, key: string, max: number, windowSec: number): Promise<RateLimitResult> {
  const t = now();
  const windowMs = windowSec * 1000;
  const row = await first<{ count: number; window_start: number; expires_at: number }>(
    env, 'SELECT count, window_start, expires_at FROM rate_limits WHERE key = ?', key
  );
  if (!row || t - row.window_start >= windowMs) {
    // new window
    await run(env, 'INSERT OR REPLACE INTO rate_limits (key, count, window_start, expires_at) VALUES (?, ?, ?, ?)',
      key, 1, t, t + windowMs);
    return { allowed: true, remaining: max - 1, retryAfter: 0 };
  }
  if (row.count >= max) {
    const retryAfter = Math.ceil((row.window_start + windowMs - t) / 1000);
    return { allowed: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
  }
  await run(env, 'UPDATE rate_limits SET count = count + 1 WHERE key = ?', key);
  return { allowed: true, remaining: max - row.count - 1, retryAfter: 0 };
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}
