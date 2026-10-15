// Circuit breaker for Bale API (state in D1 locks table as a simple flag).

import type { Env } from '../types/index.js';
import { now, first, run } from './db.js';

const FAIL_THRESHOLD = 5;
const OPEN_MS = 30000;

interface CBState { failures: number; openedAt: number | null; }

const mem = new Map<string, CBState>();

function get(): CBState {
  if (!mem.has('bale')) mem.set('bale', { failures: 0, openedAt: null });
  return mem.get('bale')!;
}

export function isOpen(): boolean {
  const s = get();
  if (s.openedAt && Date.now() - s.openedAt < OPEN_MS) return true;
  if (s.openedAt && Date.now() - s.openedAt >= OPEN_MS) {
    // half-open: reset failures
    s.openedAt = null;
    s.failures = 0;
  }
  return false;
}

export function recordSuccess(): void {
  const s = get();
  s.failures = 0;
  s.openedAt = null;
}

export function recordFailure(): void {
  const s = get();
  s.failures += 1;
  if (s.failures >= FAIL_THRESHOLD) s.openedAt = Date.now();
}

export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  if (isOpen()) throw new Error('CIRCUIT_OPEN');
  try {
    const r = await fn();
    recordSuccess();
    return r;
  } catch (e) {
    recordFailure();
    throw e;
  }
}
