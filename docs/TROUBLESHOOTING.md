# Troubleshooting

## Upload fails with BALE_UNAVAILABLE
Bale API circuit breaker open. Wait 30s, retry. Check BALE_BOT_TOKEN/CHAT_ID.

## 413 on upload
File chunk > 45MB body limit. Ensure chunk size 40MB.

## Video won't seek
Range requests require correct Content-Range. Check Worker logs.

## Rate limited (429)
Retry-After header indicates seconds. Reduce request rate.

## D1 errors
Ensure schema applied. Check database_id in wrangler.toml.

## CORS
Pages proxy avoids CORS. If calling Worker directly, set Origin.

## Logs
`wrangler tail` to view real-time. Logs are JSON structured.
