# Security

- **Keep Next.js updated:** Run `npm audit` (or `npm run audit`, which uses
  `--audit-level=high`) before every deploy and pin to the latest patched
  Next.js release. Check https://nextjs.org/blog and the GitHub Security
  Advisory database for current advisories — do not ship with known high/critical
  CVEs.
- **SSRF protection (3 layers)** on the user-supplied share URL:
  1. Length check rejects strings > 200 chars before parsing.
  2. Strict UUID regex limits the host to `chatgpt.com/share/*`.
  3. `new URL()` parse verifies `hostname === 'chatgpt.com'` and
     `protocol === 'https:'` to guard against Unicode normalization and
     encoded bypass tricks.
- **Outbound image fetches are constrained too.** When inlining web-search
  images (`lib/scraper.ts`), only `http(s)` URLs are fetched, each with an 8 s
  timeout and a ~3 MB size cap, bounded to `MAX_EMBEDDED_IMAGES` per conversation.
  In production the Worker's `global_fetch_strictly_public` compatibility flag
  (`wrangler.toml`) blocks any `fetch` to private/internal/loopback addresses, so
  an attacker cannot use a malicious image URL embedded in a share to reach
  internal services. See [SCRAPING.md](./SCRAPING.md#images-web-search-image_group-carousels).
- **XSS prevention:** All scraped ChatGPT content is rendered only via
  `@react-pdf/renderer` text nodes (PDF, not HTML) or React JSX (auto-escaped).
  The `dangerouslySetInnerHTML` in `page.tsx` uses only hardcoded constants —
  never user data or scraped content.
- **Rate limiting:** 10 req/min per IP prevents abuse and Upstash cost spikes.
  Sliding window prevents burst at the boundary.
- **Memory management:** `URL.createObjectURL` blobs are revoked via `useEffect`
  cleanup in `ConvertForm.tsx`.
- **Security headers:** Set in `next.config.ts` for all routes —
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection`,
  `Permissions-Policy`, and a strict `Content-Security-Policy`.
- **CSP details:** `default-src 'self'` with deliberately narrowed allowances
  required by the client-side PDF renderer (each is commented in
  `next.config.ts`):
  - `script-src` adds `'unsafe-eval'` **only in development** (Next.js HMR);
    production keeps it out.
  - `connect-src` allows `https://*.upstash.io` and `data:` (react-pdf's
    yoga-layout WASM module). Emoji PNGs are now served **same-origin** from
    `/emoji/`, so `cdn.jsdelivr.net` is **no longer needed** and has been removed
    — the app has no third-party CDN dependency at render time.
  - `img-src` allows the OpenAI image hosts plus `data:`/`blob:` (same-origin
    `'self'` covers the local emoji PNGs).
  - `worker-src 'self' blob:` — `blob:` for react-pdf's own renderer worker, and
    `'self'` for the pdf.js preview worker at `/pdf.worker.min.mjs`.
  - `frame-src 'self' blob:` and `object-src 'self' blob:` are **legacy** from the
    former `<iframe>`-based PDF preview. The preview is now a pdf.js `<canvas>`
    (see [PDF.md](./PDF.md#inline-preview-pdfjs-canvas)), so these are no longer
    required; they remain in `next.config.ts` and are harmless.
  - `base-uri 'self'`.
- **`X-Frame-Options: DENY`** — clickjacking protection.
- **`Permissions-Policy`** — disables camera, microphone, geolocation, payment.
- **`poweredByHeader: false`** — removes the `X-Powered-By: Next.js` fingerprint.
- **No user data stored:** Only parsed JSON cached 1h in Redis; no IPs, URLs,
  or identities persisted.
- **Server-only secrets:** `UPSTASH_*` vars never have the `NEXT_PUBLIC_`
  prefix — never in the browser bundle.
- **`/api/*`** disallowed in `robots.ts`.
- **Dev bypass:** Rate limiter skips Upstash when `NODE_ENV=development`. Never
  deploy with `NODE_ENV=development`.
- **Lockfile:** `package-lock.json` kept in the repo to ensure reproducible,
  vulnerability-controlled builds.
- **Responsible disclosure:** Open a GitHub issue tagged `[SECURITY]` or
  contact the maintainer via their GitHub profile.
