# Deploy Guide

## Prerequisites
- Cloudflare account (free plan ok)
- Node.js 18+
- Bale account + Bot token + Chat ID

## 1. Get Bale credentials
1. Install Bale app, create account.
2. Search @botfather in Bale.
3. Send /newbot, choose name and username.
4. Receive token like `123456789:ABCdef...` → BALE_BOT_TOKEN
5. Create a private group/channel in Bale.
6. Add bot as admin.
7. Send a message in the group.
8. Call `GET https://tapi.bale.ai/bot{TOKEN}/getUpdates` and extract chat.id → BALE_CHAT_ID (e.g. -1001234567890)

## 2. Create D1 database
```
wrangler d1 create file-host-db
```
Copy database_id into wrangler.toml.

## 3. Apply schema
```
wrangler d1 execute file-host-db --file=./schema.sql
```

## 4. Set secrets
```
wrangler secret put BALE_BOT_TOKEN
wrangler secret put BALE_CHAT_ID
wrangler secret put JWT_SECRET
```
JWT_SECRET must be at least 32 random characters.

## 5. Deploy Worker
```
npm install
npm run deploy
```
Note the workers.dev URL.

## 6. Deploy Pages
- Push repo to GitHub.
- Cloudflare Dashboard → Pages → Create project → connect repo.
- Build settings:
  - Framework preset: None
  - Build command: (empty)
  - Build output directory: `frontend`
  (the `frontend/functions` folder contains the Pages Functions proxy)
- Add env vars: WORKER_URL = worker URL, PUBLIC_URL = site URL.

## 7. Verify
- Visit site, register, upload a small file, open /f/{id}.

## Free plan limits
- 100k requests/day, 10ms CPU per request. Streaming keeps CPU low. Upgrade to Paid ($5/mo) if exceeded.
