/**
 * Markdown-fidelity stress harness (manual visual check, not assertions).
 *
 * Exercises every markdown construct the conversion pipeline must preserve:
 * headings h1–h6, paragraphs, hard breaks, nested/ordered/task lists,
 * blockquotes, tables (alignment + inline formatting), fenced + inline code,
 * links (inline + bare), strikethrough, bold/italic/bold-italic, escaped
 * markdown, inline + block math, horizontal rules, long unbreakable strings,
 * emoji, and multilingual text.
 *
 * Run on demand:
 *   npx vitest run -c vitest.preview.config.ts __tests__/_render-stress.test.ts
 * then inspect /tmp/chatgpt-stress.pdf (pdftoppm -png -r 110 …).
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
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/',
})

const md = (parts: string[]) => parts.join('\n')

const messages: Message[] = [
  {
    role: 'user',
    timestamp: '2026-06-01 09:00:00',
    content: [
      {
        type: 'text',
        value:
          'Show me **every** markdown feature: a [link](https://example.com/docs?q=1), `inline code`, ~~strikethrough~~, ***bold italic***, snake_case_word (no italics), and an escaped \\*asterisk\\*.',
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        value: md([
          '# Heading 1',
          '## Heading 2',
          '### Heading 3',
          '#### Heading 4',
          '##### Heading 5',
          '###### Heading 6',
          '',
          'A normal paragraph with a [hyperlink](https://openai.com) that should stay clickable, plus a bare URL https://github.com/fyvri/save-chatgpt-as-pdf and some `inline_code()` and ~~deleted~~ text and ***bold italic***.',
          '',
          'A second paragraph. This line ends with a hard break  ',
          'and continues on the next visual line within the same paragraph.',
          '',
          '> A blockquote spanning',
          '> two source lines, with **bold** and a [link](https://example.org).',
          '>',
          '> Second blockquote paragraph.',
          '',
          '---',
          '',
          '## Lists',
          '',
          '1. First ordered item',
          '2. Second ordered item',
          '   1. Nested ordered',
          '   2. Nested ordered two',
          '      - Deep bullet',
          '      - Deep bullet two',
          '3. Third item with a continuation line',
          '   that wraps under the same item.',
          '',
          '- Bullet with `code`',
          '- [ ] Unchecked task',
          '- [x] Checked task',
          '- Bullet, then nested content:',
          '    - sub bullet a',
          '    - sub bullet b',
          '',
          '## Table',
          '',
          '| Feature | Support | Notes |',
          '| :--- | :---: | ---: |',
          '| **Links** | ✔ | inline `code` ok |',
          '| Strike | ~~no~~ | right aligned |',
          '| Emoji | 🎯 | centered |',
        ]),
      },
      {
        type: 'code',
        language: 'python',
        value: md([
          'def fib(n: int) -> int:',
          '    """Return nth Fibonacci number."""',
          '    a, b = 0, 1',
          '    for _ in range(n):',
          '        a, b = b, a + b   # aligned comment',
          '    return a',
        ]),
      },
      {
        type: 'text',
        value: md([
          'Code with no language:',
          '',
          '```',
          'plain preformatted',
          '  indented two spaces',
          '```',
          '',
          'Inline math $E = mc^2$ and a display formula:',
          '',
          '$$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
          '',
          '## Multilingual & Unicode',
          '',
          '- Français: café, naïve, œuvre',
          '- Deutsch: Größe, Straße',
          '- Symbols: → ← ↔ ⇒ ≤ ≥ ≠ ∑ ∫ √ ∞ · × ÷',
          '- Emoji prose: works great 👍 ✅ ❌ 🚀',
          '',
          'A very long unbreakable token to test wrapping: https://example.com/a/really/long/path/that/keeps/going/and/going/segment/segment/segment/segment',
        ]),
      },
    ],
  },
]

describe('PDF markdown stress', () => {
  it('renders all markdown features to /tmp/chatgpt-stress.pdf', async () => {
    const out = '/tmp/chatgpt-stress.pdf'
    await renderToFile(
      React.createElement(PdfDocument, {
        messages,
        title: 'Markdown Fidelity Stress Test',
      }) as unknown as Parameters<typeof renderToFile>[0],
      out
    )
    expect(out).toBe('/tmp/chatgpt-stress.pdf')
  }, 180000)
})
