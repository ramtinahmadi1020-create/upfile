# Architecture

## Overview
- Frontend: Cloudflare Pages (HTML/CSS/Vanilla JS)
- Backend: Cloudflare Workers (TypeScript)
- DB: Cloudflare D1 (SQLite, WAL)
- Storage: Bale Bot API (chunks)
- No R2

## Data flow (upload chunk)
1. Browser splits file into 40MB chunks, computes SHA-256 per chunk + whole file.
2. POST /api/upload/chunk (multipart) → Pages Function proxies to Worker.
3. Worker streams chunk to Bale sendDocument.
4. Bale returns file_id; Worker stores in D1 (chunk_ids JSON array) atomically.
5. Worker responds success.

## File access
Worker looks up chunk_ids, fetches needed chunks from Bale, streams to client with Range support.

## High-load
- Stateless Workers scale horizontally.
- D1 prepared statements + indexes.
- Rate limiting in D1 (sliding window per IP).
- Circuit breaker for Bale API (5 failures → 30s open).
- In-memory + Cache API caching for public lists.
- Streaming (no full buffering) to respect 128MB memory.

## Why no R2
Cost/availability; Bale provides free storage via bot API. Trade-off: extra proxy hop and chunking.

## Why 40MB chunks
Bale sendDocument limit ~50MB; 40MB leaves margin.

## Concurrency
- Logical locks in D1 with TTL prevent lost updates on chunk_ids.
- Optimistic retry on conflicts.
