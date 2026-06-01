# Contributing

## Prerequisites

- Node.js 22+ (`nvm use`)
- VS Code + ESLint + Tailwind CSS IntelliSense extensions

## Setup

```bash
git clone https://github.com/fyvri/save-chatgpt-as-pdf
cd save-chatgpt-as-pdf
nvm use                      # Node 22+ (see .nvmrc)
npm install
cp .env.example .env.local   # Upstash vars are optional for local dev
npm run dev
```

The shadcn/ui primitives (`components/ui/*`) and `components.json` are checked
into the repository — you do **not** need to re-run `shadcn init`/`add`. Only run
shadcn if you are intentionally adding a new primitive (use `--legacy-peer-deps`
because of React 19 peer ranges).

The PDF fonts in `/public/fonts/` are in the repo too. If they are missing in
your clone, see [DEPLOY.md](./DEPLOY.md) for the four required `.ttf` files.

## Branches

- `feat/` new features
- `fix/` bug fixes
- `docs/` documentation
- `chore/` tooling/maintenance

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `chore:`.

## Pull Requests

- One feature per PR.
- Must pass `npm run lint`, `npm run test`, and `npm audit --audit-level=high`.

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
| `npm run format`       | Prettier write across the repo                       |
| `npm run audit`        | `npm audit --audit-level=high`                       |

## Tests

Run `npm run test` — files live in `__tests__/` (see [TESTING.md](./TESTING.md)).
The visual harnesses (`_render-preview.test.ts`, `_render-stress.test.ts`) are
excluded from the default suite (they hit the Twemoji CDN and write PDFs to
`/tmp`); run them on demand through the preview config:
`npx vitest run -c vitest.preview.config.ts __tests__/_render-stress.test.ts`.

## Updating the Scraper

The scraper decodes ChatGPT's embedded turbo-stream (no DOM selectors). When the
share-page format changes:

1. Edit the decoder in `lib/scraper.ts`.
2. Update the `// TODO: verify … — last checked YYYY-MM-DD` dates.
3. Update the fixtures/assertions in `__tests__/scraper.test.ts`.
4. Update [SCRAPING.md](./SCRAPING.md).

## Formatting

Run `npm run format` before committing.
