// Auth routes: register, login, logout, me.

import type { Env } from '../types/index.js';
import { validateUsername, validatePassword } from '../utils/validator.js';
import { hashPassword, verifyPassword, createSession, getSession, deleteSession, sessionCookie, clearSessionCookie, getUser, generateCsrfToken } from '../services/auth.js';
import { now, first, run } from '../services/db.js';
import { checkRateLimit, clientIp } from '../services/rateLimit.js';
import { ok, fail, HttpError } from '../utils/error.js';
import { logger } from '../utils/logger.js';

function secure(env: Env): boolean { return env.ENVIRONMENT === 'production'; }

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request);
  const rl = await checkRateLimit(env, `reg:${ip}`, 3, 60);
  if (!rl.allowed) return fail('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) });

  let body: { username?: unknown; password?: unknown; password2?: unknown };
  try { body = await request.json(); } catch { return fail('INVALID_JSON', 'Invalid JSON body', 400); }

  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  if (!username) return fail('INVALID_USERNAME', 'Username must be 3-32 alphanumeric/underscore', 400);
  if (!password) return fail('INVALID_PASSWORD', 'Password must be 6-128 chars', 400);
  if (body.password !== body.password2) return fail('PASSWORD_MISMATCH', 'Passwords do not match', 400);

  const existing = await first(env, 'SELECT id FROM users WHERE username = ?', username);
  if (existing) return fail('USERNAME_TAKEN', 'Username already exists', 409);

  const hash = await hashPassword(password);
  const res = await run(env, 'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)', username, hash, now());
  const userId = res.meta.last_row_id as number;
  const sessionId = await createSession(env, userId);
  logger.info('auth.register', { username, ip });
  const csrf = generateCsrfToken();
  const resp = ok({ user_id: userId, username, csrf_token: csrf });
  resp.headers.set('Set-Cookie', sessionCookie(sessionId, secure(env)));
  return resp;
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request);
  const rl = await checkRateLimit(env, `login:${ip}`, 5, 60);
  if (!rl.allowed) return fail('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) });

  let body: { username?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return fail('INVALID_JSON', 'Invalid JSON body', 400); }

  const username = validateUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : null;
  if (!username || !password) return fail('INVALID_CREDENTIALS', 'Invalid credentials', 401);

  const user = await first<{ id: number; password_hash: string }>(env, 'SELECT id, password_hash FROM users WHERE username = ?', username);
  // timing-safe: always verify
  const hashToCheck = user?.password_hash ?? 'pbkdf2$100000$00$00';
  const okPass = await verifyPassword(password, hashToCheck);
  if (!user || !okPass) {
    logger.warn('auth.login_failed', { username, ip });
    return fail('INVALID_CREDENTIALS', 'Invalid credentials', 401);
  }
  const sessionId = await createSession(env, user.id);
  logger.info('auth.login', { username, ip });
  const csrf = generateCsrfToken();
  const resp = ok({ user_id: user.id, username, csrf_token: csrf });
  resp.headers.set('Set-Cookie', sessionCookie(sessionId, secure(env)));
  return resp;
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/session=([^;]+)/);
  if (m) await deleteSession(env, m[1]!);
  const resp = ok({ logged_out: true });
  resp.headers.set('Set-Cookie', clearSessionCookie(secure(env)));
  return resp;
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return fail('UNAUTHORIZED', 'Not authenticated', 401);
  return ok({ user_id: user.id, username: user.username, language: user.language });
}

export async function currentUser(request: Request, env: Env): Promise<{ id: number; username: string; language: string } | null> {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/session=([^;]+)/);
  if (!m) return null;
  const s = await getSession(env, m[1]!);
  if (!s) return null;
  const u = await getUser(env, s.user_id);
  if (!u) return null;
  return { id: u.id, username: u.username, language: u.language };
}

export async function requireUser(request: Request, env: Env): Promise<{ id: number; username: string; language: string }> {
  const u = await currentUser(request, env);
  if (!u) throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  return u;
}
