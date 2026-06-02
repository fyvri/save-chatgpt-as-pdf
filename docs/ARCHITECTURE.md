# Architecture

A single-page Next.js 15 (App Router) app that turns a public ChatGPT share link
into a polished PDF. The conversation is fetched and parsed **on the server**
(`/api/convert`); the PDF is rendered **in the browser** with
`@react-pdf/renderer`. It is deployed to Cloudflare Workers via OpenNext, with
Upstash Redis providing optional caching and rate limiting.

## Request Flow

```
Browser: user pastes a chatgpt.com/share/<uuid> link → ConvertForm.handleSubmit
  → useChatGPTScrape.convert(url)        (the ONLY caller of /api/convert)
  → POST /api/convert { url }

Server (Node.js runtime, app/api/convert/route.ts):
  → derive client IP (CF-Connecting-IP → x-forwarded-for → 127.0.0.1)
  → rate limit (Upstash sliding window 10 req/60 s; bypassed in dev / no Upstash)
      └─ over limit → 429 + Retry-After
  → parse JSON body            └─ malformed → 400
  → validateUrl(url)           — 3-layer SSRF guard (length → regex → URL parse)
      └─ invalid → 400
  → cache check (Upstash key chatgpt:<uuid>)   [best-effort; errors ignored]
      └─ HIT  → { messages, title, fromCache: true }
  → scrapeMessages(url)        — fetch + turbo-stream decode (see SCRAPING.md)
      ├─ direct fetch first; on BOT_BLOCKED → retry via ScrapingAnt proxy (if key set)
      ├─ interleave web-search image_group carousels into assistant prose
      ├─ embed every referenced image as a base64 data URI (capped, parallel)
      └─ BOT_BLOCKED (no key / proxy failed) → 503 "temporarily blocking, try again"
         403 private (PRIVATE) → "chat is private"   404 → "Chat not found"
         PARSE_ERROR → "structure changed"   AbortError → "slow to respond"
  → cache write (TTL 1 h)      [best-effort; errors ignored]
  → { messages, title, fromCache: false }

Browser (useChatGPTScrape, continued):
  → capture one exportedAt = new Date()
  → generatePdfBlob(messages, title, exportedAt)   — @react-pdf/renderer (client)
  → expose pdfBlob + exportedAt to ConvertForm

ConvertForm:
  → PdfCanvasViewer renders pdfBlob to <canvas> via pdf.js (inline + fullscreen);
    works on every device, unlike the former <iframe> (see PDF.md)
  → URL.createObjectURL(pdfBlob) → used for Download + Share (not the preview)
  → Download PDF   : anchor download, filename via generatePdfFilename() at click time
  → Share to WhatsApp : Web Share API with the PDF file + a caption built from
                        WHATSAPP_SHARE_TEXT() (falls back to wa.me + download)
  → object URLs are revoked by a useEffect cleanup (no leaks)
```

## Why Split Server vs. Client

- **Scraping is server-side** because it needs an outbound `fetch` to
  `chatgpt.com` with a coherent browser fingerprint (to get past Cloudflare bot
  detection — see [SCRAPING.md](./SCRAPING.md)) and must keep Upstash tokens secret.
- **PDF rendering is client-side** because `@react-pdf/renderer` runs its
  layout engine (yoga-layout WASM) in the browser, and rendering large documents
  server-side on a Worker is impractical. (Emoji PNGs are now served same-origin
  from `/emoji/` rather than a CDN — see [PDF.md](./PDF.md#emoji).) The PDF is
  rendered **exactly once** in `useChatGPTScrape` and the single resulting blob
  is reused for preview, download, and share (see the note in `ConvertForm.tsx`
  about why mounting react-pdf's `<PDFViewer>`/`<PDFDownloadLink>` was removed).
  The blob is displayed by `PdfCanvasViewer` (pdf.js → `<canvas>`), which renders
  on every device including iOS/Android — see [PDF.md](./PDF.md#inline-preview-pdfjs-canvas).

## Folder Purpose

| Folder               | Purpose                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(main)/`        | User-facing route group: `page.tsx` (landing + converter), plus `layout.tsx` (Navbar/Footer/ScrollToTop chrome), `loading.tsx`, `error.tsx` |
| `app/api/convert/`   | The single `POST` endpoint (Node.js runtime)                                                                                                |
| `app/` (root)        | `layout.tsx` (theme + SW + metadata), `manifest.ts`, `robots.ts`, `sitemap.ts`, `not-found.tsx`, `globals.css`                              |
| `components/ui/`     | shadcn/ui primitives: `button`, `input`, `alert`, `skeleton`, `badge`, `card`                                                               |
| `components/pdf/`    | `PdfDocument` — the react-pdf document template                                                                                             |
| `components/layout/` | `Navbar`, `Footer`                                                                                                                          |
| `components/shared/` | Client feature components: `ConvertForm`, `PdfCanvasViewer` (pdf.js preview), `ThemeSwitcher`, `ScrollToTop`, `ServiceWorkerRegister`        |
| `components/` (root) | `theme-provider` (next-themes wrapper)                                                                                                      |
| `lib/`               | `scraper`, `pdf-generator`, `ratelimit`, `redis`, `utils`                                                                                   |
| `hooks/`             | `useChatGPTScrape` — the only caller of `/api/convert`                                                                                      |
| `types/`             | Shared TypeScript types (`chatgpt.ts`)                                                                                                      |
| `constants/`         | All magic strings and tunables (`app.ts`)                                                                                                   |
| `public/`            | Icons, fonts, images, service worker (`sw.js`). Build-generated (gitignored): `pdf.worker.min.mjs` (pdf.js preview worker) and `emoji/` (Twemoji PNGs) — see [PDF.md](./PDF.md) |
| `scripts/`           | `prepare-assets.mjs` — copies the pdf.js worker + Twemoji emoji set into `public/` (runs on install/build)                                   |
| `__tests__/`         | Vitest suites + the visual render harness                                                                                                   |
| `docs/`              | This documentation                                                                                                                          |

## The `(main)` Route Group

The `(main)` route group scopes the page chrome (Navbar, Footer, ScrollToTop) to
user-facing pages only. Parentheses mean the segment does not appear in the URL.
API routes (`app/api/*`) and metadata routes (`manifest.ts`, `robots.ts`,
`sitemap.ts`) live outside the group so they are not wrapped in page layout. The
**root** `app/layout.tsx` (outside the group) supplies `<html>`, theming, the
service-worker registration, fonts, and site metadata for everything.

## Runtime Boundaries

- **Server (`nodejs` runtime):** `/api/convert` — IP detection, rate limit,
  cache read/write, URL validation, scraping. `export const runtime = 'nodejs'`
  is required because the scraper and Upstash clients use Node APIs.
- **Client:** PDF generation (`@react-pdf/renderer`), inline preview, download,
  Web Share, theme switching, service-worker registration.
- `PdfDocument` is a pure data → layout component with no browser/Node
  dependencies of its own, so it is exercised directly by the test harness.

## Key Data Types (`types/chatgpt.ts`)

```ts
type ContentBlock =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string; language?: string }
  // `url` is a base64 data URI once the scraper has embedded the image
  // server-side. `width`/`height` are the source pixel dimensions.
  | { type: 'image'; url: string; alt?: string; width?: number; height?: number }
  | { type: 'latex'; value: string }

interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock[]
  timestamp?: string
}
interface ConvertResponse {
  messages: Message[]
  title?: string
  fromCache: boolean
}
interface ConvertError {
  error: string
  code: 400 | 403 | 404 | 429 | 500
}
```

> The `ConvertError.code` union in `types/chatgpt.ts` lists `400 | 403 | 404 |
429 | 500`. The route (`app/api/convert/route.ts`) **also** returns HTTP **503**
> with `Retry-After: 15` for a Cloudflare bot challenge (`BOT_BLOCKED`) — the type
> simply hasn't been widened to include `503` yet. The full status table is in
> [API.md](./API.md). `ConvertError` is a documentation/contract type; the route
> builds responses with `NextResponse.json(..., { status })` directly rather than
> constructing this interface, so the gap is cosmetic, not a runtime bug.

> The scraper emits `text`, `code`, and `image` blocks (the last from web-search
> `image_group` carousels — see [SCRAPING.md](./SCRAPING.md)). `latex` is the one
> type the scraper does not yet produce; it is fully handled by the PDF renderer
> (and inline `$…$` math is parsed at render time regardless), so it is ready if
> the scraper begins producing it.

## Related Docs

- [CONVENTIONS.md](./CONVENTIONS.md) — domain glossary, business rules, implicit conventions, extension points
- [SCRAPING.md](./SCRAPING.md) — turbo-stream decoding
- [PDF.md](./PDF.md) — the react-pdf rendering pipeline
- [SHARING.md](./SHARING.md) — filenames, export stamp, WhatsApp caption
- [API.md](./API.md) — endpoint contract
- [CACHING.md](./CACHING.md) · [RATE_LIMITING.md](./RATE_LIMITING.md)
- [THEMING.md](./THEMING.md) · [PWA.md](./PWA.md) · [SECURITY.md](./SECURITY.md)
