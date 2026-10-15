// Shared types for the Worker.

export interface Env {
  DB: D1Database;
  BALE_BOT_TOKEN: string;
  BALE_CHAT_ID: string;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
  language: string;
}

export interface Session {
  id: string;
  user_id: number;
  created_at: number;
  expires_at: number;
}

export interface FileRecord {
  id: string;
  user_id: number | null;
  name: string;
  size: number;
  mime_type: string | null;
  chunks: number;
  chunk_ids: string; // JSON array of bale file_ids
  is_public: number;
  is_complete: number;
  checksum: string | null;
  created_at: number;
}

export interface UploadSession {
  id: string;
  file_id: string;
  file_hash: string;
  total_chunks: number;
  received_chunks: number;
  status: string;
  created_at: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface BaleDocument {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export interface BaleResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export interface ChunkMeta {
  index: number;
  baleFileId: string;
  hash: string;
  size: number;
}

export const CHUNK_SIZE = 40 * 1024 * 1024; // 40 MB
export const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50 GB
export const WARN_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_BODY_SIZE = 45 * 1024 * 1024; // 45 MB
export const BALE_DELAY_MS = 200;
export const BALE_MAX_PARALLEL = 3;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const RATE_LIMITS = {
  login: { max: 5, window: 60 },
  register: { max: 3, window: 60 },
  uploadChunk: { max: 60, window: 60 },
  publicApi: { max: 100, window: 60 },
  fileLink: { max: 1000, window: 60 },
} as const;
