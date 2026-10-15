// Upload routes: init, chunk, complete, status.

import type { Env } from '../types/index.js';
import { CHUNK_SIZE, MAX_FILE_SIZE, MAX_BODY_SIZE } from '../types/index.js';
import { now, uuid, first, run, all } from '../services/db.js';
import { requireUser, currentUser } from './auth.js';
import { sendDocument, getFile as baleGetFile } from '../services/bale.js';
import { guard } from '../services/circuitBreaker.js';
import { checkRateLimit, clientIp } from '../services/rateLimit.js';
import { ok, fail, HttpError } from '../utils/error.js';
import { sanitizeFilename, isAllowedMime } from '../utils/validator.js';
import { logger } from '../utils/logger.js';
import { acquireLock, releaseLock } from '../utils/lock.js';

function totalChunks(size: number): number {
  return Math.ceil(size / CHUNK_SIZE);
}

export async function handleUploadInit(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env).catch(() => null);
  // allow anonymous? Prompt says API public upload without auth. We'll allow anonymous with user_id null.
  let body: { name?: unknown; size?: unknown; mime_type?: unknown; file_hash?: unknown; total_chunks?: unknown; is_public?: unknown };
  try { body = await request.json(); } catch { return fail('INVALID_JSON', 'Invalid JSON body', 400); }

  const name = sanitizeFilename(body.name);
  const size = Number(body.size);
  const mime = typeof body.mime_type === 'string' ? body.mime_type : 'application/octet-stream';
  const fileHash = typeof body.file_hash === 'string' ? body.file_hash : '';
  const chunks = Number(body.total_chunks) || totalChunks(size);

  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) return fail('INVALID_SIZE', 'Invalid file size', 400);
  if (!isAllowedMime(mime)) return fail('INVALID_MIME', 'MIME type not allowed', 400);
  if (!fileHash) return fail('MISSING_HASH', 'file_hash required', 400);
  if (chunks !== totalChunks(size)) return fail('INVALID_CHUNKS', 'total_chunks mismatch', 400);

  // resume: check existing upload_session by file_hash
  const existing = await first<{ id: string; file_id: string; received_chunks: number; status: string }>(
    env, 'SELECT id, file_id, received_chunks, status FROM upload_sessions WHERE file_hash = ?', fileHash
  );

  if (existing && existing.status !== 'complete') {
    const file = await first<{ chunk_ids: string }>(env, 'SELECT chunk_ids FROM files WHERE id = ?', existing.file_id);
    const ids = file ? JSON.parse(file.chunk_ids) as string[] : [];
    const existingChunks = ids.map((_, i) => i).filter((i) => ids[i]);
    return ok({ session_id: existing.id, file_id: existing.file_id, existing_chunks: existingChunks });
  }

  const fileId = uuid();
  const sessionId = uuid();
  const userId = user ? user.id : null;
  const isPublic = body.is_public ? 1 : 0;
  await run(env, 'INSERT INTO files (id, user_id, name, size, mime_type, chunks, chunk_ids, is_public, is_complete, checksum, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)',
    fileId, userId, name, size, mime, chunks, JSON.stringify([]), isPublic, now());
  await run(env, 'INSERT INTO upload_sessions (id, file_id, file_hash, total_chunks, received_chunks, status, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    sessionId, fileId, fileHash, chunks, 'uploading', now());

  logger.info('upload.init', { file_id: fileId, size, chunks, user: userId });
  return ok({ session_id: sessionId, file_id: fileId, existing_chunks: [] });
}

export async function handleUploadChunk(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request);
  const rl = await checkRateLimit(env, `chunk:${ip}`, 60, 60);
  if (!rl.allowed) return fail('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) });

  // parse multipart
  let form: FormData;
  try { form = await request.formData(); } catch { return fail('INVALID_FORM', 'Invalid multipart form', 400); }

  const sessionId = String(form.get('session_id') || '');
  const chunkIndex = Number(form.get('chunk_index'));
  const chunkHash = String(form.get('chunk_hash') || '');
  const file = form.get('data') as any;
  if (!sessionId || !Number.isFinite(chunkIndex) || !(file instanceof File) && !(file instanceof Blob)) {
    return fail('INVALID_PARAMS', 'Missing params', 400);
  }
  const blob = file as Blob;

  const session = await first<{ id: string; file_id: string; total_chunks: number; status: string }>(
    env, 'SELECT id, file_id, total_chunks, status FROM upload_sessions WHERE id = ?', sessionId
  );
  if (!session) return fail('SESSION_NOT_FOUND', 'Upload session not found', 404);
  if (session.status === 'complete') return fail('SESSION_COMPLETE', 'Session already complete', 400);

  const fileRec = await first<{ chunks: number; chunk_ids: string; size: number }>(
    env, 'SELECT chunks, chunk_ids, size FROM files WHERE id = ?', session.file_id
  );
  if (!fileRec) return fail('FILE_NOT_FOUND', 'File not found', 404);
  if (chunkIndex < 0 || chunkIndex >= fileRec.chunks) return fail('INVALID_INDEX', 'Chunk index out of range', 400);

  // verify hash of received chunk
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (chunkHash && hex !== chunkHash) {
    logger.warn('upload.chunk_corrupt', { session_id: sessionId, chunk_index: chunkIndex });
    return fail('CHUNK_CORRUPTED', 'Chunk checksum mismatch', 400);
  }

  // lock per file to update chunk_ids atomically
  const lockKey = `file:${session.file_id}`;
  const owner = await acquireLock(env, lockKey, 30000);
  if (!owner) return fail('LOCKED', 'File busy, retry', 409);

  try {
    const ids: (string | null)[] = JSON.parse(fileRec.chunk_ids);
    while (ids.length < fileRec.chunks) ids.push(null);
    if (ids[chunkIndex]) {
      // already uploaded; idempotent
      return ok({ chunk_index: chunkIndex, received_chunks: session.total_chunks, bale_file_id: ids[chunkIndex] });
    }

    // send to Bale
    const baleDoc = await guard(() => sendDocument(env, new Blob([buf]), `chunk_${chunkIndex}`, `chunk:${chunkIndex}/of:${fileRec.chunks}|file:${session.file_id}`));
    ids[chunkIndex] = baleDoc.file_id;

    const received = ids.filter(Boolean).length;
    await run(env, 'UPDATE files SET chunk_ids = ? WHERE id = ?', JSON.stringify(ids), session.file_id);
    await run(env, 'UPDATE upload_sessions SET received_chunks = ? WHERE id = ?', received, sessionId);

    logger.info('upload.chunk', { session_id: sessionId, chunk_index: chunkIndex, bale_file_id: baleDoc.file_id });
    return ok({ chunk_index: chunkIndex, received_chunks: received, bale_file_id: baleDoc.file_id });
  } catch (e) {
    logger.error('upload.chunk_error', { session_id: sessionId, chunk_index: chunkIndex, err: String(e) });
    const msg = String(e);
    if (msg.includes('CIRCUIT_OPEN')) return fail('BALE_UNAVAILABLE', 'Storage temporarily unavailable', 503);
    return fail('UPLOAD_FAILED', 'Chunk upload failed', 500);
  } finally {
    await releaseLock(env, lockKey, owner);
  }
}

export async function handleUploadComplete(request: Request, env: Env): Promise<Response> {
  let body: { session_id?: unknown; final_checksum?: unknown };
  try { body = await request.json(); } catch { return fail('INVALID_JSON', 'Invalid JSON body', 400); }
  const sessionId = String(body.session_id || '');
  const finalChecksum = typeof body.final_checksum === 'string' ? body.final_checksum : '';

  const session = await first<{ id: string; file_id: string; total_chunks: number; status: string }>(
    env, 'SELECT id, file_id, total_chunks, status FROM upload_sessions WHERE id = ?', sessionId
  );
  if (!session) return fail('SESSION_NOT_FOUND', 'Upload session not found', 404);

  const fileRec = await first<{ chunks: number; chunk_ids: string }>(env, 'SELECT chunks, chunk_ids FROM files WHERE id = ?', session.file_id);
  if (!fileRec) return fail('FILE_NOT_FOUND', 'File not found', 404);

  const ids: (string | null)[] = JSON.parse(fileRec.chunk_ids);
  if (ids.length < fileRec.chunks || ids.some((x) => !x)) {
    return fail('INCOMPLETE', 'Not all chunks uploaded', 400);
  }

  await run(env, 'UPDATE files SET is_complete = 1, checksum = ? WHERE id = ?', finalChecksum || null, session.file_id);
  await run(env, "UPDATE upload_sessions SET status = 'complete', received_chunks = ? WHERE id = ?", fileRec.chunks, sessionId);

  logger.info('upload.complete', { file_id: session.file_id });
  const publicUrl = env.ENVIRONMENT === 'production' ? '' : '';
  return ok({ file_id: session.file_id, url: `/f/${session.file_id}` });
}

export async function handleUploadStatus(request: Request, env: Env, sessionId: string): Promise<Response> {
  const session = await first<{ id: string; file_id: string; total_chunks: number; received_chunks: number; status: string }>(
    env, 'SELECT id, file_id, total_chunks, received_chunks, status FROM upload_sessions WHERE id = ?', sessionId
  );
  if (!session) return fail('SESSION_NOT_FOUND', 'Upload session not found', 404);
  return ok({ status: session.status, received_chunks: session.received_chunks, total_chunks: session.total_chunks, file_id: session.file_id });
}
