# Troubleshooting

## Tailwind v4 / shadcn/ui

| Symptom                       | Cause                                          | Fix                                                                                                                   |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tailwind classes not applying | Old `@tailwind` directives                     | Replace with `@import "tailwindcss"` in `globals.css`                                                                 |
| Animations not working        | `tailwindcss-animate` incompatible with v4     | Install `tw-animate-css`, `@import "tw-animate-css"`                                                                  |
| shadcn peer dep errors on npm | React 19                                       | Add `--legacy-peer-deps` to all shadcn CLI commands                                                                   |
| `components.json` not found   | Editing a partial clone (it ships in the repo) | Restore it from the repo; only run `npx shadcn@latest init --legacy-peer-deps` when bootstrapping shadcn from scratch |

## Cloudflare Workers Deploy

| Symptom                                                                                | Cause                                                                                                                                 | Fix                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker > 3 MiB                                                                         | Bundle too large                                                                                                                      | `wrangler deploy --dry-run`; consider Workers Paid plan (10 MiB)                                                                                                                                                                         |
| `nodejs_compat` missing                                                                | Flag absent                                                                                                                           | Add to `wrangler.toml` `compatibility_flags`                                                                                                                                                                                             |
| Env vars missing at runtime                                                            | Using `.env.local` in prod                                                                                                            | Use `wrangler secret put`                                                                                                                                                                                                                |
| `open-next.config.ts` missing                                                          | Not created                                                                                                                           | Create with `defineCloudflareConfig()`                                                                                                                                                                                                   |
| `Uncaught ReferenceError: __name is not defined` (browser console; blank/broken theme) | esbuild's `keep-names` injects a `__name` helper that leaks into next-themes' inlined `<script>`, where it's undefined in the browser | Set `keep_names = false` in `wrangler.toml` (already set; needs wrangler ≥ 4.13.0). Redeploy and hard-refresh — page HTML is cached `s-maxage=31536000`. See [OpenNext Keep Names](https://opennext.js.org/cloudflare/howtos/keep_names) |

## Scraping

| Symptom                               | Cause                                                                                                         | Fix                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 503 "temporarily blocking… try again" | Cloudflare Bot Management challenged the Worker's fetch (`code: 'BOT_BLOCKED'`) — the chat is **not** private | Retry first (transient). If persistent, the Worker egress IP is blocked: refresh the `CHATGPT_FETCH_HEADERS` fingerprint in `constants/app.ts`, or route the fetch through a non-Cloudflare egress (scraping API / relay). See [SCRAPING.md](./SCRAPING.md#bot-detection--the-403-split) |
| 403 "this chat is private"            | Share is genuinely private/disabled (not a bot challenge)                                                     | Open the share link in a browser and make the conversation public                                                                                                                                                                                                                        |
| `PARSE_ERROR` ("structure changed")   | OpenAI changed the embedded `streamController.enqueue` / `linear_conversation` payload                        | Re-inspect a share page's bootstrap script, update the decoder in `lib/scraper.ts` + TODO dates + `__tests__/scraper.test.ts` + `SCRAPING.md` (see [SCRAPING.md](./SCRAPING.md))                                                                                                         |
| Empty messages                        | All turns filtered out (hidden/non user-assistant)                                                            | Confirm the share actually contains visible user/assistant turns                                                                                                                                                                                                                         |
| Timeout ("slow to respond")           | Slow upstream                                                                                                 | Increase `FETCH_TIMEOUT_MS` in `constants/app.ts`                                                                                                                                                                                                                                        |

## PDF Generation

| Symptom                                | Cause                                                     | Fix                                                                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer crash / `SIGILL` on big chats | react-pdf rendered multiple times                         | The PDF is rendered once in `useChatGPTScrape` and shown via a native `<iframe>` — do **not** re-introduce `<PDFViewer>`/`<PDFDownloadLink>` (see the note in `ConvertForm.tsx`) |
| Font not rendering                     | `Font.register()` not called                              | Ensure `lib/pdf-generator.ts` is imported before render                                                                                                                          |
| Font files missing                     | Not downloaded                                            | Place all four `.ttf` files in `/public/fonts/` (Roboto Regular/Bold, RobotoMono, SymbolFallback) — see [DEPLOY.md](./DEPLOY.md)                                                 |
| Symbols (→ ✔ √ ∑ …) show as boxes      | `SymbolFallback-Regular.ttf` missing                      | Roboto's subset lacks these glyphs; the fallback font must be present and listed after Roboto/RobotoMono                                                                         |
| Emoji missing in PDF                   | Twemoji CDN blocked                                       | `connect-src`/`img-src` must allow `cdn.jsdelivr.net` (set in `next.config.ts`); requires network at render time                                                                 |
| Mobile preview "content is blocked"    | CSP missing `object-src`/`worker-src`/`frame-src` `blob:` | Keep the `next.config.ts` CSP intact (Chromium PDFium is governed by `object-src`)                                                                                               |
| Images missing in PDF                  | Failed load                                               | Expected for failed loads — `<Image onError>` returns null                                                                                                                       |
| Wrong filename                         | Logic bug                                                 | Run `__tests__/utils.test.ts`                                                                                                                                                    |

## Upstash / Rate Limiting

| Symptom                               | Cause                             | Fix                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No caching / rate limit always allows | Upstash env vars unset            | Expected: with no `UPSTASH_*` the app degrades gracefully (`redis` is `null`, limiter bypasses) — it does **not** crash. Set both vars to enable. See [ENVIRONMENT.md](./ENVIRONMENT.md) |
| Rate limit always bypassed locally    | `NODE_ENV=development` dev bypass | Correct — bypass is intentional in dev                                                                                                                                                   |
| Rate limit not resetting              | Wrong limiter                     | Confirm `slidingWindow` in `lib/ratelimit.ts`                                                                                                                                            |

## Security

| Symptom                           | Cause            | Fix                                                            |
| --------------------------------- | ---------------- | -------------------------------------------------------------- |
| `npm audit` reports high/critical | Vulnerable dep   | Resolve before deploying — never ship with known critical CVEs |
| Next.js security advisory         | Outdated Next.js | Check https://nextjs.org/blog, pin to latest patched version   |

## PWA

| Symptom                                 | Cause               | Fix                                                               |
| --------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| Install prompt not appearing            | Missing requirement | HTTPS + manifest + SW all required simultaneously                 |
| Stale content after deploy              | Old SW cache        | Increment `CACHE_VERSION` in `public/sw.js`                       |
| Memory issue after multiple conversions | Leaked object URLs  | Handled by `URL.revokeObjectURL` in `ConvertForm.tsx` `useEffect` |
