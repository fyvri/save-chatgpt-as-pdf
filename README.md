# Save ChatGPT as PDF

> Paste a public ChatGPT share link → download the whole conversation as a clean, formatted PDF, in one click.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-149eca)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)
![Upstash Redis](https://img.shields.io/badge/Upstash-Redis-green)

**Repo:** https://github.com/fyvri/save-chatgpt-as-pdf

---

## What it does

Paste a public `https://chatgpt.com/share/<uuid>` link. The server fetches the
page and decodes the embedded conversation — **no DOM scraping**, it reads
ChatGPT's embedded React Router _turbo-stream_ payload. The browser then renders
a polished A4 PDF with a branded letterhead/footer, syntax-highlighted code,
markdown, tables, emoji, and math. Preview it inline or fullscreen, then
**download** it or **share to WhatsApp** with an auto-generated caption. Repeat
visits to the same link return instantly from cache.

## Features

- 🧾 **Faithful PDF** — markdown, nested lists, GitHub tables, fenced code with
  lightweight syntax highlighting, LaTeX → unicode, Twemoji emoji, inline
  web-search images, and a ChatGPT-style turn layout.
- ⚡ **Instant repeats** — optional Upstash Redis cache (1-hour TTL).
- 🛡️ **Safe by design** — 3-layer SSRF URL validation, strict CSP, sliding-window
  rate limiting, and no persisted user data.
- 🎨 **Four themes** — Light, Dark, AMOLED, Brand (+ System).
- 📱 **PWA** — installable, offline app shell.
- 🆓 **No sign-up**, runs on Cloudflare Workers.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 +
shadcn/ui · `@react-pdf/renderer` · Upstash Redis (optional) · Cloudflare
Workers via OpenNext.

## Quick start

```bash
git clone https://github.com/fyvri/save-chatgpt-as-pdf
cd save-chatgpt-as-pdf
nvm use                      # Node 20+ (see .nvmrc)
npm install                  # shadcn primitives & PDF fonts ship in the repo
cp .env.example .env.local   # Upstash vars are optional for local dev
npm run dev                  # http://localhost:3000
```

> The shadcn/ui primitives (`components/ui/*`) and the PDF fonts
> (`public/fonts/*`) are in the repository — no `shadcn init`/`add` or manual
> font download is needed for a normal clone.

## Scripts

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Local dev server                                     |
| `npm run build`        | Next.js production build                             |
| `npm run build:worker` | OpenNext → Cloudflare Worker bundle                  |
| `npm run preview`      | Build worker + `wrangler dev` (local Worker preview) |
| `npm run deploy`       | Build worker + `wrangler deploy`                     |
| `npm run test`         | Vitest suite (`__tests__/`)                          |
| `npm run lint`         | `next lint`                                          |
| `npm run format`       | Prettier write                                       |
| `npm run audit`        | `npm audit --audit-level=high`                       |

## Project structure

```
app/(main)/        Landing page + chrome (Navbar/Footer/ScrollToTop)
app/api/convert/   The single POST endpoint (Node.js runtime)
app/               Root layout, manifest, robots, sitemap, globals.css
components/pdf/     PdfDocument — the react-pdf template
components/shared/  ConvertForm, ThemeSwitcher, ServiceWorkerRegister, ScrollToTop
components/ui/      shadcn/ui primitives
lib/               scraper, pdf-generator, ratelimit, redis, utils
hooks/             useChatGPTScrape — the only caller of /api/convert
constants/         All tunables and copy (app.ts)
types/             Shared TypeScript types
public/            Icons, fonts, images, service worker
__tests__/         Vitest suites + visual render harness
docs/              Full documentation (see below)
```

## How it works

```
Browser  →  POST /api/convert { url }
Server   →  rate limit → validate URL → cache check → scrape (turbo-stream) → inline images → cache write
Browser  →  render PDF once (@react-pdf) → inline preview → download / share to WhatsApp
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full flow.

## Configuration

Copy `.env.example` → `.env.local`. The `NEXT_PUBLIC_*` values configure the
canonical URL and GitHub link; the `UPSTASH_*` pair is **optional** (without it
the app still converts, just with no caching or distributed rate limiting). Full
table in [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md).

## Deployment

Deployed to Cloudflare Workers via OpenNext:

```bash
wrangler secret put UPSTASH_REDIS_REST_URL    # optional
wrangler secret put UPSTASH_REDIS_REST_TOKEN  # optional
npm run deploy
```

Step-by-step guide: [docs/DEPLOY.md](./docs/DEPLOY.md).

## Documentation

Start with **[docs/CONVENTIONS.md](./docs/CONVENTIONS.md)** (domain glossary,
business rules, conventions, extension points) — the single source of truth for
how and why the code is shaped.

| Area                                     | Doc                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture & request flow              | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)                                                                                               |
| Conversation decoding                    | [docs/SCRAPING.md](./docs/SCRAPING.md)                                                                                                       |
| PDF rendering pipeline                   | [docs/PDF.md](./docs/PDF.md)                                                                                                                 |
| Download / share / filenames             | [docs/SHARING.md](./docs/SHARING.md)                                                                                                         |
| Theming                                  | [docs/THEMING.md](./docs/THEMING.md)                                                                                                         |
| API contract                             | [docs/API.md](./docs/API.md)                                                                                                                 |
| Caching · Rate limiting                  | [docs/CACHING.md](./docs/CACHING.md) · [docs/RATE_LIMITING.md](./docs/RATE_LIMITING.md)                                                      |
| Environment · Deploy                     | [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) · [docs/DEPLOY.md](./docs/DEPLOY.md)                                                            |
| PWA · Security                           | [docs/PWA.md](./docs/PWA.md) · [docs/SECURITY.md](./docs/SECURITY.md)                                                                        |
| Contributing · Testing · Troubleshooting | [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) · [docs/TESTING.md](./docs/TESTING.md) · [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) |

## License

Released under the [MIT License](./LICENSE) — © 2026 Azis Alvriyanto.
