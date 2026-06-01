# Conventions, Domain Concepts & Extension Points

The single reference for _how this codebase is built and why_. Read this before
adding features so changes match existing patterns. It complements
[ARCHITECTURE.md](./ARCHITECTURE.md) (structure) and the topic docs.

## Domain Glossary

| Term                        | Meaning                                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Share link**              | A public `https://chatgpt.com/share/<uuid>` URL — the only accepted input.                                                                                                                                                                                         |
| **Turn / message**          | One `Message` (`role: 'user' \| 'assistant'`, `content: ContentBlock[]`, optional `timestamp`).                                                                                                                                                                    |
| **ContentBlock**            | A discriminated union (`text` / `code` / `image` / `latex`). A single message can mix block types. The scraper emits `text`, `code`, and `image` blocks; `latex` is renderer-only (inline `$…$` math is parsed at render time). The PDF renderer handles all four. |
| **`image_group`**           | A web-search image carousel ChatGPT embeds in `metadata.content_references` (not in the message text). The scraper resolves it to `image` blocks and inlines each as a base64 data URI (see [SCRAPING.md](./SCRAPING.md)).                                         |
| **turbo-stream**            | React Router's index-flattened serialization embedded in the share page. The scraper decodes it (see [SCRAPING.md](./SCRAPING.md)) — there is **no DOM scraping**.                                                                                                 |
| **`linear_conversation`**   | The array of turns inside the decoded graph; its sibling `title` is the conversation title.                                                                                                                                                                        |
| **Hidden message**          | A turn with `metadata.is_visually_hidden_from_conversation` — dropped during scraping.                                                                                                                                                                             |
| **Export stamp**            | The single human timestamp shown in the PDF hero and the WhatsApp caption (see [SHARING.md](./SHARING.md)).                                                                                                                                                        |
| **Cache hit (`fromCache`)** | Whether the response came from Upstash rather than a fresh scrape.                                                                                                                                                                                                 |

## Business Rules & Tunables

All magic values live in `constants/app.ts` — never hard-code these inline.

| Constant                                    | Value           | Rule it enforces                                                           |
| ------------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW` | `10` / `'60 s'` | 10 requests per IP per 60 s (sliding window).                              |
| `CACHE_TTL_SECONDS`                         | `3600`          | Scraped conversations cached for 1 hour.                                   |
| `MAX_URL_LENGTH`                            | `200`           | Reject over-long URLs before regex (DoS guard).                            |
| `FETCH_TIMEOUT_MS`                          | `15_000`        | Abort a ChatGPT fetch after 15 s; one automatic retry on the first abort.  |
| `CHATGPT_FETCH_HEADERS`                     | header set      | Fixed, coherent Chrome fingerprint for the share-page fetch (bot evasion). |
| `USER_AGENTS`                               | 4 strings       | Rotated per **image** fetch only (share page uses the fingerprint above).  |
| `MAX_EMBEDDED_IMAGES`                       | `24`            | Hard cap on images fetched + inlined per conversation.                     |
| `MAX_IMAGE_BYTES`                           | `3_000_000`     | Skip any single image larger than ~3 MB.                                   |
| `IMAGE_FETCH_TIMEOUT_MS`                    | `8_000`         | Per-image fetch timeout when inlining web-search images.                   |
| `CHATGPT_URL_REGEX` (`lib/scraper.ts`)      | strict UUID     | Only `https://chatgpt.com/share/<uuid>` is ever fetched.                   |

Validation, caching, and rate limiting only run server-side in `/api/convert`.

## Implicit Coding Conventions

These are followed throughout; keep matching them.

- **Singletons, never inline instantiation.** `redis` (`lib/redis.ts`) and
  `ratelimit` (`lib/ratelimit.ts`) are created once at module load and imported.
  Do not `new Redis(...)` or call `createRatelimit()` inside a handler.
- **One API caller.** `hooks/useChatGPTScrape.ts` is the _only_ place that calls
  `/api/convert`. Components must go through the hook.
- **Graceful degradation over hard failure.** Missing Upstash → `redis` is
  `null`, caching is skipped, the limiter bypasses. Cache reads/writes are
  wrapped in `try/catch` and never block a conversion (`console.warn` only).
- **Server runtime is explicit.** `/api/convert` sets `export const runtime =
'nodejs'` — required for the scraper and Upstash SDK. Keep it.
- **Three-layer SSRF guard** in `validateUrl`: length → strict regex → `new
URL()` host/protocol check. Don't collapse these layers.
- **Typed errors carry HTTP status (and an optional `code`).** The scraper throws
  `Object.assign(new Error('CODE'), { status, code? })`; the route maps `code`
  first (e.g. `BOT_BLOCKED` → 503), then falls back to `status`/`message`/`name`
  for the user-facing message. Add new failure modes the same way.
- **The PDF is rendered exactly once.** Rendering happens in `useChatGPTScrape`;
  the single `Blob` feeds preview, fullscreen, download, and share. Never mount
  react-pdf `<PDFViewer>`/`<PDFDownloadLink>` (it re-renders and crashes — see
  [PDF.md](./PDF.md)).
- **One export moment.** `exportedAt` is captured once and threaded into both the
  PDF and the share caption so their stamps are identical. Filenames, by
  contrast, are stamped at click/share time on purpose.
- **Title precedence is uniform** (real scrape `title` → first user message →
  generic fallback) in `ConvertForm`, `PdfDocument.deriveTitle`, and the filename
  seed. Keep them in sync (see [SHARING.md](./SHARING.md)).
- **True italic faces are registered.** `Roboto-Italic` and `Roboto-BoldItalic`
  are registered in `lib/pdf-generator.ts`, so `*emphasis*` and `***bold
italic***` render as real obliqued glyphs (react-pdf resolves `fontStyle`
  per-run). Keep an italic face registered for any family you set `fontStyle:
'italic'` on — react-pdf throws on an unresolved `fontStyle`.
- **Exact marks are SVG vectors**, not font glyphs/emoji (footer heart, avatars).
- **Images are inlined as base64 data URIs** server-side before they reach the
  client (`embedImagesInMessages`), so the client-side PDF renderer embeds them
  without cross-origin/CORS failures. Bounded by `MAX_EMBEDDED_IMAGES` /
  `MAX_IMAGE_BYTES` / `IMAGE_FETCH_TIMEOUT_MS`; failures are dropped, never fatal.
- **Symbols rely on per-glyph fallback** (`['Roboto', 'SymbolFallback']`); emoji
  rely on the Twemoji CDN. Both are reflected in the `next.config.ts` CSP.
- **Theme = a single class.** next-themes can't apply multi-class values; AMOLED
  is a standalone `.amoled` class and the `dark` variant is extended to match it
  (see [THEMING.md](./THEMING.md)).
- **`next-themes` is imported only via the wrapper** `components/theme-provider.tsx`
  (a Client Component) — never directly in a Server Component.
- **JSON-LD/`dangerouslySetInnerHTML` only ever receive hardcoded constants.**
  Never pass scraped content into them (XSS). Scraped text reaches the user only
  through auto-escaped JSX or react-pdf text nodes.
- **Path alias `@/*`** maps to the project root (`tsconfig.json` + mirrored in
  `vitest.config.ts`). TypeScript is `strict`.
- **Freshness markers.** Assumptions about ChatGPT internals and the UA list
  carry `// TODO: verify … — last checked YYYY-MM-DD`. Update the date when you
  re-confirm.

## Dependencies (why each is here)

| Package                                                                                                                        | Role                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `next` / `react` / `react-dom`                                                                                                 | App Router framework (Next 15, React 19).                           |
| `@opennextjs/cloudflare` + `wrangler`                                                                                          | Build/deploy to Cloudflare Workers.                                 |
| `@react-pdf/renderer`                                                                                                          | Client-side PDF rendering (transpiled via `transpilePackages`).     |
| `@upstash/redis` + `@upstash/ratelimit`                                                                                        | Optional cache + sliding-window rate limit.                         |
| `next-themes`                                                                                                                  | Four-variant theming.                                               |
| `lucide-react`                                                                                                                 | Icons.                                                              |
| `tailwindcss` v4 + `tw-animate-css` + shadcn/ui (`class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`) | Styling and UI primitives.                                          |
| `cheerio`                                                                                                                      | **Unused** — a leftover dependency; the scraper does not import it. |
| `vitest` + `@vitejs/plugin-react`                                                                                              | Tests ([TESTING.md](./TESTING.md)).                                 |

## Extension Points

| Goal                                                                  | Touch these                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New content type** (e.g. `latex` from scrape, or new image sources) | `types/chatgpt.ts` (all four types already defined) → emit it in `lib/scraper.ts` → confirm `renderBlock` in `components/pdf/PdfDocument.tsx` handles it (it does for all four). `text`/`code`/`image` are emitted today; `latex` is the one not yet produced by the scraper. |
| **Add a theme**                                                       | Add the variant CSS in `app/globals.css`, add its name to `themes={[…]}` in `app/layout.tsx`, and add an option in `ThemeSwitcher.tsx` (values must match).                                                                                                                   |
| **Add a shadcn primitive**                                            | `npx shadcn@latest add <name> --legacy-peer-deps` (React 19 peer ranges).                                                                                                                                                                                                     |
| **Change a limit/timeout/TTL/UA**                                     | Edit `constants/app.ts` only.                                                                                                                                                                                                                                                 |
| **Swap/extend fonts**                                                 | Add the `.ttf` to `public/fonts/`, register it in `lib/pdf-generator.ts`, and add it to `STATIC_ASSETS` in `public/sw.js` if it should be precached.                                                                                                                          |
| **Adjust the WhatsApp caption**                                       | `WHATSAPP_SHARE_TEXT` / `ShareSummary` in `constants/app.ts` (see [SHARING.md](./SHARING.md)).                                                                                                                                                                                |
| **Handle a new scrape failure**                                       | Throw a typed error in `lib/scraper.ts` and map it in `app/api/convert/route.ts`; document it in [API.md](./API.md).                                                                                                                                                          |
| **Loosen/adjust CSP**                                                 | `next.config.ts` — each allowance is commented with the runtime reason; see [SECURITY.md](./SECURITY.md).                                                                                                                                                                     |

## Known Cleanup Opportunities (informational — not bugs)

These are accurate observations for future maintainers; the app works as-is and
this doc does **not** prescribe code changes:

- `cheerio` is an unused dependency (the scraper decodes turbo-stream, no DOM).
- `app/manifest.ts` imports `APP_URL` but does not use it (`start_url` is
  relative `'/'`).
- `app/manifest.ts` sets `theme_color: '#b3002d'` and
  `background_color: '#ffffff'`, which predate the red brand palette in
  `app/globals.css` and `public/images/` — they are not derived from the theme
  tokens, so they don't match the logo red.
