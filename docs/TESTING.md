# Testing

Tests run on **Vitest**. There are **two** configs:

- `vitest.config.ts` — the default (CI) suite. `environment: 'node'`,
  `globals: true`, `@` aliased to the project root (mirrors `tsconfig.json`) via
  `@vitejs/plugin-react`. It **excludes** the visual harnesses with the glob
  `**/_render-*.test.ts` (they hit the Twemoji CDN and write PDFs to `/tmp`).
- `vitest.preview.config.ts` — the on-demand runner with **no** such exclude,
  used to run the visual harnesses when you want to eyeball the layout. Same
  alias/env, otherwise identical.

Run the default suite with:

```bash
npm run test            # vitest (watch)
npx vitest run          # single CI-style pass
```

## Suites

| File                                | What it covers                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `__tests__/scraper.test.ts`         | `validateUrl` (SSRF guard: valid link, wrong host, over-length, encoded-host bypass, empty); `scrapeMessages` (user/assistant extraction, title sanitization, code-fence splitting, turn order, `PARSE_ERROR` cases); and `interleaveImages` (image_group splicing, multi-image groups, URL precedence, refs lacking images/offsets) |
| `__tests__/utils.test.ts`           | `generatePdfFilename` slugging, fallbacks, and the timezone-independent stamp                                                                                                                                                                                                                                                        |
| `__tests__/_render-preview.test.ts` | **Manual** visual harness (not assertions) — renders a representative reference `PdfDocument` to `/tmp`. Excluded from CI.                                                                                                                                                                                                           |
| `__tests__/_render-stress.test.ts`  | **Manual** visual harness — the fidelity oracle: renders a document exercising every markdown construct to `/tmp`. Excluded from CI.                                                                                                                                                                                                 |

## How the Scraper Test Builds Fixtures

`scraper.test.ts` does not paste raw HTML. It defines `flatten` — the exact
inverse of the scraper's `unflatten` — to encode a normal object graph into
React Router's turbo-stream flattened array, then wraps it in the same
`window.__reactRouterContext.streamController.enqueue("…")` `<script>` shape a
real share page ships. This keeps the test honest about the actual on-page
format. `fetch` is stubbed with `vi.stubGlobal` so no network is touched. When
you change the decoder in `lib/scraper.ts`, update `flatten`/the fixtures here in
lockstep (see [SCRAPING.md](./SCRAPING.md)).

## Inspecting the Visual Harness Output

Because the default config excludes `**/_render-*.test.ts`, run them through the
preview config (`-c vitest.preview.config.ts`):

```bash
npx vitest run -c vitest.preview.config.ts __tests__/_render-preview.test.ts  # reference conversation
npx vitest run -c vitest.preview.config.ts __tests__/_render-stress.test.ts   # every markdown construct
# then inspect the PDF written to /tmp, e.g.:
pdftoppm -png -r 110 /tmp/chatgpt-stress.pdf /tmp/out
pdftotext /tmp/chatgpt-stress.pdf -
```

They register fonts by **absolute** path (the app registers by URL, which only
resolves in the browser). With no network, emoji simply won't embed but the rest
of the layout still renders. See [PDF.md](./PDF.md).

## Before Opening a PR

```bash
npm run lint
npm run test
npm run audit          # npm audit --audit-level=high
npm run format         # prettier
```
