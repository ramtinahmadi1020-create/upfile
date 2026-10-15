// Authentication helpers: PBKDF2 hashing, session cookies, CSRF.

import type { Env, User, Session } from '../types/index.js';
import { now, uuid, first, run } from './db.js';

const ITERATIONS = 100000;
const KEY_LEN = 32;

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LEN * 8
  );
  return new Uint8Array(bits);
}

function toHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const salt = fromHex(parts[2]!);
  const derived = await derive(password, salt);
  const expected = fromHex(parts[3]!);
  // constant-time compare
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i]! ^ expected[i]!;
  return diff === 0;
}

export async function createSession(env: Env, userId: number): Promise<string> {
  const id = uuid();
  const t = now();
  await run(env, 'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    id, userId, t, t + 7 * 24 * 60 * 60 * 1000);
  return id;
}

export async function getSession(env: Env, sessionId: string): Promise<Session | null> {
  const s = await first<Session>(env, 'SELECT * FROM sessions WHERE id = ?', sessionId);
  if (!s) return null;
  if (s.expires_at < now()) {
    await run(env, 'DELETE FROM sessions WHERE id = ?', sessionId);
    return null;
  }
  return s;
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await run(env, 'DELETE FROM sessions WHERE id = ?', sessionId);
}

export function sessionCookie(sessionId: string, secure: boolean): string {
  const parts = [`session=${sessionId}`, 'HttpOnly', 'Path=/', 'SameSite=Strict', `Max-Age=${7 * 24 * 60 * 60}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = ['session=', 'HttpOnly', 'Path=/', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export async function getUser(env: Env, userId: number): Promise<User | null> {
  return await first<User>(env, 'SELECT * FROM users WHERE id = ?', userId);
}

export function generateCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}
