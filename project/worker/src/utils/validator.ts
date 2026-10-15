// Input validation & sanitization.

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export function validateUsername(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  if (!USERNAME_RE.test(u)) return null;
  return u;
}

export function validatePassword(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  if (p.length < 6 || p.length > 128) return null;
  return p;
}

export function sanitizeFilename(name: unknown): string {
  if (typeof name !== 'string') return 'file';
  // strip path separators and control chars
  let s = name.replace(/[\/\\]/g, '_').replace(/[\x00-\x1f]/g, '');
  s = s.trim().slice(0, 255);
  if (!s) s = 'file';
  return s;
}

export function isAllowedMime(mime: unknown): boolean {
  if (typeof mime !== 'string') return false;
  const allowed = [
    'image/', 'video/', 'audio/', 'text/', 'application/pdf',
    'application/zip', 'application/json', 'application/octet-stream',
    'application/msword', 'application/vnd.', 'application/x-',
  ];
  return allowed.some((a) => mime.startsWith(a) || mime === a);
}

export function parseJson<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}
