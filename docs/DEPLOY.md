# Deploy — Cloudflare Workers

1. **Prerequisites:** Node.js 22+, `wrangler` (a dev dependency, installed by
   `npm install`), a Cloudflare account. An Upstash account (free tier) is
   **optional** but recommended — without it the app still works, just with no
   caching and no Upstash-backed rate limiting.
2. Clone the repo and run `npm install`. Its `postinstall` hook runs
   `scripts/prepare-assets.mjs`, which copies the pdf.js preview worker
   (`public/pdf.worker.min.mjs`, from `pdfjs-dist`) and the Twemoji emoji set
   (`public/emoji/`, from the `twemoji-emojis` dev dependency) into `public/`.
   These are **gitignored** build artifacts; `prepare-assets` also re-runs on
   `predev`/`prebuild`/`build:worker`, so they are always present before a build
   or deploy. No manual step is needed.
3. The shadcn/ui primitives (`components/ui/*`, `components.json`) are checked
   into the repository — no `shadcn init`/`add` needed unless you are adding a new one.
4. The six PDF font `.ttf` files ship in `/public/fonts/`. If they are
   missing, source them:
   - Roboto: https://fonts.google.com/specimen/Roboto → `Roboto-Regular.ttf`,
     `Roboto-Bold.ttf`, `Roboto-Italic.ttf`, `Roboto-BoldItalic.ttf` (the italic
     faces render `*emphasis*` / `***bold italic***` as true obliqued glyphs).
   - Roboto Mono: https://fonts.google.com/specimen/Roboto+Mono → `RobotoMono-Regular.ttf`
   - `SymbolFallback-Regular.ttf` — a DejaVu-Sans-derived subset providing the
     arrow/checkmark/math glyphs Roboto lacks (→ ✔ √ ∑ ≤ ≥ …). Required by the
     PDF renderer's per-glyph font fallback (see [PDF.md](./PDF.md)).
5. Copy `.env.example` → `.env.local`. Fill the `NEXT_PUBLIC_*` values; the
   `UPSTASH_*` pair is optional (see [ENVIRONMENT.md](./ENVIRONMENT.md)).
6. `npm audit` — resolve any high/critical issues before continuing.
7. Review `wrangler.toml` — confirm `compatibility_date = "2025-05-01"` or later
   and that `compatibility_flags` contains both `nodejs_compat` (required by the
   scraper and Upstash SDK) and `global_fetch_strictly_public` (blocks outbound
   `fetch` to private/internal addresses — an SSRF guard for image inlining; see
   [SECURITY.md](./SECURITY.md)). The `[assets]` binding (`ASSETS`) and
   `[observability] enabled = true` (Workers logs/metrics) are also defined here.
8. `wrangler secret put UPSTASH_REDIS_REST_URL`
9. `wrangler secret put UPSTASH_REDIS_REST_TOKEN`
10. (Optional) `wrangler secret put SCRAPINGANT_API_KEY` — enables the scraper's
    built-in proxy fallback when ChatGPT bot-blocks the Worker egress. Free tier:
    10,000 requests/month at [scrapingant.com](https://app.scrapingant.com/signup).
    Without it the app still converts normally; persistent bot-blocks surface as a
    503 to the user. See [ENVIRONMENT.md](./ENVIRONMENT.md).
11. `npm run build:worker`
12. `npm run deploy`
13. Optional: connect GitHub → Cloudflare Workers CI for auto-deploy on push to `main`.
14. Verify:
    ```bash
    curl -X POST https://your-worker.workers.dev/api/convert \
      -H "Content-Type: application/json" \
      -d '{"url":"https://chatgpt.com/share/..."}'
    ```
15. Test PWA install:
    - Android: Chrome → Add to Home Screen
    - iOS: Safari → Share → Add to Home Screen
    - Desktop: Chrome address bar install icon
