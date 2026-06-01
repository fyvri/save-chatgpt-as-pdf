# Caching

Caching is **optional and best-effort**. It is active only when Upstash is
configured (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`); otherwise
`redis` is `null` and every request scrapes fresh. Cache reads and writes are
each wrapped in `try/catch` so a missing or unreachable Redis never breaks a
conversion — failures are logged with `console.warn` and the request continues.

- **What's cached:** the JSON string of `{ messages, title }` (not raw HTML).
- **Key:** `chatgpt:{uuid}` — the UUID is taken from the end of the share URL.
- **TTL:** `CACHE_TTL_SECONDS` = 3600 s (1 hour). Set on write via `{ ex: … }`.
- **Hit:** returns `{ messages, title, fromCache: true }`; scraping is skipped.
- **Miss:** scrape → store `{ messages, title }` → return `{ messages, title, fromCache: false }`.
- **Invalidation:** TTL-based only; there is no manual purge endpoint.

## Back-Compatibility

Older cache entries stored a bare `Message[]`. On read, the route normalizes
both shapes: an array is treated as `messages` with no `title`; an object is
read as `{ messages, title }`. Upstash also auto-deserializes JSON, so the read
path tolerates receiving either a string or an already-parsed object.

## Design Notes

- **Why not `unstable_cache`:** It does not persist across stateless Worker
  invocations.
- **Why not Cloudflare KV:** Incompatible with `@upstash/ratelimit`, which
  already requires Upstash Redis. One store keeps things simple.
