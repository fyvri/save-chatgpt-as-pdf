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
              // cdn.jsdelivr.net: react-pdf fetches Twemoji emoji PNGs from here
              // at render time (Font.registerEmojiSource). Without it the browser
              // refuses the fetch and PDF generation throws.
              // data:: react-pdf loads its yoga-layout WebAssembly module by
              // fetching an inlined data: URL in the browser. connect-src governs
              // fetch(), so without data: the WASM load is blocked and the PDF
              // never renders (the data:application/octet-stream;base64,AGFzbQ…
              // CSP violation seen in the console).
              "connect-src 'self' https://*.upstash.io https://cdn.jsdelivr.net data:",
              // react-pdf's <PDFViewer> embeds the generated PDF in an
              // iframe with a blob: URL — 'none' would render a blank preview.
              "frame-src 'self' blob:",
              // react-pdf spins up its renderer in a Web Worker created from a
              // blob: URL. worker-src is unset by default, so it falls back to
              // script-src ('self' 'unsafe-inline'), which forbids blob: and
              // blocks the worker ("Creating a worker from 'blob:…' violates …
              // script-src" in the console). Allow blob: workers explicitly.
              "worker-src 'self' blob:",
              // The inline PDF preview is an <iframe src="blob:…pdf">. Chromium
              // (especially on Android/mobile) renders that PDF through its
              // internal PDFium plugin, which is governed by object-src — NOT
              // frame-src. With object-src 'none' the mobile viewer is blocked
              // and shows "This content is blocked. Contact the site owner to
              // fix the issue." Allow same-origin + blob: objects so the
              // embedded PDF viewer can load the generated blob on every device.
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
