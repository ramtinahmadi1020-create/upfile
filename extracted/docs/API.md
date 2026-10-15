# API Documentation

Base URL: `https://example.com/api`

All responses: `{ "success": true|false, "data": ..., "error": { "code", "message" } }`

## Auth
### POST /api/auth/register
Body: `{ "username", "password", "password2" }`
Response 200: `{ success, data: { user_id, username, csrf_token } }`

### POST /api/auth/login
Body: `{ "username", "password" }`
Response 200: `{ success, data: { user_id, username, csrf_token } }` + Set-Cookie session

### POST /api/auth/logout
Response 200: `{ success, data: { logged_out: true } }`

### GET /api/auth/me
Response 200: `{ success, data: { user_id, username, language } }`

## Upload
### POST /api/upload/init
Body: `{ name, size, mime_type, file_hash, total_chunks, is_public? }`
Response: `{ success, data: { session_id, file_id, existing_chunks } }`

### POST /api/upload/chunk (multipart)
Fields: session_id, chunk_index, chunk_hash, data
Response: `{ success, data: { chunk_index, received_chunks, bale_file_id } }`

### POST /api/upload/complete
Body: `{ session_id, final_checksum }`
Response: `{ success, data: { file_id, url } }`

### GET /api/upload/status/:session_id
Response: `{ success, data: { status, received_chunks, total_chunks, file_id } }`

### POST /api/upload (single, <=45MB)
multipart field `file`
Response: `{ success, data: { file_id, url } }`

## Files
### GET /api/files (auth)
### GET /api/files/:id
### DELETE /api/files/:id (owner)

## Public
### GET /api/public/list
### GET /api/public/info/:id

### GET /api/list (alias)
### GET /api/info/:id (alias)
### GET /api/file/:id (redirects to /f/:id)

## File access
### GET /f/:id (inline proxy, supports Range)
### GET /d/:id (download)

## Rate limits
- login: 5/min
- register: 3/min
- upload chunk: 60/min per IP
- public API: 100/min per IP
- file links: 1000/min per IP

## Error codes
INVALID_USERNAME, INVALID_PASSWORD, PASSWORD_MISMATCH, USERNAME_TAKEN, INVALID_CREDENTIALS, RATE_LIMITED, INVALID_SIZE, INVALID_MIME, MISSING_HASH, INVALID_CHUNKS, SESSION_NOT_FOUND, SESSION_COMPLETE, FILE_NOT_FOUND, INVALID_INDEX, CHUNK_CORRUPTED, LOCKED, INCOMPLETE, NOT_FOUND, FORBIDDEN, UNAUTHORIZED, BODY_TOO_LARGE, BALE_UNAVAILABLE, UPLOAD_FAILED, INTERNAL_ERROR
