// CORS helpers. In production Pages proxies so CORS not strictly needed, but kept.

import type { Env } from '../types/index.js';

export function corsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export function handlePreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
}
