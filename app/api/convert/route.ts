export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { ratelimit } from '@/lib/ratelimit'
import { redis } from '@/lib/redis'
import { validateUrl, scrapeMessages } from '@/lib/scraper'
import { CACHE_TTL_SECONDS } from '@/constants/app'
import type { Message } from '@/types/chatgpt'

function getIp(req: NextRequest): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  )
}

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limit
    const ip = getIp(req)
    const { success, reset } = await ratelimit.limit(ip)
    if (!success) {
      // reset is Unix ms timestamp — convert to seconds for Retry-After header
      const retryAfter = Math.ceil((reset - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Too many requests. Try again in a moment.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    // 2. Parse body — wrap separately to return 400 on malformed JSON, not 500
    let url: string
    try {
      const body = await req.json()
      url = typeof body?.url === 'string' ? body.url.trim() : ''
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON with a url field.' },
        { status: 400 }
      )
    }

    // 3. Validate URL (length + regex + hostname verify — three-layer SSRF guard)
    if (!validateUrl(url)) {
      return NextResponse.json(
        {
          error: 'Invalid URL. Only public ChatGPT share links are supported.',
        },
        { status: 400 }
      )
    }

    // 4. Cache hit check — best-effort. A missing or unreachable Redis must
    //    never break conversion, so cache reads are wrapped and failures ignored.
    const uuid = url.split('/').pop()!
    const cacheKey = `chatgpt:${uuid}`
    if (redis) {
      try {
        const cached = await redis.get<string>(cacheKey)
        if (cached) {
          // Upstash auto-deserializes JSON; tolerate both string and object.
          const parsed: unknown = typeof cached === 'string' ? JSON.parse(cached) : cached
          // Back-compat: older entries cached a bare Message[]; newer entries
          // cache { messages, title }. Normalize both to the same response.
          const messages: Message[] = Array.isArray(parsed)
            ? (parsed as Message[])
            : ((parsed as { messages?: Message[] }).messages ?? [])
          const title = Array.isArray(parsed)
            ? undefined
            : (parsed as { title?: string }).title
          return NextResponse.json({ messages, title, fromCache: true })
        }
      } catch (cacheErr) {
        console.warn('[/api/convert] Cache read failed, continuing:', cacheErr)
      }
    }

    // 5. Scrape
    let messages: Message[]
    let title: string | undefined
    try {
      const result = await scrapeMessages(url)
      messages = result.messages
      title = result.title
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string; name?: string }
      if (e.status === 403)
        return NextResponse.json(
          { error: 'Chat is private. Make it public share first.' },
          { status: 403 }
        )
      if (e.status === 404)
        return NextResponse.json({ error: 'Chat not found or deleted.' }, { status: 404 })
      if (e.message === 'PARSE_ERROR')
        return NextResponse.json(
          { error: 'ChatGPT structure changed. Contact developer.' },
          { status: 500 }
        )
      if (e.name === 'AbortError' || e.message?.startsWith('AbortError'))
        return NextResponse.json(
          { error: 'ChatGPT is slow to respond. Try again.' },
          { status: 500 }
        )
      throw err
    }

    // 6. Cache result — best-effort, never block the response on a cache write.
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify({ messages, title }), {
          ex: CACHE_TTL_SECONDS,
        })
      } catch (cacheErr) {
        console.warn('[/api/convert] Cache write failed, continuing:', cacheErr)
      }
    }

    return NextResponse.json({ messages, title, fromCache: false })
  } catch (err) {
    console.error('[/api/convert] Unexpected error:', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
