import {
  USER_AGENTS,
  CHATGPT_FETCH_HEADERS,
  MAX_URL_LENGTH,
  FETCH_TIMEOUT_MS,
  MAX_EMBEDDED_IMAGES,
  MAX_IMAGE_BYTES,
  IMAGE_FETCH_TIMEOUT_MS,
} from '@/constants/app'
import type { Message, ContentBlock } from '@/types/chatgpt'

// Strict UUID-format regex — only chatgpt.com/share/* is ever fetched
const CHATGPT_URL_REGEX =
  /^https:\/\/chatgpt\.com\/share\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Validate a ChatGPT share URL.
 *
 * Three-layer SSRF protection:
 * 1. Length check — reject before any parsing
 * 2. Regex check — strict UUID format, https only, chatgpt.com host only
 * 3. URL parse check — verify hostname and protocol after regex
 *    to guard against Unicode normalization and encoded bypass tricks
 */
export function validateUrl(url: string): boolean {
  // Layer 1: length guard
  if (!url || url.length > MAX_URL_LENGTH) return false

  // Layer 2: strict regex
  if (!CHATGPT_URL_REGEX.test(url)) return false

  // Layer 3: parse and verify hostname/protocol explicitly
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (parsed.hostname !== 'chatgpt.com') return false
  } catch {
    return false
  }

  return true
}

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] as string
}

async function fetchWithTimeout(url: string, attempt = 1): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // A single coherent Chrome fingerprint — see CHATGPT_FETCH_HEADERS. Sparse
      // headers from a Worker IP score as a bot and earn a 403 challenge.
      headers: CHATGPT_FETCH_HEADERS,
    })

    // A 403 from chatgpt.com is ambiguous: it can mean the share is genuinely
    // private/disabled, OR Cloudflare Bot Management served a challenge page to
    // our Worker. Distinguish them so the user gets an accurate message — a
    // challenge is transient ("try again"), a private chat is not. Cloudflare
    // tags challenges with a `cf-mitigated: challenge` header and/or a body
    // carrying the challenge-platform script; absent those, treat it as private.
    if (res.status === 403) {
      const cfMitigated = res.headers.get('cf-mitigated')?.toLowerCase()
      let body = ''
      try {
        body = await res.text()
      } catch {
        /* body unreadable — fall through to header-only classification */
      }
      const challenged =
        cfMitigated === 'challenge' ||
        /cdn-cgi\/challenge-platform|_cf_chl_opt|just a moment\.\.\.|attention required|enable javascript and cookies to continue/i.test(
          body
        )
      throw Object.assign(new Error(challenged ? 'BOT_BLOCKED' : 'FORBIDDEN'), {
        status: 403,
        code: challenged ? 'BOT_BLOCKED' : 'PRIVATE',
      })
    }
    if (res.status === 404) throw Object.assign(new Error('NOT_FOUND'), { status: 404 })
    if (!res.ok) throw new Error(`HTTP_${res.status}`)

    return await res.text()
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError')
    if (isAbort && attempt === 1) return fetchWithTimeout(url, 2)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Fallback for when ChatGPT's Cloudflare Bot Management blocks the Worker's
// datacenter egress IP. Routes the fetch through ScrapingAnt's residential-IP
// proxy. Only called when SCRAPINGANT_API_KEY is set and the direct fetch fails
// with BOT_BLOCKED — never used for every request (that would waste free quota).
async function fetchViaProxy(url: string): Promise<string> {
  const apiKey = process.env.SCRAPINGANT_API_KEY
  if (!apiKey) {
    throw Object.assign(new Error('BOT_BLOCKED'), { code: 'BOT_BLOCKED' })
  }
  const proxyUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(url)}&x-api-key=${apiKey}&browser=false`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(proxyUrl, { signal: controller.signal })
    if (!res.ok) throw Object.assign(new Error('BOT_BLOCKED'), { code: 'BOT_BLOCKED' })
    const html = await res.text()
    if (!html) throw Object.assign(new Error('BOT_BLOCKED'), { code: 'BOT_BLOCKED' })
    return html
  } finally {
    clearTimeout(timer)
  }
}

/**
 * ChatGPT share pages are client-rendered: the HTML contains NO
 * [data-message-author-role] DOM nodes. The conversation is embedded as JSON
 * inside `window.__reactRouterContext.streamController.enqueue("…")` calls,
 * encoded with React Router's `turbo-stream` format (an index-referenced graph
 * where repeated keys/values are deduplicated). We decode that graph below.
 *
 * TODO: verify embedding format — last checked 2026-05-31
 */

// Extract every streamController.enqueue("<js-string>") payload, honoring escapes.
function extractEnqueuedChunks(html: string): string[] {
  const chunks: string[] = []
  const marker = 'streamController.enqueue('
  let from = 0
  for (;;) {
    const start = html.indexOf(marker, from)
    if (start === -1) break
    let i = start + marker.length
    if (html[i] !== '"') {
      from = i
      continue
    }
    // Walk the JS string literal from the opening quote to its unescaped close.
    let buf = '"'
    i += 1
    for (; i < html.length; i++) {
      const c = html[i]
      buf += c
      if (c === '\\') {
        buf += html[i + 1] ?? ''
        i += 1
        continue
      }
      if (c === '"') break
    }
    try {
      chunks.push(JSON.parse(buf) as string)
    } catch {
      /* skip malformed chunk */
    }
    from = i + 1
  }
  return chunks
}

// Hydrate a turbo-stream flattened array back into its object graph.
// Arrays hold child indices; objects are `{ "_<keyIndex>": valueIndex }`;
// typed markers like ["P", n] (promise) / ["D", n] (date) carry one payload index.
function unflatten(values: unknown[]): unknown {
  const cache = new Map<number, unknown>()

  function hydrate(index: number): unknown {
    if (typeof index !== 'number' || index < 0) return undefined
    if (cache.has(index)) return cache.get(index)

    const v = values[index]
    if (v === null || typeof v !== 'object') {
      cache.set(index, v)
      return v
    }

    if (Array.isArray(v)) {
      // Typed marker (single-letter tag + one payload index).
      if (typeof v[0] === 'string' && v.length === 2 && /^[A-Za-z]$/.test(v[0])) {
        const target = v[1] as number
        // Self-referencing "P" = pending promise resolved by a later stream
        // line; irrelevant to the transcript.
        const inner = target === index ? undefined : hydrate(target)
        cache.set(index, inner)
        return inner
      }
      const arr: unknown[] = []
      cache.set(index, arr)
      for (const child of v) arr.push(hydrate(child as number))
      return arr
    }

    const obj: Record<string, unknown> = {}
    cache.set(index, obj)
    for (const k in v as Record<string, unknown>) {
      const keyIdx = Number(k[0] === '_' ? k.slice(1) : k)
      const realKey = hydrate(keyIdx)
      obj[String(realKey)] = hydrate((v as Record<string, number>)[k] as number)
    }
    return obj
  }

  return hydrate(0)
}

// Depth-first search for the first object that *owns* `key`, returning that
// container object (not the value). Used to read sibling fields together, e.g.
// the conversation `title` that sits next to `linear_conversation`.
function findObjectWith(
  obj: unknown,
  key: string,
  seen = new Set<unknown>()
): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return undefined
  seen.add(obj)
  if (!Array.isArray(obj) && key in (obj as Record<string, unknown>)) {
    return obj as Record<string, unknown>
  }
  for (const k in obj as Record<string, unknown>) {
    const r = findObjectWith((obj as Record<string, unknown>)[k], key, seen)
    if (r !== undefined) return r
  }
  return undefined
}

// Split assistant markdown into text + fenced-code ContentBlocks.
function markdownToBlocks(md: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const fence = /```([\w+-]*)\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = fence.exec(md))) {
    const before = md.slice(last, m.index).trim()
    if (before) blocks.push({ type: 'text', value: before })
    const language = m[1] || undefined
    const code = (m[2] ?? '').replace(/\n$/, '')
    if (code.trim()) blocks.push({ type: 'code', value: code, language })
    last = fence.lastIndex
  }
  const tail = md.slice(last).trim()
  if (tail) blocks.push({ type: 'text', value: tail })
  return blocks
}

/* -------------------------------------------------------------------------- */
/*  Images — ChatGPT web-search "image_group" content references               */
/* -------------------------------------------------------------------------- */

// One image inside an image_result reference. ChatGPT serves these from its own
// CDN (images.openai.com): `content_url` is the full-size copy, `thumbnail_url`
// a smaller inline one, and `original_content_url` the source-site image.
interface RawImageResult {
  content_url?: string
  thumbnail_url?: string
  original_content_url?: string
  content_size?: { width?: number; height?: number }
  thumbnail_size?: { width?: number; height?: number }
  title?: string
}

// A content reference. The image carousel ChatGPT renders inline is a reference
// whose `type` is "image_group" and whose `matched_text` placeholder occupies
// the original message text between `start_idx` and `end_idx`.
interface RawContentReference {
  type?: string
  start_idx?: number
  end_idx?: number
  images?: Array<{ image_result?: RawImageResult; image_search_query?: string }>
}

// A positioned run of images extracted from one image_group reference, anchored
// to the character range it replaces in the source markdown.
interface PositionedImageGroup {
  start: number
  end: number
  images: Array<{ url: string; alt?: string; width?: number; height?: number }>
}

// Pull every image_group out of a message's content_references, resolving each
// entry to a single best URL (full-size first, then thumbnail, then the source
// site) plus its pixel dimensions and a caption.
function extractImageGroups(refs: unknown[]): PositionedImageGroup[] {
  const groups: PositionedImageGroup[] = []
  for (const r of refs) {
    const ref = r as RawContentReference
    if (!Array.isArray(ref.images) || ref.images.length === 0) continue
    if (typeof ref.start_idx !== 'number' || typeof ref.end_idx !== 'number') continue
    if (ref.end_idx < ref.start_idx) continue

    const images: PositionedImageGroup['images'] = []
    for (const im of ref.images) {
      const ir = im?.image_result
      if (!ir) continue
      const url = ir.content_url || ir.thumbnail_url || ir.original_content_url
      // Only embed real http(s) images; the Worker's global_fetch_strictly_public
      // flag additionally blocks any fetch to private/internal addresses (SSRF).
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue
      const size = ir.content_size || ir.thumbnail_size
      images.push({
        url,
        alt: ir.title || im.image_search_query || undefined,
        width: typeof size?.width === 'number' ? size.width : undefined,
        height: typeof size?.height === 'number' ? size.height : undefined,
      })
    }
    if (images.length) groups.push({ start: ref.start_idx, end: ref.end_idx, images })
  }
  return groups.sort((a, b) => a.start - b.start)
}

/**
 * Build the ordered content blocks for an assistant turn, splicing image groups
 * into the surrounding prose at their exact source position. The text outside
 * the image placeholders flows through the normal markdown block parser, so
 * ordering, headings, lists and code are all preserved relative to the images.
 *
 * Exported for unit testing; `rawText` must be the message's single text part
 * (image offsets index into it) and `refs` its `content_references` array.
 */
export function interleaveImages(rawText: string, refs: unknown[]): ContentBlock[] {
  const groups = extractImageGroups(refs)
  if (groups.length === 0) return markdownToBlocks(rawText)

  const blocks: ContentBlock[] = []
  let cursor = 0
  for (const g of groups) {
    // Defensive: skip a group that overlaps an earlier one so we never slice
    // the text backwards (offsets from ChatGPT should already be disjoint).
    if (g.start < cursor) continue
    blocks.push(...markdownToBlocks(rawText.slice(cursor, g.start)))
    for (const img of g.images) {
      blocks.push({
        type: 'image',
        url: img.url,
        alt: img.alt,
        width: img.width,
        height: img.height,
      })
    }
    cursor = g.end
  }
  blocks.push(...markdownToBlocks(rawText.slice(cursor)))
  return blocks
}

// Format a ChatGPT `create_time` (Unix seconds) into "YYYY-MM-DD HH:MM:SS".
// Returns undefined when absent so the PDF simply omits the timestamp.
function formatTimestamp(createTime?: number): string | undefined {
  if (typeof createTime !== 'number' || !Number.isFinite(createTime)) return undefined
  const d = new Date(createTime * 1000)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

type RawContent = { content_type?: string; parts?: unknown[]; text?: string }

function contentToText(content: RawContent | undefined): string {
  if (!content) return ''
  if (Array.isArray(content.parts)) {
    return content.parts
      .filter((p): p is string => typeof p === 'string')
      .join('\n\n')
      .trim()
  }
  if (typeof content.text === 'string') return content.text.trim()
  return ''
}

export interface ScrapeResult {
  messages: Message[]
  // The conversation's own title, as set by ChatGPT. Absent on older shares
  // or when the field is missing; callers fall back to a derived title.
  title?: string
}

// Normalize a raw title: collapse whitespace, strip control chars, clamp length.
function sanitizeTitle(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return undefined
  return t.length > 200 ? `${t.slice(0, 200)}…` : t
}

// Fetch one image and return it as a base64 data URI, or null on any failure
// (timeout, non-image, oversize, network error). Failures are swallowed so a
// single broken image never aborts the whole conversion.
async function fetchImageAsDataUri(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': getRandomUA(), Accept: 'image/*' },
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null
    const base64 = Buffer.from(buf).toString('base64')
    return `data:${contentType};base64,${base64}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Replace every image block's remote URL with an inlined base64 data URI,
 * fetched server-side. This is what makes images render in the client-side PDF:
 * react-pdf would otherwise hit cross-origin/CORS failures fetching them in the
 * browser. Unique URLs are fetched once (deduped) and in parallel, bounded by
 * MAX_EMBEDDED_IMAGES. Images that fail to fetch are dropped from their message
 * so the PDF omits them cleanly instead of rendering a broken box. Mutates
 * `messages` in place.
 */
async function embedImagesInMessages(messages: Message[]): Promise<void> {
  const urls = new Set<string>()
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === 'image' && !b.url.startsWith('data:')) urls.add(b.url)
    }
  }
  if (urls.size === 0) return

  const limited = Array.from(urls).slice(0, MAX_EMBEDDED_IMAGES)
  const resolved = new Map<string, string>()
  await Promise.allSettled(
    limited.map(async (u) => {
      const dataUri = await fetchImageAsDataUri(u)
      if (dataUri) resolved.set(u, dataUri)
    })
  )

  for (const m of messages) {
    m.content = m.content.filter((b) => {
      if (b.type !== 'image') return true
      if (b.url.startsWith('data:')) return true
      const dataUri = resolved.get(b.url)
      if (!dataUri) return false // un-fetchable or beyond the cap → drop
      b.url = dataUri
      return true
    })
  }
}

export async function scrapeMessages(url: string): Promise<ScrapeResult> {
  let html: string
  try {
    html = await fetchWithTimeout(url)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'BOT_BLOCKED') {
      html = await fetchViaProxy(url)
    } else {
      throw err
    }
  }

  const chunks = extractEnqueuedChunks(html)
  if (chunks.length === 0) {
    throw Object.assign(new Error('PARSE_ERROR'), { status: 500 })
  }

  // The first stream line carries the synchronous loader data (the conversation).
  const firstLine = chunks.join('').split('\n')[0] ?? ''
  let root: unknown
  try {
    root = unflatten(JSON.parse(firstLine) as unknown[])
  } catch {
    throw Object.assign(new Error('PARSE_ERROR'), { status: 500 })
  }

  // The container holding `linear_conversation` also carries the `title`.
  const container = findObjectWith(root, 'linear_conversation')
  const linear = container?.linear_conversation
  if (!Array.isArray(linear)) {
    throw Object.assign(new Error('PARSE_ERROR'), { status: 500 })
  }
  const title = sanitizeTitle(container?.title)

  const messages: Message[] = []
  for (const node of linear) {
    const msg = (node as { message?: unknown })?.message as
      | {
          author?: { role?: string }
          content?: RawContent
          create_time?: number
          metadata?: {
            is_visually_hidden_from_conversation?: boolean
            content_references?: unknown[]
          }
        }
      | undefined
    if (!msg) continue
    if (msg.metadata?.is_visually_hidden_from_conversation) continue

    const role = msg.author?.role
    if (role !== 'user' && role !== 'assistant') continue

    const content = msg.content
    const isCode = content?.content_type === 'code'
    const text = contentToText(content)
    if (!text) continue

    let blocks: ContentBlock[]
    if (isCode) {
      blocks = [{ type: 'code', value: text }]
    } else {
      // Image carousels live in metadata.content_references and index into the
      // message's single text part. When present, interleave them into the
      // prose; otherwise fall back to the plain markdown block parser.
      const refs = msg.metadata?.content_references
      const parts = content?.parts
      const rawSingle =
        Array.isArray(parts) && parts.length === 1 && typeof parts[0] === 'string'
          ? parts[0]
          : undefined
      blocks =
        role === 'assistant' && rawSingle !== undefined && Array.isArray(refs)
          ? interleaveImages(rawSingle, refs)
          : markdownToBlocks(text)
    }
    if (blocks.length === 0) continue

    messages.push({ role, content: blocks, timestamp: formatTimestamp(msg.create_time) })
  }

  if (messages.length === 0) {
    throw Object.assign(new Error('PARSE_ERROR'), { status: 500 })
  }

  // Download every referenced image and inline it as a base64 data URI so the
  // client-side PDF renderer can embed it without cross-origin restrictions.
  await embedImagesInMessages(messages)

  return { messages, title }
}
