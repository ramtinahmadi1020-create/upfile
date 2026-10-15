// D1 helpers: prepared statements, transactions, cleanup.

import type { Env } from '../types/index.js';

export function now(): number {
  return Date.now();
}

export async function run(env: Env, sql: string, ...params: unknown[]): Promise<D1Result> {
  const stmt = env.DB.prepare(sql);
  return params.length ? await stmt.bind(...params).run() : await stmt.run();
}

export async function first<T = Record<string, unknown>>(env: Env, sql: string, ...params: unknown[]): Promise<T | null> {
  const stmt = env.DB.prepare(sql);
  const r = params.length ? await stmt.bind(...params).first<T>() : await stmt.first<T>();
  return r ?? null;
}

export async function all<T = Record<string, unknown>>(env: Env, sql: string, ...params: unknown[]): Promise<T[]> {
  const stmt = env.DB.prepare(sql);
  const res = params.length ? await stmt.bind(...params).all<T>() : await stmt.all<T>();
  return res.results ?? [];
}

export async function batch(env: Env, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  return await env.DB.batch(statements);
}

export async function cleanupExpired(env: Env): Promise<void> {
  const t = now();
  await run(env, 'DELETE FROM sessions WHERE expires_at < ?', t);
  await run(env, 'DELETE FROM rate_limits WHERE expires_at < ?', t);
  await run(env, 'DELETE FROM locks WHERE expires_at < ?', t);
  // remove incomplete upload sessions older than 24h
  await run(env, "DELETE FROM upload_sessions WHERE status != 'complete' AND created_at < ?", t - 24 * 60 * 60 * 1000);
}

export function uuid(): string {
  // crypto.randomUUID available in Workers
  return crypto.randomUUID();
}
