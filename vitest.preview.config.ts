/**
 * On-demand runner for the visual PDF harnesses in __tests__/_render-*.test.ts.
 *
 * The default vitest.config.ts excludes `**\/_render-*.test.ts` from CI because
 * those harnesses hit the Twemoji CDN and write PDFs to /tmp. This config has no
 * such exclude, so it can run them when you want to eyeball the layout:
 *
 *   npx vitest run -c vitest.preview.config.ts __tests__/_render-stress.test.ts
 *   npx vitest run -c vitest.preview.config.ts __tests__/_render-preview.test.ts
 *
 * Then inspect the output, e.g.:  pdftoppm -png -r 110 /tmp/chatgpt-stress.pdf out
 */
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { environment: 'node', globals: true },
})
