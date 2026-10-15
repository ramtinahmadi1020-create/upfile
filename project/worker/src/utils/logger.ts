// Structured JSON logger.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function log(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  const entry = { ts: new Date().toISOString(), level, event, ...data };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

export const logger = { debug: (e: string, d?: Record<string, unknown>) => log('debug', e, d), info: (e: string, d?: Record<string, unknown>) => log('info', e, d), warn: (e: string, d?: Record<string, unknown>) => log('warn', e, d), error: (e: string, d?: Record<string, unknown>) => log('error', e, d) };
