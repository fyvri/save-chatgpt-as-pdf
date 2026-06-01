# Deploy — Cloudflare Workers

1. **Prerequisites:** Node.js 22+, `wrangler` (a dev dependency, installed by
   `npm install`), a Cloudflare account. An Upstash account (free tier) is
   **optional** but recommended — without it the app still works, just with no
   caching and no Upstash-backed rate limiting.
2. Clone the repo and run `npm install`.
3. The shadcn/ui primitives (`components/ui/*`, `components.json`) are checked
   into the repository — no `shadcn init`/`add` needed unless you are adding a new one.
4. The four PDF font `.ttf` files ship in `/public/fonts/`. If they are
   missing, source them:
   - Roboto: https://fonts.google.com/specimen/Roboto → `Roboto-Regular.ttf`, `Roboto-Bold.ttf`
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
10. `npm run build:worker`
11. `npm run deploy`
12. Optional: connect GitHub → Cloudflare Workers CI for auto-deploy on push to `main`.
13. Verify:
    ```bash
    curl -X POST https://your-worker.workers.dev/api/convert \
      -H "Content-Type: application/json" \
      -d '{"url":"https://chatgpt.com/share/..."}'
    ```
14. Test PWA install:
    - Android: Chrome → Add to Home Screen
    - iOS: Safari → Share → Add to Home Screen
    - Desktop: Chrome address bar install icon
