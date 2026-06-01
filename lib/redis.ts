import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

// True only when both Upstash credentials are present.
// When false, caching and Upstash-backed rate limiting are skipped so the
// app still works (e.g. local dev without an Upstash account).
export const isRedisConfigured = Boolean(url && token)

// Singleton — import this instance everywhere. Never instantiate Redis inline.
// null when env vars are missing so callers can degrade gracefully instead of
// throwing on every request.
export const redis = isRedisConfigured ? new Redis({ url: url!, token: token! }) : null
