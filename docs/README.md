# Save ChatGPT as PDF

> Paste a public ChatGPT share link → get a clean PDF instantly.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)
![Upstash Redis](https://img.shields.io/badge/Upstash-Redis-green)

**Repo:** https://github.com/fyvri/save-chatgpt-as-pdf

## What It Does

Paste a public `chatgpt.com/share/<uuid>` link. The server fetches the page and
decodes the embedded conversation (no DOM scraping); the browser then renders a
clean, A4 PDF with a branded letterhead/footer, syntax-highlighted code,
markdown, tables, emoji, and math. Preview it inline or fullscreen, then
**download** it or **share to WhatsApp** with an auto-generated caption. Repeat
visits to the same link return instantly from cache.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) ·
Tailwind v4 + shadcn/ui · `@react-pdf/renderer` · Upstash Redis (optional) ·
Cloudflare Workers via OpenNext. PWA-enabled.

## Quick Start

```bash
git clone https://github.com/fyvri/save-chatgpt-as-pdf
cd save-chatgpt-as-pdf
nvm use                      # Node 20+ (see .nvmrc)
npm install                  # installs deps; shadcn primitives & fonts ship in the repo
cp .env.example .env.local   # Upstash vars optional for local dev (see ENVIRONMENT.md)
npm run dev
```

> The shadcn/ui primitives (`components/ui/*`) and the PDF fonts
> (`public/fonts/*`) are checked into the repository — no `shadcn init`/`add` or
> manual font download is required for a normal clone.

## Docs

**Start here**

- [CONVENTIONS.md](./CONVENTIONS.md) — domain glossary, business rules, implicit conventions, extension points (the single source of truth for _how & why_)

**Overview & design**

- [ARCHITECTURE.md](./ARCHITECTURE.md) — request flow, folders, runtime boundaries
- [SCRAPING.md](./SCRAPING.md) — turbo-stream decoding (no cheerio/DOM)
- [PDF.md](./PDF.md) — the react-pdf rendering pipeline
- [SHARING.md](./SHARING.md) — filenames, export stamp, WhatsApp caption
- [THEMING.md](./THEMING.md) — the four-variant theme system

**Interface & operations**

- [API.md](./API.md) — the single `POST /api/convert` endpoint
- [CACHING.md](./CACHING.md) · [RATE_LIMITING.md](./RATE_LIMITING.md)
- [ENVIRONMENT.md](./ENVIRONMENT.md) · [DEPLOY.md](./DEPLOY.md)
- [PWA.md](./PWA.md) · [SECURITY.md](./SECURITY.md)

**Contributing**

- [CONTRIBUTING.md](./CONTRIBUTING.md) · [TESTING.md](./TESTING.md) · [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
