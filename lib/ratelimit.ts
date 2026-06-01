import { Ratelimit } from '@upstash/ratelimit'
import { redis, isRedisConfigured } from './redis'
import { RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW } from '@/constants/app'

const cache = new Map<string, number>()

// Always-allow limiter used when rate limiting is bypassed (local dev) or
// when Upstash is not configured. Shape matches Ratelimit.limit()'s result.
const bypassLimiter = {
  limit: async (_id: string) => ({
    success: true,
    limit: RATE_LIMIT_REQUESTS,
    remaining: RATE_LIMIT_REQUESTS,
    // reset is Unix timestamp in milliseconds — used for Retry-After header
    reset: Date.now() + 60_000,
    pending: Promise.resolve(),
  }),
}

// Dev bypass: skip Upstash calls during local development to avoid
// exhausting free tier on every hot reload.
// IMPORTANT: Never deploy with NODE_ENV=development in production.
const createRatelimit = () => {
  // Bypass when developing locally or when Upstash creds are absent — a null
  // redis would otherwise throw inside Ratelimit on every request.
  if (process.env.NODE_ENV === 'development' || !isRedisConfigured || !redis) {
    return bypassLimiter
  }
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW),
    ephemeralCache: cache,
    prefix: 'chatgpt-as-pdf:rl',
  })
}

// Singleton — do not call createRatelimit() inside route handlers
export const ratelimit = createRatelimit()
