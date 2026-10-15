// Logical locks in D1 with TTL.

import type { Env } from '../types/index.js';
import { now, run, first } from '../services/db.js';
import { uuid } from '../services/db.js';

export async function acquireLock(env: Env, key: string, ttlMs: number): Promise<string | null> {
  const owner = uuid();
  const t = now();
  const existing = await first<{ expires_at: number }>(env, 'SELECT expires_at FROM locks WHERE key = ?', key);
  if (existing && existing.expires_at > t) return null;
  await run(env, 'INSERT OR REPLACE INTO locks (key, owner, expires_at) VALUES (?, ?, ?)', key, owner, t + ttlMs);
  return owner;
}

export async function releaseLock(env: Env, key: string, owner: string): Promise<void> {
  await run(env, 'DELETE FROM locks WHERE key = ? AND owner = ?', key, owner);
}
