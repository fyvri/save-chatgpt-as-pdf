/**
 * Visual preview harness (not an assertion test).
 *
 * Renders the PdfDocument to /tmp so the layout can be inspected with
 * `pdftoppm -png` / `pdftotext`. Mirrors the structure of the reference
 * ChatGPT conversation (emoji headings, lists, blockquote, table with
 * checkmarks, JSON code block, inline formatting) to exercise the redesign.
 *
 * Fonts are registered by ABSOLUTE path here (the app registers them by URL,
 * which only resolves in the browser). Emoji are fetched from the Twemoji CDN
 * at render time; if the sandbox has no network the emoji simply won't embed,
 * but the rest of the layout still renders.
 *
 * Excluded from CI (see vitest.config.ts). Run on demand:
 *   npx vitest run -c vitest.preview.config.ts __tests__/_render-preview.test.ts
 */
import { describe, it, expect } from 'vitest'
import { Font, renderToFile } from '@react-pdf/renderer'
import React from 'react'
import path from 'node:path'
import { PdfDocument } from '@/components/pdf/PdfDocument'
import type { Message } from '@/types/chatgpt'

const FONT_DIR = path.resolve(__dirname, '..', 'public', 'fonts')

Font.register({
  family: 'Roboto',
  fonts: [
    { src: path.join(FONT_DIR, 'Roboto-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'Roboto-Bold.ttf'), fontWeight: 700 },
    { src: path.join(FONT_DIR, 'Roboto-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
    { src: path.join(FONT_DIR, 'Roboto-BoldItalic.ttf'), fontWeight: 700, fontStyle: 'italic' },
  ],
})
Font.register({ family: 'RobotoMono', src: path.join(FONT_DIR, 'RobotoMono-Regular.ttf') })
Font.register({
  family: 'SymbolFallback',
  fonts: [
    { src: path.join(FONT_DIR, 'SymbolFallback-Regular.ttf'), fontWeight: 400 },
    {
      src: path.join(FONT_DIR, 'SymbolFallback-Regular.ttf'),
      fontWeight: 400,
      fontStyle: 'italic',
    },
  ],
})
// Emoji source mirrors lib/pdf-generator.ts. The Twemoji CDN fetch can be slow
// in CI/sandbox; if it stalls, comment this out to get a fast, network-free
// check of just the symbol font fallback (arrows/checkmarks).
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/',
})

const messages: Message[] = [
  {
    role: 'user',
    timestamp: '2026-04-22 08:48:04',
    content: [
      {
        type: 'text',
        value:
          'jika saya mempunyai layar lcd, saya ingin menciptakan mini komputer sendiri, namun isi dari mini computer inin nantinya hanya chrome saja, saya ingin membuat satu multi-app menggunakan pwa',
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        value: [
          'Ide kamu menarik, tapi perlu diluruskan sedikit: kamu **tidak benar-benar membuat "komputer yang hanya berisi Chrome" dari nol**, melainkan membuat **perangkat sederhana (mini PC) yang auto-boot ke browser dan menjalankan PWA sebagai aplikasi utama**. Itu jauh lebih realistis dan memang sering dipakai (kiosk system).',
          '',
          'Aku bantu jelaskan cara yang paling masuk akal dan efisien 👇',
          '',
          '## 🧠 Konsep Dasarnya',
          '',
          'Yang akan kamu buat adalah:',
          '',
          '> **Mini komputer → auto nyala → langsung buka browser → load PWA → terasa seperti aplikasi native**',
          '',
          'Jadi sebenarnya:',
          '',
          '- OS tetap ada (Linux ringan)',
          '- Browser jalan fullscreen (kiosk mode)',
          '- PWA kamu jadi "satu-satunya app"',
          '',
          '## 🔧 1. Hardware yang Bisa Dipakai',
          '',
          'Beberapa opsi populer:',
          '',
          '### ✅ Raspberry Pi (paling umum)',
          '',
          '- Raspberry Pi 4 Model B (recommended)',
          '- MicroSD (untuk OS)',
          '- Layar LCD (HDMI atau DSI)',
          '- Power supply',
          '',
          'Alternatif:',
          '',
          '- Mini PC bekas (Intel NUC)',
          '- Android TV box (lebih ribet modding)',
          '',
          '## 💻 2. Sistem Operasi',
          '',
          'Pakai OS ringan:',
          '',
          '- Raspberry Pi OS (paling gampang)',
          '- Atau:',
          '    - Ubuntu Server + GUI ringan',
          '    - DietPi (lebih ringan lagi)',
        ].join('\n'),
      },
      {
        type: 'text',
        value: ['Pastikan PWA kamu punya:', '', '### a. manifest.json', '', 'Contoh:'].join('\n'),
      },
      {
        type: 'code',
        language: 'json',
        value: [
          '{',
          '  "name": "Mini App",',
          '  "short_name": "MiniApp",',
          '  "start_url": "/",',
          '  "display": "standalone",',
          '  "background_color": "#ffffff",',
          '  "theme_color": "#000000",',
          '  "icons": [',
          '    {',
          '      "src": "icon.png",',
          '      "sizes": "192x192",',
          '      "type": "image/png"',
          '    }',
          '  ]',
          '}',
        ].join('\n'),
      },
      {
        type: 'text',
        value: [
          '### b. Service Worker',
          '',
          'Untuk:',
          '',
          '- Offline mode',
          '- Caching',
          '- Performa',
          '',
          '---',
          '',
          '## 📊 Perbandingan Singkat',
          '',
          '| Model | WiFi | Bluetooth | Performa | Cocok untuk |',
          '| --- | :---: | :---: | --- | --- |',
          '| Zero W | ✔ | ✔ | Rendah | PWA ringan |',
          '| Pi 3 B | ✔ | ✔ | Sedang | PWA + touchscreen |',
          '| Pi 4 | ✔ | ✔ | Tinggi | Proyek serius |',
          '',
          '## 🎯 Rekomendasi Jujur (Biar Tidak Nyesel)',
          '',
          'Kalau tujuan kamu `LCD touchscreen + PWA`:',
          '',
          '- **Budget minim** → ambil Zero W',
          '- **Lebih nyaman** → ambil Pi 3 atau Pi 4',
        ].join('\n'),
      },
    ],
  },
  {
    role: 'user',
    timestamp: '2026-04-22 08:49:30',
    content: [{ type: 'text', value: 'jika menggunakan lesberry nanti apakah bisa untuk wifi?' }],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        value: [
          'Sepertinya yang kamu maksud itu **"Raspberry" (Raspberry Pi)** ya, bukan "lesberry" 😄',
          '',
          'Jawabannya: **bisa banget pakai WiFi — bahkan sudah built-in (tergantung modelnya).**',
          '',
          '## 📡 Dukungan WiFi di Raspberry Pi',
          '',
          '👉 Semua itu sudah ada:',
          '',
          '- WiFi (2.4GHz / 5GHz untuk Pi 4)',
          '- Bluetooth',
          '',
          'Jadi kamu tinggal connect seperti HP biasa.',
        ].join('\n'),
      },
    ],
  },
]

describe('PDF visual preview', () => {
  it('renders the reference conversation to /tmp/chatgpt-preview.pdf', async () => {
    const out = '/tmp/chatgpt-preview.pdf'
    await renderToFile(
      React.createElement(PdfDocument, {
        messages,
        title: 'Membuat mini komputer PWA',
      }) as unknown as Parameters<typeof renderToFile>[0],
      out
    )
    expect(out).toBe('/tmp/chatgpt-preview.pdf')
  }, 180000)
})
