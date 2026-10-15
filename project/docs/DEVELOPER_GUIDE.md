# Developer Guide

## Architecture
See ARCHITECTURE.md. Frontend on Pages, Worker on Workers, D1 database, Bale storage.

## Local dev
```
npm install
wrangler dev
```
Open http://localhost:8787. Frontend served from /frontend? For Pages functions, use `wrangler pages dev`.

## Code structure
- frontend/: HTML/CSS/JS
- worker/src/: TypeScript Worker
- functions/: Pages Functions proxy
- schema.sql: D1 schema

## Adding a feature
1. Add route in worker/src/routes.
2. Register in index.ts.
3. Add UI in frontend.
4. Update docs/API.md.

## DB migrations
Edit schema.sql, run `wrangler d1 execute file-host-db --file=./schema.sql`.

## Logs
`wrangler tail` for real-time logs.

## Env vars
See .env.example.
