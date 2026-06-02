import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

// Next.js Fast Refresh / HMR evaluates modules with eval() in dev only.
// Allow 'unsafe-eval' in development; keep production script-src strict.
//
// 'wasm-unsafe-eval' (prod): react-pdf's layout engine (yoga-layout) calls
// WebAssembly.instantiate() in the browser. Under CSP, compiling/instantiating
// WASM requires either 'unsafe-eval' or the narrower 'wasm-unsafe-eval'. Without
// it the browser throws "CompileError: WebAssembly.instantiate(): ... violates
// the following Content Security Policy directive" and PDF generation aborts.
// 'wasm-unsafe-eval' permits WASM only — it does NOT re-enable JS eval().
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.openai.com' },
      { protocol: 'https', hostname: '**.oaiusercontent.com' },
    ],
  },
  transpilePackages: ['@react-pdf/renderer'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https://*.openai.com https://*.oaiusercontent.com data: blob:",
              // Twemoji emoji PNGs are now served same-origin from /emoji/
              // (Font.registerEmojiSource), so no third-party CDN is needed —
              // 'self' covers the render-time fetch.
              // data:: react-pdf loads its yoga-layout WebAssembly module by
              // fetching an inlined data: URL in the browser. connect-src governs
              // fetch(), so without data: the WASM load is blocked and the PDF
              // never renders (the data:application/octet-stream;base64,AGFzbQ…
              // CSP violation seen in the console).
              "connect-src 'self' https://*.upstash.io data:",
              // LEGACY: the PDF preview used to be an <iframe src="blob:…pdf">.
              // It is now a pdf.js <canvas> (components/shared/PdfCanvasViewer),
              // so frame-src/object-src blob: are no longer required. Kept as a
              // harmless safety net; safe to drop if you're trimming the CSP.
              "frame-src 'self' blob:",
              // react-pdf spins up its renderer in a Web Worker created from a
              // blob: URL, so blob: is required here. 'self' additionally allows
              // the pdf.js preview worker served at /pdf.worker.min.mjs. worker-src
              // is unset by default and falls back to script-src ('self'
              // 'unsafe-inline'), which forbids blob: and blocks the worker
              // ("Creating a worker from 'blob:…' violates … script-src").
              "worker-src 'self' blob:",
              // LEGACY (see frame-src above): object-src governed Chromium's
              // PDFium plugin for the old <iframe> preview. The canvas viewer
              // doesn't need it; retained as a harmless safety net.
              "object-src 'self' blob:",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
