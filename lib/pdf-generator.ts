import { Font, pdf } from '@react-pdf/renderer'
import React from 'react'
import { PdfDocument } from '@/components/pdf/PdfDocument'
import type { Message } from '@/types/chatgpt'

// Register fonts at module load — must happen before any pdf() call.
// Files must exist in /public/fonts/ — see setup instructions for download links.
Font.register({
  family: 'Roboto',
  fonts: [
    { src: '/fonts/Roboto-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Roboto-Bold.ttf', fontWeight: 700 },
    // True italics — markdown emphasis (*…*) and bold-italic (***…***) now
    // render as real obliqued glyphs instead of a faux weight/colour tweak.
    { src: '/fonts/Roboto-Italic.ttf', fontWeight: 400, fontStyle: 'italic' },
    { src: '/fonts/Roboto-BoldItalic.ttf', fontWeight: 700, fontStyle: 'italic' },
  ],
})

Font.register({
  family: 'RobotoMono',
  src: '/fonts/RobotoMono-Regular.ttf',
})

// Symbol fallback — the bundled Roboto subset has no glyphs for the typographic
// symbols ChatGPT leans on (→ ← ↔ arrows, ✔ ✓ ✗ checkmarks, and the math
// operators √ ∑ ∫ ∞ ≤ ≥ ≠ produced by the LaTeX cleaner). react-pdf does
// per-glyph font fallback when `fontFamily` is an array, so we register this
// DejaVu-Sans subset and list it after Roboto/RobotoMono. Both weights point at
// the one regular file so a symbol inside bold text (e.g. a bold blockquote
// "**A → B**") still resolves instead of dropping to .notdef.
Font.register({
  family: 'SymbolFallback',
  fonts: [
    { src: '/fonts/SymbolFallback-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/SymbolFallback-Regular.ttf', fontWeight: 700 },
    // Italic variants point at the same file so a symbol inside emphasised text
    // (e.g. "*A → B*") still resolves instead of dropping to .notdef.
    { src: '/fonts/SymbolFallback-Regular.ttf', fontWeight: 400, fontStyle: 'italic' },
    { src: '/fonts/SymbolFallback-Regular.ttf', fontWeight: 700, fontStyle: 'italic' },
  ],
})

// Emoji support — Roboto carries no emoji glyphs, so react-pdf would otherwise
// drop them (leaving headings like "🧠 Konsep" iconless). Registering an emoji
// source makes react-pdf swap each emoji for an inline color image fetched from
// the Twemoji CDN at render time (render runs client-side in the browser).
// 72×72 PNGs keep the request small while staying crisp at body/heading sizes.
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/',
})

/**
 * Generate a PDF Blob from a list of messages.
 * Called client-side inside useChatGPTScrape after conversion.
 *
 * @param messages   - The scraped conversation turns.
 * @param title      - The real ChatGPT conversation title; when omitted the
 *                     document derives one from the first user message.
 * @param exportedAt - The exact export moment, captured once by the caller so
 *                     the PDF hero stamp matches the WhatsApp share caption.
 *                     Defaults to "now" when omitted.
 */
export async function generatePdfBlob(
  messages: Message[],
  title?: string,
  exportedAt?: Date
): Promise<Blob> {
  // Pre-load the registered text faces so glyph metrics are available before
  // layout. react-pdf measures text during layout; if a face is still being
  // fetched, lines can be mis-measured and collapse onto each other. Awaiting
  // here makes the render deterministic regardless of network timing.
  // Failures are swallowed — per-glyph fallback still applies at render time.
  await Promise.allSettled([
    Font.load({ fontFamily: 'Roboto', fontWeight: 400 }),
    Font.load({ fontFamily: 'Roboto', fontWeight: 700 }),
    Font.load({ fontFamily: 'Roboto', fontWeight: 400, fontStyle: 'italic' }),
    Font.load({ fontFamily: 'Roboto', fontWeight: 700, fontStyle: 'italic' }),
    Font.load({ fontFamily: 'RobotoMono' }),
    Font.load({ fontFamily: 'SymbolFallback' }),
  ])

  // PdfDocument is a React component — use JSX, not function call
  const doc = React.createElement(PdfDocument, { messages, title, exportedAt })
  // Cast: PdfDocument renders a <Document>, but its prop type differs from
  // react-pdf's expected DocumentProps element. Behavior is correct at runtime.
  return await pdf(doc as unknown as Parameters<typeof pdf>[0]).toBlob()
}
