// Bale Bot API client with circuit breaker awareness and streaming.

import type { Env, BaleResponse, BaleDocument } from '../types/index.js';
import { BALE_DELAY_MS } from '../types/index.js';

const BASE = 'https://tapi.bale.ai';

export function apiUrl(env: Env, method: string): string {
  return `${BASE}/bot${env.BALE_BOT_TOKEN}/${method}`;
}

export async function sendDocument(
  env: Env,
  data: ReadableStream<Uint8Array> | Blob | ArrayBuffer,
  filename: string,
  caption: string,
  signal?: AbortSignal
): Promise<BaleDocument> {
  const form = new FormData();
  form.append('chat_id', env.BALE_CHAT_ID);
  const blob = data instanceof Blob ? data : new Blob([data as ArrayBuffer]);
  form.append('document', blob, filename);
  form.append('caption', caption);

  const res = await fetch(apiUrl(env, 'sendDocument'), {
    method: 'POST',
    body: form,
    signal,
  });
  if (!res.ok) throw new Error(`Bale sendDocument HTTP ${res.status}`);
  const json = (await res.json()) as BaleResponse<{ document: BaleDocument }>;
  if (!json.ok || !json.result?.document) throw new Error(json.description || 'Bale sendDocument failed');
  // small delay to be polite
  await new Promise((r) => setTimeout(r, BALE_DELAY_MS));
  return json.result.document;
}

export async function getFile(env: Env, fileId: string, signal?: AbortSignal): Promise<{ file_path: string; file_size?: number }> {
  const res = await fetch(apiUrl(env, 'getFile'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
    signal,
  });
  if (!res.ok) throw new Error(`Bale getFile HTTP ${res.status}`);
  const json = (await res.json()) as BaleResponse<{ file_id: string; file_path: string; file_size?: number }>;
  if (!json.ok || !json.result?.file_path) throw new Error(json.description || 'Bale getFile failed');
  return { file_path: json.result.file_path, file_size: json.result.file_size };
}

export function downloadUrl(env: Env, filePath: string): string {
  return `${BASE}/file/bot${env.BALE_BOT_TOKEN}/${filePath}`;
}

export async function downloadStream(env: Env, filePath: string, rangeHeader?: string | null, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {};
  if (rangeHeader) headers['Range'] = rangeHeader;
  const res = await fetch(downloadUrl(env, filePath), { headers, signal });
  return res;
}
