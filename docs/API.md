# API

The app exposes exactly one endpoint. It is invoked only from
`hooks/useChatGPTScrape.ts` — never call it directly from a component.

## `POST /api/convert`

Runs on the Node.js runtime (`export const runtime = 'nodejs'`). Validates the
URL, applies rate limiting and caching, scrapes the conversation, and returns
the parsed turns plus the conversation title. The PDF itself is **not** produced
here — it is rendered client-side from this response.

**Request body:** `{ "url": string }` — a public `https://chatgpt.com/share/<uuid>` link.

**Response (200):**

```jsonc
{
  "messages": [
    /* Message[] — see shape below */
  ],
  "title": "How to build a REST API", // optional; omitted when the share has none
  "fromCache": true, // true on a Redis cache hit, false otherwise
}
```

- `title` is the conversation's own ChatGPT title when present. It may be absent
  (older shares / missing field); the client then derives a fallback from the
  first user message.
- `fromCache` reflects whether the result came from the Upstash cache. When
  Upstash is not configured it is always `false`.

### Status Codes

| HTTP | Condition                  | Message                                                                             |
| ---- | -------------------------- | ----------------------------------------------------------------------------------- |
| 400  | Invalid/missing JSON body  | "Invalid request body. Expected JSON with a url field."                             |
| 400  | URL fails validation       | "Invalid URL. Only public ChatGPT share links are supported."                       |
| 403  | Share is genuinely private | "This chat is private. Open the share link and make it public first."               |
| 404  | ChatGPT returned 404       | "Chat not found or deleted."                                                        |
| 429  | Rate limit exceeded        | "Too many requests. Try again in a moment."                                         |
| 500  | Fetch timeout              | "ChatGPT is slow to respond. Try again."                                            |
| 500  | Parse failed               | "ChatGPT structure changed. Contact developer."                                     |
| 500  | Unexpected                 | "An unexpected error occurred."                                                     |
| 503  | ChatGPT bot challenge      | "ChatGPT is temporarily blocking automated requests. Please try again in a moment." |

> **403 vs 503 — both originate from a ChatGPT `403`.** `chatgpt.com` sits behind
> Cloudflare Bot Management, and a server-side `403` is ambiguous: it can mean the
> share is genuinely private/disabled, **or** that Cloudflare served our Worker a
> bot challenge. `lib/scraper.ts` distinguishes them — a challenge (detected via a
> `cf-mitigated: challenge` header or a challenge-platform body) is reported as a
> transient **503** with `Retry-After: 15`; anything else is treated as a genuine
> private chat and surfaced as **403**. See [SCRAPING.md](./SCRAPING.md).
>
> Note: 429 responses include a `Retry-After: <seconds>` header calculated as
> `Math.ceil((reset - Date.now()) / 1000)`; 503 responses carry `Retry-After: 15`.

### Message Shape

```ts
type ContentBlock =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string; language?: string }
  // `url` is a base64 `data:` URI: the server inlines web-search images before
  // responding. `width`/`height` are the source pixel dimensions when known.
  | { type: 'image'; url: string; alt?: string; width?: number; height?: number }
  | { type: 'latex'; value: string }

interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock[]
  timestamp?: string
}
```

The scraper emits `text`, `code`, and `image` blocks. `image` blocks come from
web-search `image_group` carousels and arrive with `url` already set to a
self-contained `data:<mime>;base64,…` URI (the server downloads and inlines them
so the client-side PDF renderer needs no cross-origin fetch — see
[SCRAPING.md](./SCRAPING.md)). `latex` is not currently produced by the scraper
but is part of the contract and fully handled by the renderer.
