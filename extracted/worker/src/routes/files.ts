// File management routes: list, info, delete, public list/info, proxy.

import type { Env } from '../types/index.js';
import { now, first, run, all } from '../services/db.js';
import { requireUser, currentUser } from './auth.js';
import { getFile as baleGetFile, downloadStream, downloadUrl } from '../services/bale.js';
import { guard } from '../services/circuitBreaker.js';
import { checkRateLimit, clientIp } from '../services/rateLimit.js';
import { ok, fail } from '../utils/error.js';
import { logger } from '../utils/logger.js';
import { cacheMatch, cachePut } from '../services/cache.js';

export async function handleListFiles(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env).catch(() => null);
  if (!user) return fail('UNAUTHORIZED', 'Not authenticated', 401);
  const rows = await all<{ id: string; name: string; size: number; mime_type: string | null; is_public: number; is_complete: number; created_at: number; checksum: string | null }>(
    env, 'SELECT id, name, size, mime_type, is_public, is_complete, created_at, checksum FROM files WHERE user_id = ? ORDER BY created_at DESC', user.id
  );
  return ok(rows);
}

export async function handleFileInfo(request: Request, env: Env, id: string): Promise<Response> {
  const row = await first<{ id: string; name: string; size: number; mime_type: string | null; chunks: number; is_public: number; is_complete: number; created_at: number; checksum: string | null; user_id: number | null }>(
    env, 'SELECT id, name, size, mime_type, chunks, is_public, is_complete, created_at, checksum, user_id FROM files WHERE id = ?', id
  );
  if (!row) return fail('NOT_FOUND', 'File not found', 404);
  const user = await currentUser(request, env);
  if (!row.is_public && (!user || user.id !== row.user_id)) return fail('FORBIDDEN', 'Access denied', 403);
  return ok(row);
}

export async function handleDeleteFile(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireUser(request, env).catch(() => null);
  if (!user) return fail('UNAUTHORIZED', 'Not authenticated', 401);
  const row = await first<{ user_id: number | null }>(env, 'SELECT user_id FROM files WHERE id = ?', id);
  if (!row) return fail('NOT_FOUND', 'File not found', 404);
  if (row.user_id !== user.id) return fail('FORBIDDEN', 'Not owner', 403);
  await run(env, 'DELETE FROM files WHERE id = ?', id);
  await run(env, 'DELETE FROM upload_sessions WHERE file_id = ?', id);
  logger.info('file.delete', { id, user: user.id });
  return ok({ deleted: id });
}

export async function handlePublicList(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request);
  const rl = await checkRateLimit(env, `pub:${ip}`, 100, 60);
  if (!rl.allowed) return fail('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) });

  // cache in memory for 30s
  const cached = (globalThis as { __pubList?: { t: number; data: unknown } }).__pubList;
  if (cached && Date.now() - cached.t < 30000) {
    return ok(cached.data);
  }
  const rows = await all<{ id: string; name: string; size: number; mime_type: string | null; created_at: number }>(
    env, 'SELECT id, name, size, mime_type, created_at FROM files WHERE is_public = 1 AND is_complete = 1 ORDER BY created_at DESC LIMIT 100'
  );
  (globalThis as { __pubList?: { t: number; data: unknown } }).__pubList = { t: Date.now(), data: rows };
  return ok(rows);
}

export async function handlePublicInfo(request: Request, env: Env, id: string): Promise<Response> {
  const row = await first<{ id: string; name: string; size: number; mime_type: string | null; created_at: number; is_public: number; is_complete: number }>(
    env, 'SELECT id, name, size, mime_type, created_at, is_public, is_complete FROM files WHERE id = ?', id
  );
  if (!row || !row.is_public || !row.is_complete) return fail('NOT_FOUND', 'File not found', 404);
  return ok(row);
}

// Proxy file content (inline). Handles Range.
export async function handleFileProxy(request: Request, env: Env, id: string, download: boolean): Promise<Response> {
  const ip = clientIp(request);
  const rl = await checkRateLimit(env, `link:${ip}`, 1000, 60);
  if (!rl.allowed) return fail('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) });

  const row = await first<{ id: string; name: string; size: number; mime_type: string | null; chunks: number; chunk_ids: string; is_public: number; is_complete: number; user_id: number | null; checksum: string | null }>(
    env, 'SELECT id, name, size, mime_type, chunks, chunk_ids, is_public, is_complete, user_id, checksum FROM files WHERE id = ?', id
  );
  if (!row || !row.is_complete) return fail('NOT_FOUND', 'File not found', 404);

  const user = await currentUser(request, env);
  if (!row.is_public && (!user || user.id !== row.user_id)) return fail('FORBIDDEN', 'Access denied', 403);

  const ids: string[] = JSON.parse(row.chunk_ids);
  // For simplicity, if single chunk, proxy directly. For multi-chunk, we only support full download of first? 
  // We'll implement range-aware single-stream by fetching the needed bale file(s). Given complexity, 
  // for multi-chunk we concatenate streams sequentially (no true range across chunks) but support Range within a single chunk poorly.
  // To keep robust, handle Range by computing byte ranges across chunks.

  const rangeHeader = request.headers.get('Range');
  const mime = row.mime_type || 'application/octet-stream';

  // Determine which bale file_ids to fetch. For full file or range, map bytes -> chunks.
  // Build list of {baleId, chunkIndex, startByte, endByte (exclusive within chunk)}.
  const chunkSize = 40 * 1024 * 1024;
  let start = 0;
  let end = row.size; // exclusive
  let status = 200;
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      start = parseInt(m[1]!, 10);
      end = m[2] ? parseInt(m[2], 10) + 1 : row.size;
      if (start >= row.size || end > row.size || start >= end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${row.size}` } });
      }
      status = 206;
    }
  }

  // collect bale file ids needed
  const needed = new Set<number>();
  const firstChunk = Math.floor(start / chunkSize);
  const lastChunk = Math.min(row.chunks - 1, Math.floor((end - 1) / chunkSize));
  for (let c = firstChunk; c <= lastChunk; c++) needed.add(c);

  // Fetch each needed chunk's bale file path, then stream bytes.
  // We'll create a ReadableStream that fetches chunks sequentially and slices.
  const baleIds = ids;
  const envRef = env;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let pos = 0; // current byte position in whole file
        for (let c = 0; c < row.chunks; c++) {
          const chunkStart = c * chunkSize;
          const chunkEnd = Math.min((c + 1) * chunkSize, row.size);
          // skip chunks entirely before range
          if (chunkEnd <= start) { pos = chunkEnd; continue; }
          if (chunkStart >= end) break;

          const baleId = baleIds[c];
          if (!baleId) throw new Error('MISSING_CHUNK');
          const info = await guard(() => baleGetFile(envRef, baleId)) as { file_path: string; file_size?: number };
          const res = await downloadStream(envRef, info.file_path, null);
          if (!res.ok || !res.body) throw new Error('BALE_DOWNLOAD_FAILED');
          const reader = res.body.getReader();
          let chunkPos = 0; // position within this chunk
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            // slice value to range
            const valStart = chunkStart + chunkPos;
            const valEnd = valStart + value.byteLength;
            const sliceStart = Math.max(0, start - valStart);
            const sliceEnd = Math.min(value.byteLength, end - valStart);
            if (sliceStart < sliceEnd) {
              controller.enqueue(value.slice(sliceStart, sliceEnd));
            }
            chunkPos += value.byteLength;
            pos = chunkStart + chunkPos;
          }
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': row.is_public ? 'public, max-age=31536000, immutable' : 'private, no-store',
    'Content-Disposition': download ? `attachment; filename="${row.name}"` : 'inline',
    ...((() => { const h: Record<string, string> = {}; if (row.checksum) h['ETag'] = `"${row.id}-${row.checksum}"`; return h; })()),
  };
  if (status === 206) {
    headers['Content-Range'] = `bytes ${start}-${end - 1}/${row.size}`;
    headers['Content-Length'] = String(end - start);
  } else {
    headers['Content-Length'] = String(row.size);
  }

  // handle conditional
  const inm = request.headers.get('If-None-Match');
  if (inm && row.checksum && inm === `"${row.id}-${row.checksum}"`) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(stream, { status, headers });
}
