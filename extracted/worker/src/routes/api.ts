// Public API helpers (no auth). Single-file upload convenience + aliases.

import type { Env } from '../types/index.js';
import { CHUNK_SIZE, MAX_BODY_SIZE } from '../types/index.js';
import { now, uuid, run } from '../services/db.js';
import { sendDocument } from '../services/bale.js';
import { guard } from '../services/circuitBreaker.js';
import { checkRateLimit, clientIp } from '../services/rateLimit.js';
import { ok, fail } from '../utils/error.js';
import { sanitizeFilename, isAllowedMime } from '../utils/validator.js';
import { logger } from '../utils/logger.js';

export async function handleApiUpload(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request);
  const rl = await checkRateLimit(env, `api:${ip}`, 100, 60);
  if (!rl.allowed) return fail('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) });

  let form: FormData;
  try { form = await request.formData(); } catch { return fail('INVALID_FORM', 'Invalid multipart form', 400); }
  const file = form.get('file') as Blob | null;
  if (!file) return fail('MISSING_FILE', 'file field required', 400);
  const name = sanitizeFilename((file as File).name || 'file');
  const mime = (file as File).type || 'application/octet-stream';
  const size = file.size;
  if (size > MAX_BODY_SIZE) return fail('FILE_TOO_LARGE', 'Use chunked upload for files > 45MB', 413);
  if (!isAllowedMime(mime)) return fail('INVALID_MIME', 'MIME type not allowed', 400);

  const buf = await file.arrayBuffer();
  const chunks = Math.ceil(size / CHUNK_SIZE) || 1;
  const ids: string[] = [];
  for (let i = 0; i < chunks; i++) {
    const slice = buf.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const doc = await guard(() => sendDocument(env, new Blob([slice]), `chunk_${i}`, `chunk:${i}/of:${chunks}|api`));
    ids.push(doc.file_id);
  }
  const fileId = uuid();
  await run(env, 'INSERT INTO files (id, user_id, name, size, mime_type, chunks, chunk_ids, is_public, is_complete, checksum, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, 1, 1, NULL, ?)',
    fileId, name, size, mime, chunks, JSON.stringify(ids), now());
  logger.info('api.upload', { file_id: fileId, size });
  return ok({ file_id: fileId, url: `/f/${fileId}` });
}

export async function handleApiFile(request: Request, env: Env, id: string): Promise<Response> {
  // redirect to proxy
  return new Response(null, { status: 302, headers: { Location: `/f/${id}` } });
}

export async function handleApiList(request: Request, env: Env): Promise<Response> {
  const rows = await (await import('./files.js')).handlePublicList(request, env);
  return rows;
}

export async function handleApiInfo(request: Request, env: Env, id: string): Promise<Response> {
  return (await import('./files.js')).handlePublicInfo(request, env, id);
}
