// Build-time asset prep. Copies generated/vendored assets into /public so they
// are served same-origin (fast, edge-cached, no third-party CDN dependency).
// Wired to postinstall / predev / prebuild / build:worker so it runs on every
// install and on every build path (incl. the opennextjs-cloudflare deploy).
//
//   - pdf.worker.min.mjs : pdf.js worker for the on-device PDF preview.
//   - emoji/             : Twemoji 72x72 PNGs (codepoint-named) for the PDF
//                          renderer. Previously fetched per-emoji from
//                          cdn.jsdelivr.net at render time — that CDN round-trip
//                          was ~5.6s of a ~7s cold render. Serving them locally
//                          brings emoji conversions down to the ~1.4s warm floor.
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// pdf.js worker — small, always copy so it tracks the installed version.
copyFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), 'public/pdf.worker.min.mjs')

// Twemoji 72x72 set — ~3.7k files / 15MB. Skip the recursive copy when it's
// already populated so dev/build startup stays fast; delete public/emoji to
// force a refresh after bumping twemoji-emojis.
const emojiSrc = join(dirname(require.resolve('twemoji-emojis/package.json')), 'vendor', '72x72')
const emojiDest = 'public/emoji'
const alreadyCopied = existsSync(emojiDest) && readdirSync(emojiDest).length > 3000
if (!alreadyCopied) {
  mkdirSync(emojiDest, { recursive: true })
  cpSync(emojiSrc, emojiDest, { recursive: true })
  console.log(`[prepare-assets] copied emoji set -> ${emojiDest}`)
}
console.log('[prepare-assets] done')
