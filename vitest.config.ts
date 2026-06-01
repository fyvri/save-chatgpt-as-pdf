import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // __tests__/_render-*.test.ts are manual visual harnesses: they hit the
    // Twemoji CDN and write PDFs to /tmp, so they're excluded from the default
    // (CI) suite. Run them on demand with the no-exclude runner config:
    //   npx vitest run -c vitest.preview.config.ts __tests__/_render-stress.test.ts
    exclude: [...configDefaults.exclude, '**/_render-*.test.ts'],
  },
})
