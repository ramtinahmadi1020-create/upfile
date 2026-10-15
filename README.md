# File Host (Bale Storage)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ramtinahmadi1020-create/upfile)
A production-grade file hosting service built on Cloudflare Pages + Workers + D1, storing file chunks in Bale (Iranian messenger) via Bot API. No R2 usage. Supports files up to 50 GB with chunked upload, resume, inline preview, and a public API.

## Features
- Chunked upload (40 MB chunks, up to 50 GB per file)
- Per-file progress: percent, speed, uploaded/total, ETA, chunks
- Multi-file parallel upload (max 3 concurrent)
- Resume after interruption
- Network error retry with exponential backoff + jitter
- Direct links with copy button + toast
- Inline preview: images, HTML5 video with Range requests, others download
- Auth: register/login with PBKDF2-SHA256 (100k iterations), secure cookies
- User profile: username, language switch (fa/en), API section, logout
- Public API (no key): upload, get, list, info, delete (owner)
- i18n: Persian (default) + English, instant switch
- High-load hardening: rate limiting, circuit breaker, caching, streaming
- Security headers, input validation, prepared statements

## Quick Start
1. Install deps: `npm install`
2. Create D1 DB: `wrangler d1 create file-host-db` and put id in `wrangler.toml`
3. Apply schema: `wrangler d1 execute file-host-db --file=./schema.sql`
4. Set secrets: `wrangler secret put BALE_BOT_TOKEN`, `BALE_CHAT_ID`, `JWT_SECRET`
5. Deploy worker: `npm run deploy`
6. Set Pages env: `WORKER_URL`, `PUBLIC_URL`
7. Connect GitHub repo to Cloudflare Pages (build output: frontend, functions)

## Docs
- [API](docs/API.md)
- [Deploy](docs/DEPLOY.md)
- [User Guide](docs/USER_GUIDE.md)
- [Developer Guide](docs/DEVELOPER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## License
MIT
