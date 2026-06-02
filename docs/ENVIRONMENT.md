# Environment Variables

| Variable                   | Required    | In Browser | Description                                                                                                                                                                                                                                                                                           | Example                                        |
| -------------------------- | ----------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`      | Recommended | ✅         | Canonical URL: `metadataBase`/OpenGraph (`layout.tsx`), `sitemap.ts`, `robots.ts` sitemap link, JSON-LD (`page.tsx`), and the WhatsApp share caption. Falls back to `http://localhost:3000`.                                                                                                          | `https://save-chatgpt-as-pdf.workers.dev`      |
| `NEXT_PUBLIC_GITHUB_URL`   | Optional    | ✅         | Navbar GitHub link. Falls back to the upstream repo URL.                                                                                                                                                                                                                                              | `https://github.com/fyvri/save-chatgpt-as-pdf` |
| `UPSTASH_REDIS_REST_URL`   | Optional\*  | ❌         | Upstash REST endpoint                                                                                                                                                                                                                                                                                 | `https://xxxx.upstash.io`                      |
| `UPSTASH_REDIS_REST_TOKEN` | Optional\*  | ❌         | Upstash auth token                                                                                                                                                                                                                                                                                    | `AXxxxx`                                       |
| `SCRAPINGANT_API_KEY`      | Optional†   | ❌         | ScrapingAnt API key. When set, the scraper automatically retries through ScrapingAnt's residential-IP proxy whenever the direct ChatGPT fetch is bot-challenged (`BOT_BLOCKED`). Without it, persistent bot-blocks surface as a 503 to the user. Free tier: 10,000 requests/month at scrapingant.com. | `ant_XXXX...`                                  |

\* **Both Upstash variables together, or neither.** When both are present,
caching and Upstash-backed rate limiting are enabled. When either is missing,
`isRedisConfigured` is `false`: `redis` is `null`, caching is skipped, and the
rate limiter falls back to an always-allow bypass. The app still converts
normally — it just loses caching and distributed rate limiting.

### Defaults (`constants/app.ts`)

`APP_URL` and `GITHUB_URL` have safe in-code fallbacks, so a missing
`NEXT_PUBLIC_*` value will not crash the app (it prevents a `new URL('')` throw
in `app/layout.tsx`). Set `NEXT_PUBLIC_APP_URL` in production so the canonical/OG
metadata, sitemap, robots, JSON-LD, and the WhatsApp share link point at the real
host. (The PWA manifest uses a relative `start_url: '/'` and does not depend on
this value.)

- **Local:** `.env.example` → `.env.local` (gitignored).
- **Production:** `wrangler secret put <VAR>` (for the `UPSTASH_*` and
  `SCRAPINGANT_API_KEY` secrets) or set vars in the Cloudflare dashboard →
  Workers → Settings → Variables.

> **Never** prefix `UPSTASH_*` or `SCRAPINGANT_API_KEY` with `NEXT_PUBLIC_` —
> these secrets would be exposed in the browser bundle.

† **ScrapingAnt key is independent of Upstash.** Set `SCRAPINGANT_API_KEY` to
enable the automatic proxy fallback for bot-blocked requests; leave it unset if
the direct fetch is reliable in your deployment. See
[SCRAPING.md](./SCRAPING.md#bot-detection--the-403-split).
