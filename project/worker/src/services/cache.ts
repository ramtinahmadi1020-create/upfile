// Caching helpers: Cloudflare Cache API for public files + small in-memory map.

import type { Env } from '../types/index.js';

const mem = new Map<string, { value: unknown; expires: number }>();

export function memGet<T>(key: string): T | null {
  const e = mem.get(key);
  if (!e) return null;
  if (e.expires < Date.now()) { mem.delete(key); return null; }
  return e.value as T;
}

export function memSet(key: string, value: unknown, ttlMs: number): void {
  mem.set(key, { value, expires: Date.now() + ttlMs });
}

export async function cacheMatch(request: Request): Promise<Response | null> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    return (await cache.match(request)) ?? null;
  } catch {
    return null;
  }
}

export async function cachePut(request: Request, response: Response): Promise<void> {
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    await cache.put(request, response.clone());
  } catch {
    // ignore
  }
}
