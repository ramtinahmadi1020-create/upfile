// Worker entry point: router + cron cleanup.

import type { Env } from './types/index.js';
import { handleRegister, handleLogin, handleLogout, handleMe } from './routes/auth.js';
import { handleUploadInit, handleUploadChunk, handleUploadComplete, handleUploadStatus } from './routes/upload.js';
import { handleListFiles, handleFileInfo, handleDeleteFile, handlePublicList, handlePublicInfo, handleFileProxy } from './routes/files.js';
import { handleApiUpload, handleApiFile, handleApiList, handleApiInfo } from './routes/api.js';
import { handlePreflight, corsHeaders } from './utils/cors.js';
import { securityHeaders, fail } from './utils/error.js';
import { cleanupExpired } from './services/db.js';
import { logger } from './utils/logger.js';

function pathParts(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function withSecurity(res: Response): Response {
  const h = new Headers(res.headers);
  const sh = securityHeaders();
  for (const [k, v] of Object.entries(sh)) if (!h.has(k)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return handlePreflight(request);

    // cron not here; scheduled handler below
    try {
      let res: Response;
      const parts = pathParts(url);

      // Auth
      if (parts[0] === 'api' && parts[1] === 'auth') {
        if (parts[2] === 'register' && method === 'POST') res = await handleRegister(request, env);
        else if (parts[2] === 'login' && method === 'POST') res = await handleLogin(request, env);
        else if (parts[2] === 'logout' && method === 'POST') res = await handleLogout(request, env);
        else if (parts[2] === 'me' && method === 'GET') res = await handleMe(request, env);
        else res = new Response('Not Found', { status: 404 });
      }
      // Upload
      else if (parts[0] === 'api' && parts[1] === 'upload') {
        if (parts[2] === 'init' && method === 'POST') res = await handleUploadInit(request, env);
        else if (parts[2] === 'chunk' && method === 'POST') res = await handleUploadChunk(request, env);
        else if (parts[2] === 'complete' && method === 'POST') res = await handleUploadComplete(request, env);
        else if (parts[2] === 'status' && parts[3] && method === 'GET') res = await handleUploadStatus(request, env, parts[3]);
        else if (parts.length === 2 && method === 'POST') res = await handleApiUpload(request, env);
        else res = new Response('Not Found', { status: 404 });
      }
      // Files
      else if (parts[0] === 'api' && parts[1] === 'files') {
        if (parts.length === 2 && method === 'GET') res = await handleListFiles(request, env);
        else if (parts[2] && method === 'GET') res = await handleFileInfo(request, env, parts[2]);
        else if (parts[2] && method === 'DELETE') res = await handleDeleteFile(request, env, parts[2]);
        else res = new Response('Not Found', { status: 404 });
      }
      // Public
      else if (parts[0] === 'api' && parts[1] === 'public') {
        if (parts[2] === 'list' && method === 'GET') res = await handlePublicList(request, env);
        else if (parts[2] === 'info' && parts[3] && method === 'GET') res = await handlePublicInfo(request, env, parts[3]);
        else res = new Response('Not Found', { status: 404 });
      }
      // API aliases
      else if (parts[0] === 'api' && parts[1] === 'list') {
        res = await handleApiList(request, env);
      } else if (parts[0] === 'api' && parts[1] === 'info' && parts[2]) {
        res = await handleApiInfo(request, env, parts[2]);
      } else if (parts[0] === 'api' && parts[1] === 'file' && parts[2]) {
        if (method === 'GET') res = await handleApiFile(request, env, parts[2]);
        else res = new Response('Not Found', { status: 404 });
      }
      // File proxy
      else if (parts[0] === 'f' && parts[1]) {
        res = await handleFileProxy(request, env, parts[1], false);
      } else if (parts[0] === 'd' && parts[1]) {
        res = await handleFileProxy(request, env, parts[1], true);
      } else {
        res = new Response('Not Found', { status: 404 });
      }

      // attach cors for api responses (harmless)
      const origin = request.headers.get('Origin');
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(corsHeaders(origin))) h.set(k, v);
      const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
      return withSecurity(out);
    } catch (e) {
      logger.error('unhandled', { err: String(e) });
      return withSecurity(fail('INTERNAL_ERROR', 'Internal server error', 500));
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpired(env));
  },
};
