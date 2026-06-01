# Rate Limiting

- **Algorithm:** Sliding Window via `@upstash/ratelimit`.
- **Limit:** 10 requests / 60s per IP.
- **Identifier:** `CF-Connecting-IP` → `x-forwarded-for` → `127.0.0.1`.
- **On exceeded:** HTTP 429 + `{ error: "..." }` + `Retry-After: <seconds>`.
- **`Retry-After`:** `Math.ceil((reset - Date.now()) / 1000)` where `reset` is
  a Unix ms timestamp.
- **Bypass:** A no-op `bypassLimiter` (always `success: true`, no Upstash call)
  is used when `NODE_ENV === 'development'` **or** when Upstash is not configured
  (`!isRedisConfigured`/`!redis`). This keeps local dev off the free tier and
  lets the app run with no Redis at all.
- **Ephemeral cache:** `new Map()` (`ephemeralCache`) reduces Upstash
  round-trips within the same Worker instance.
- **Key prefix:** `chatgpt-as-pdf:rl` (so app keys don't collide in shared Redis).
- **Singleton:** Built once at module load in `lib/ratelimit.ts`. Do not call
  `createRatelimit()` inside route handlers.

> ⚠️ Never deploy with `NODE_ENV=development` — it disables rate limiting in
> production.
