import React from 'react'
import { Document, Page, Text, View, Image, Link, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import type { Message, ContentBlock } from '@/types/chatgpt'
import { APP_NAME } from '@/constants/app'
import { formatExportStamp } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Palette — tuned to the real ChatGPT reading experience                     */
/* -------------------------------------------------------------------------- */

const C = {
  ink: '#33373d', // body text
  inkStrong: '#16181d', // headings / titles
  muted: '#6b7280', // secondary text
  faint: '#9aa1ac', // metadata, captions
  hair: '#ededf1', // hairline rules
  border: '#e4e6eb', // visible borders
  accent: '#10a37f', // ChatGPT green
  userBubble: '#f4f4f5', // neutral user bubble (matches ChatGPT share view)
  userBubbleBorder: '#ececef',
  heart: '#e8332a', // brand red — footer heart
  link: '#2563eb',
  // code block (GitHub-light inspired)
  codeBg: '#f6f8fa',
  codeBar: '#eef1f4',
  codeBorder: '#e1e6ec',
  codeText: '#24292e',
  kw: '#cf222e',
  str: '#0a3069',
  num: '#0550ae',
  com: '#6e7781',
  fn: '#8250df',
  // inline code
  inlineInk: '#b3146b',
} as const

// Material heart glyph (24×24) — rendered as vector so the red heart is exact,
// independent of whether the embedded font carries an emoji/heart glyph.
const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

// Assistant avatar mark (24×24 sparkle) + user avatar mark (24×24 person),
// drawn as vectors inside the per-turn header circles (reference framing).
const SPARKLE_PATH =
  'M12 2c.7 3.9 2.1 5.3 6 6-3.9.7-5.3 2.1-6 6-.7-3.9-2.1-5.3-6-6 3.9-.7 5.3-2.1 6-6z'
const PERSON_PATH =
  'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'

/* -------------------------------------------------------------------------- */
/*  LaTeX → readable unicode                                                   */
/* -------------------------------------------------------------------------- */

// No math engine ships in the PDF, so we render LaTeX as cleaned unicode text:
// drop delimiters, map common commands/symbols to glyphs, and unwrap braces.
// This keeps formulas legible instead of dumping raw `\frac{…}` source.
const LATEX_SYMBOLS: Record<string, string> = {
  pm: '±',
  mp: '∓',
  times: '×',
  div: '÷',
  cdot: '·',
  ast: '∗',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  propto: '∝',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  int: '∫',
  sum: '∑',
  prod: '∏',
  sqrt: '√',
  forall: '∀',
  exists: '∃',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  supset: '⊃',
  cup: '∪',
  cap: '∩',
  rightarrow: '→',
  to: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  leftrightarrow: '↔',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  varphi: 'φ',
  omega: 'ω',
  Delta: 'Δ',
  Gamma: 'Γ',
  Sigma: 'Σ',
  Omega: 'Ω',
  Pi: 'Π',
  Theta: 'Θ',
  ldots: '…',
  dots: '…',
  cdots: '⋯',
}

function cleanLatex(src: string): string {
  let s = src.trim()
  // Strip display/inline delimiters that may survive scraping.
  s = s
    .replace(/^\$\$?/, '')
    .replace(/\$\$?$/, '')
    .replace(/^\\[([]/, '')
    .replace(/\\[)\]]$/, '')
  // Resolve \sqrt{…}, \frac{…}{…}, \text{…} innermost-first: each pass matches
  // only brace groups with no nested braces, so repeating collapses nesting
  // (e.g. \frac{\sqrt{x}}{2} needs the sqrt resolved before the frac matches).
  for (let pass = 0; pass < 6; pass++) {
    const before = s
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    s = s.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1')
    if (s === before) break
  }
  // Sizing/grouping commands that carry no glyph
  s = s.replace(/\\(?:left|right|displaystyle|limits|!)/g, '')
  s = s.replace(/\\q?quad/g, '   ')
  // Named symbols/greek (catch-all drops any unmapped command)
  s = s.replace(/\\([A-Za-z]+)/g, (_m, name: string) => LATEX_SYMBOLS[name] ?? '')
  // Spacing commands
  s = s.replace(/\\[,;:! ]/g, ' ').replace(/~/g, ' ')
  // Remove remaining braces; collapse whitespace.
  s = s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
  return s
}

/* -------------------------------------------------------------------------- */
/*  Display text normalization                                                 */
/* -------------------------------------------------------------------------- */

// Emoji are now rendered as inline Twemoji images (see Font.registerEmojiSource
// in lib/pdf-generator.ts), so we no longer strip them — they're load-bearing
// in ChatGPT prose (🧠/✅/❌ headings, ✔ table cells, 👉 pointers). We still
// rewrite ChatGPT's leaked citation markers like
// `entity["product","Raspberry Pi 4 Model B"]` down to the human label.
// Applied only to prose (headings/paragraphs/lists/quotes/tables), never code.
function normalizeText(input: string): string {
  let s = input
  // ChatGPT entity citation: entity["type","Label", …] → the human Label.
  s = s.replace(/entity\[\s*"[^"]*"\s*,\s*"([^"]*)"[^\]]*\]/g, '$1')
  // Collapse stray runs of spaces/tabs (the block parser trims each line, so
  // leading gaps need no special handling). Emoji are kept verbatim.
  s = s.replace(/[ \t]{2,}/g, ' ')
  return s
}

/* -------------------------------------------------------------------------- */
/*  Layout constants                                                           */
/* -------------------------------------------------------------------------- */

const MARGIN_X = 52
const HEADER_TOP = 26
const FOOTER_BOTTOM = 24

/* -------------------------------------------------------------------------- */
/*  Styles                                                                     */
/* -------------------------------------------------------------------------- */

// Font stacks — listing SymbolFallback after the primary face lets react-pdf
// resolve per-glyph: text/code render in Roboto(/Mono), while symbols the
// subset lacks (→ ✔ √ ∑ …) fall back to the DejaVu-derived SymbolFallback.
const FONT_BODY = ['Roboto', 'SymbolFallback']
const FONT_MONO = ['RobotoMono', 'SymbolFallback']

const styles = StyleSheet.create({
  page: {
    // Top/bottom padding reserves space for the fixed letterhead + footer that
    // repeat on every page; content flows between them.
    paddingTop: 60,
    paddingBottom: 52,
    paddingHorizontal: MARGIN_X,
    fontFamily: FONT_BODY,
    fontSize: 11,
    color: C.ink,
    // NOTE: do NOT set lineHeight on the Page — a page-level line-height
    // multiplier corrupts the layout of the `fixed` footer and prevents it
    // from rendering. Line height is set per block (paragraph, list, code…).
  },

  /* Running letterhead — fixed on every page */
  letterhead: {
    position: 'absolute',
    top: HEADER_TOP,
    left: MARGIN_X,
    right: MARGIN_X,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 7,
    borderBottom: `0.75pt solid ${C.hair}`,
  },
  letterheadBrand: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1,
    color: C.faint,
    textTransform: 'uppercase',
  },
  // Brand lockup on the right of the letterhead: app logo + "Save ChatGPT as PDF".
  letterheadBrandLockup: { flexDirection: 'row', alignItems: 'center' },
  letterheadLogo: { width: 13, height: 13, marginRight: 6 },
  letterheadSource: { fontSize: 9, color: C.faint, letterSpacing: 0.3 },

  /* Hero title block — flows once at the start of the document (page 1) */
  hero: { marginBottom: 20 },
  heroEyebrow: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: C.accent,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroTitle: { fontSize: 19, fontWeight: 700, color: C.inkStrong, lineHeight: 1.2 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  heroMeta: { fontSize: 8.5, color: C.faint },
  heroMetaDot: { fontSize: 8.5, color: C.faint, marginHorizontal: 5 },
  heroRule: { marginTop: 14, borderBottom: `1pt solid ${C.border}` },

  /* Message turn — reference (AI Exporter) framing: each turn opens with a
     header (avatar + role + timestamp), then the body. Assistant body is full
     width; user body is a right-aligned grey bubble. Generous gap between turns. */
  message: { marginBottom: 12 },

  // Assistant header: logo avatar + "ChatGPT" label, left aligned.
  asstHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  // User header: timestamp + "You" + avatar, right aligned.
  userHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 9,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAssistant: { backgroundColor: '#ffffff', border: `1pt solid ${C.border}`, marginRight: 8 },
  avatarUser: { backgroundColor: C.inkStrong, marginLeft: 8 },
  roleName: { fontSize: 10.5, fontWeight: 700, color: C.inkStrong },
  metaTime: { fontSize: 8.5, color: C.faint, marginRight: 8 },

  // Assistant content sits full-width like the reference answer column.
  assistantBody: {},
  userTurn: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: C.userBubble,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 15,
  },

  /* Markdown blocks — airy, reference-matched vertical rhythm. Every text block
     carries an explicit lineHeight (~0.95 for prose): react-pdf forbids a
     page-level lineHeight (it breaks the fixed footer), and a too-tight value
     lets inline emoji images and font-metric variance collapse adjacent lines
     into each other. 1.5 mirrors ChatGPT's reading rhythm and leaves leading. */
  paragraph: { marginBottom: 0, lineHeight: 0.95 },
  h1: {
    fontSize: 17,
    fontWeight: 700,
    color: C.inkStrong,
    marginTop: 5,
    marginBottom: 5,
    lineHeight: 1.3,
  },
  h2: {
    fontSize: 15,
    fontWeight: 700,
    color: C.inkStrong,
    marginTop: 5,
    marginBottom: 5,
    lineHeight: 1.3,
  },
  h3: {
    fontSize: 12.5,
    fontWeight: 700,
    color: C.inkStrong,
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 1.35,
  },
  hr: { borderBottom: `1pt solid ${C.hair}`, marginVertical: 11 },

  /* Lists — nested by source indentation. Each item gets paddingLeft from its
     depth; the marker column is fixed-width and the text flexes (hang indent). */
  list: { marginTop: 4, marginBottom: 4 },
  listItem: { flexDirection: 'row', marginBottom: 0 },
  marker: { width: 18, flexShrink: 0, lineHeight: 1 },
  markerBullet: { color: C.muted },
  markerNum: { color: C.ink },
  listText: { flex: 1, lineHeight: 1 },

  blockquote: {
    borderLeft: `2.5pt solid ${C.border}`,
    paddingLeft: 11,
    paddingVertical: 2,
    marginTop: 4,
    marginBottom: 4,
  },
  blockquoteText: { color: C.muted, lineHeight: 1, marginBottom: 4 },

  bold: { fontWeight: 700 },
  // True italic now that Roboto-Italic / Roboto-BoldItalic are registered
  // (see lib/pdf-generator.ts). react-pdf resolves fontStyle per-run.
  italic: { fontStyle: 'italic' },
  boldItalic: { fontWeight: 700, fontStyle: 'italic' },
  strike: { textDecoration: 'line-through' },
  linkText: { color: C.link, textDecoration: 'underline' },
  // Inline code flows with the surrounding text: monospace + a distinct tint,
  // no background box (a react-pdf inline background renders as an oversized,
  // baseline-misaligned block that breaks the line rhythm).
  inlineCode: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    color: C.inlineInk,
  },
  // Inline math — rendered after stripping LaTeX delimiters/commands.
  inlineMath: { fontFamily: FONT_MONO, fontSize: 10, color: C.inkStrong },

  /* Code block */
  codeBlock: {
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 8,
    border: `1pt solid ${C.codeBorder}`,
    overflow: 'hidden',
  },
  codeBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.codeBar,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderBottom: `1pt solid ${C.codeBorder}`,
  },
  // Lowercase language tab, like the reference (no copy button).
  codeLang: {
    fontSize: 8.5,
    color: C.muted,
    letterSpacing: 0.2,
  },
  codeBody: { backgroundColor: C.codeBg, paddingVertical: 11, paddingHorizontal: 13 },
  codeLine: { fontFamily: FONT_MONO, fontSize: 9, lineHeight: 1.75, color: C.codeText },

  /* LaTeX — delimiters/commands stripped, presented centered as a math display */
  latexBlock: {
    fontFamily: FONT_MONO,
    color: C.inkStrong,
    fontSize: 10,
    textAlign: 'center',
    backgroundColor: C.codeBg,
    borderRadius: 6,
    border: `1pt solid ${C.codeBorder}`,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 1.5,
  },

  /* Images — a run of image blocks renders as a figure group. A lone image is
     full content width; multiple images wrap into a 2-column grid (mirroring
     ChatGPT's inline carousel). Each figure stays whole across page breaks. */
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 8 },
  imageFigSingle: { width: '100%', marginBottom: 8 },
  imageFigMulti: { width: '50%', paddingRight: 8, marginBottom: 8 },
  // width:100% scales the image to its column; react-pdf derives height from the
  // intrinsic aspect ratio, and objectFit:'contain' + maxHeight guards against a
  // tall image overflowing a page (it letterboxes instead of distorting).
  imageImgSingle: {
    width: '100%',
    objectFit: 'contain',
    maxHeight: 320,
    borderRadius: 4,
    border: `1pt solid ${C.border}`,
  },
  imageImgMulti: {
    width: '100%',
    objectFit: 'contain',
    maxHeight: 200,
    borderRadius: 4,
    border: `1pt solid ${C.border}`,
  },
  imageCaption: { fontSize: 7.5, color: C.faint, marginTop: 3, lineHeight: 1 },

  /* Table — ChatGPT style: horizontal rules only, no vertical borders, no
     header fill. The header is set apart by bold text + a heavier bottom rule. */
  table: {
    marginTop: 6,
    marginBottom: 9,
    borderTop: `1pt solid ${C.border}`,
  },
  tableRow: { flexDirection: 'row', borderBottom: `0.75pt solid ${C.hair}` },
  tableRowHeader: { flexDirection: 'row', borderBottom: `1pt solid ${C.border}` },
  tableCell: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  tableCellText: { fontSize: 10, lineHeight: 1.3, color: C.ink },
  tableHeaderText: { fontSize: 10, fontWeight: 700, color: C.inkStrong, lineHeight: 1.3 },

  /* Footer — fixed on every page */
  footer: {
    position: 'absolute',
    bottom: FOOTER_BOTTOM,
    left: MARGIN_X,
    right: MARGIN_X,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 7,
    borderTop: `0.75pt solid ${C.hair}`,
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center' },
  footerText: { fontSize: 8, color: C.muted },
  // "Membasuh" is a live hyperlink but must read as plain footer text: inherit
  // the exact footerText appearance (size/colour) and explicitly reset the
  // defaults react-pdf's <Link> applies (blue, underline) so it blends in.
  footerLink: {
    fontSize: 8,
    color: C.muted,
    fontWeight: 400,
    textDecoration: 'none',
  },
  footerHeart: { marginHorizontal: 3 },
  footerPage: { fontSize: 8, color: C.muted, fontWeight: 700 },
})

/* -------------------------------------------------------------------------- */
/*  Inline markdown (bold / emphasis / inline-code / links)                    */
/* -------------------------------------------------------------------------- */

// Bare-URL autolink patterns. The trailing class drops sentence punctuation so
// "see https://x.com." doesn't swallow the period into the link.
const RAW_URL = /^(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]])/
const WWW_URL = /^(www\.[^\s<>()]+[^\s<>().,;:!?'"\]])/

/**
 * Inline markdown → react-pdf <Text>/<Link> nodes.
 *
 * A left-to-right scanner (not one mega-regex) so spans nest correctly: at each
 * position it tries each construct in priority order, and the inner text of
 * bold/italic/strike/link is parsed recursively. Handles backslash escapes,
 * code spans (incl. multi-backtick), real clickable links, bare-URL autolinks,
 * bold-italic / bold / italic (with `_` word-boundary rules so snake_case is
 * left alone), strikethrough, and inline math ($…$ and \(…\)).
 */
function parseInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let k = 0
  let buf = ''
  const flush = () => {
    if (buf) {
      nodes.push(<Text key={`${keyBase}-t${k++}`}>{buf}</Text>)
      buf = ''
    }
  }
  const span = (style: (typeof styles)[keyof typeof styles], inner: string, tag: string) => {
    flush()
    nodes.push(
      <Text key={`${keyBase}-${tag}${k++}`} style={style}>
        {parseInline(inner, `${keyBase}-${tag}${k}`)}
      </Text>
    )
  }

  let i = 0
  const n = text.length
  const prevChar = (idx: number) => (idx > 0 ? text[idx - 1]! : '')

  while (i < n) {
    const rest = text.slice(i)
    const c = text[i]!
    let m: RegExpExecArray | null

    // Inline math \(…\) — checked before the escape rule so a leading "\(" is
    // treated as a math delimiter, not an escaped parenthesis.
    if (c === '\\' && text[i + 1] === '(') {
      m = /^\\\(([\s\S]+?)\\\)/.exec(rest)
      if (m) {
        flush()
        nodes.push(
          <Text key={`${keyBase}-m${k++}`} style={styles.inlineMath}>
            {cleanLatex(m[1]!)}
          </Text>
        )
        i += m[0].length
        continue
      }
    }

    // Backslash escape — emit the next char literally (excludes "(" / ")", left
    // to the math rule above; an escaped paren is vanishingly rare in practice).
    if (c === '\\' && i + 1 < n && /[\\`*_~[\]#+\-.!>{}]/.test(text[i + 1]!)) {
      buf += text[i + 1]
      i += 2
      continue
    }

    // Code span — `code` or ``co`de``; inner is literal (no nesting).
    if (c === '`') {
      m = /^(`+)([\s\S]*?[^`]|[\s\S])\1(?!`)/.exec(rest)
      if (m) {
        flush()
        nodes.push(
          <Text key={`${keyBase}-c${k++}`} style={styles.inlineCode}>
            {m[2]!.replace(/^ (.*) $/, '$1')}
          </Text>
        )
        i += m[0].length
        continue
      }
    }

    // Link [text](url "title") — emit a real, clickable <Link>.
    if (c === '[') {
      m = /^\[((?:\\.|[^[\]])*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*"|\s+'[^']*')?\s*\)/.exec(rest)
      if (m) {
        flush()
        nodes.push(
          <Link key={`${keyBase}-l${k++}`} src={m[2]!} style={styles.linkText}>
            {parseInline(m[1] ?? '', `${keyBase}-l${k}`)}
          </Link>
        )
        i += m[0].length
        continue
      }
    }

    // Bare-URL autolink (only at a word boundary).
    if ((c === 'h' || c === 'w') && /[^A-Za-z0-9]/.test(prevChar(i) || ' ')) {
      m = RAW_URL.exec(rest) || WWW_URL.exec(rest)
      if (m) {
        flush()
        const raw = m[1]!
        const href = raw.startsWith('www.') ? `https://${raw}` : raw
        nodes.push(
          <Link key={`${keyBase}-a${k++}`} src={href} style={styles.linkText}>
            {raw}
          </Link>
        )
        i += raw.length
        continue
      }
    }

    // Strikethrough ~~x~~
    if (c === '~' && text[i + 1] === '~') {
      m = /^~~(?=\S)([\s\S]+?)(?<=\S)~~/.exec(rest)
      if (m) {
        span(styles.strike, m[1]!, 's')
        i += m[0].length
        continue
      }
    }

    // Emphasis via "*": bold-italic, then bold, then italic.
    if (c === '*') {
      if ((m = /^\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/.exec(rest))) {
        span(styles.boldItalic, m[1]!, 'bi')
        i += m[0].length
        continue
      }
      if ((m = /^\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/.exec(rest))) {
        span(styles.bold, m[1]!, 'b')
        i += m[0].length
        continue
      }
      if ((m = /^\*(?=\S)([\s\S]+?)(?<=\S)\*/.exec(rest))) {
        span(styles.italic, m[1]!, 'i')
        i += m[0].length
        continue
      }
    }

    // Emphasis via "_": only at a word boundary, so snake_case is untouched.
    if (c === '_' && /[^A-Za-z0-9]/.test(prevChar(i) || ' ')) {
      if ((m = /^___(?=\S)([\s\S]+?)(?<=\S)___(?![A-Za-z0-9])/.exec(rest))) {
        span(styles.boldItalic, m[1]!, 'ubi')
        i += m[0].length
        continue
      }
      if ((m = /^__(?=\S)([\s\S]+?)(?<=\S)__(?![A-Za-z0-9])/.exec(rest))) {
        span(styles.bold, m[1]!, 'ub')
        i += m[0].length
        continue
      }
      if ((m = /^_(?=\S)([\s\S]+?)(?<=\S)_(?![A-Za-z0-9])/.exec(rest))) {
        span(styles.italic, m[1]!, 'ui')
        i += m[0].length
        continue
      }
    }

    // Inline math $…$ — require a non-space after "$" and not a bare number
    // right after the close, so "$5 and $10" isn't mistaken for math.
    if (c === '$') {
      m = /^\$(?!\s)([^$\n]+?)\$(?!\d)/.exec(rest)
      if (m) {
        flush()
        nodes.push(
          <Text key={`${keyBase}-m${k++}`} style={styles.inlineMath}>
            {cleanLatex(m[1]!)}
          </Text>
        )
        i += m[0].length
        continue
      }
    }

    buf += c
    i++
  }
  flush()
  return nodes.length ? nodes : [<Text key={`${keyBase}-0`}>{text}</Text>]
}

/* -------------------------------------------------------------------------- */
/*  Block-level markdown                                                       */
/* -------------------------------------------------------------------------- */

const HEADING = /^(#{1,6})\s+(.*)$/
const HR = /^(-{3,}|\*{3,}|_{3,})$/
const UL = /^[-*+]\s+(.*)$/
const OL = /^(\d+)[.)]\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
// A single list item, capturing leading indent, marker, and text. Ordered
// markers accept both "1." and "1)"; the indent drives nesting depth.
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
// GitHub task-list checkbox at the start of an item's text: "[ ]" or "[x]".
const TASK = /^\[([ xX])\]\s+(.*)$/
// Opening fence of a code block: ``` or ~~~ (3+), optional language token.
const FENCE = /^(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/
// Markdown table delimiter row, e.g. `| :--- | :--: | ---: |`
const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

// Prose helper: normalize citation markers / stray spacing, then inline-parse.
// Code spans inside are still treated literally by parseInline.
function inline(text: string, keyBase: string): React.ReactNode[] {
  return parseInline(normalizeText(text), keyBase)
}

type Align = 'left' | 'center' | 'right'

// Split a table row into trimmed cells, dropping the outer pipes.
function splitTableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

// Derive per-column alignment from the delimiter row (`:--`, `:--:`, `--:`).
function parseTableAlign(sepCells: string[]): Align[] {
  return sepCells.map((c) => {
    const left = c.startsWith(':')
    const right = c.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    return 'left'
  })
}

function TableBlock({
  header,
  rows,
  align,
  kb,
}: {
  header: string[]
  rows: string[][]
  align: Align[]
  kb: string
}) {
  const cols = header.length
  const norm = (r: string[]) => Array.from({ length: cols }, (_, ci) => r[ci] ?? '')
  return (
    <View style={styles.table} wrap>
      {/* Header row stays intact; body rows never split mid-row */}
      <View style={styles.tableRowHeader} wrap={false}>
        {header.map((c, ci) => (
          <View key={ci} style={styles.tableCell}>
            <Text style={[styles.tableHeaderText, { textAlign: align[ci] ?? 'left' }]}>
              {inline(c, `${kb}-h${ci}`)}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={styles.tableRow} wrap={false}>
          {norm(r).map((c, ci) => (
            <View key={ci} style={styles.tableCell}>
              <Text style={[styles.tableCellText, { textAlign: align[ci] ?? 'left' }]}>
                {inline(c, `${kb}-r${ri}-${ci}`)}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function renderMarkdown(md: string, keyBase: string): React.ReactNode[] {
  // Keep raw lines — leading whitespace carries list-nesting depth, so it must
  // NOT be collapsed globally (the old code did, which flattened deep lists).
  // Citation/spacing normalization is applied per prose chunk via `inline`.
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: React.ReactNode[] = []
  let i = 0
  let k = 0

  const isTableHead = (idx: number) =>
    (lines[idx] ?? '').includes('|') &&
    idx + 1 < lines.length &&
    TABLE_SEP.test((lines[idx + 1] ?? '').trim())

  const isBlockStart = (idx: number): boolean => {
    const t = (lines[idx] ?? '').trim()
    return (
      HEADING.test(t) ||
      HR.test(t) ||
      UL.test(t) ||
      OL.test(t) ||
      QUOTE.test(t) ||
      FENCE.test(t) ||
      t.startsWith('$$') ||
      t.startsWith('\\[') ||
      isTableHead(idx)
    )
  }

  while (i < lines.length) {
    const raw = lines[i] ?? ''
    const t = raw.trim()
    if (!t) {
      i++
      continue
    }

    // Fenced code block — ```lang … ``` / ~~~ … ~~~. The scraper normally
    // splits fences into code ContentBlocks before we get here, but a fence can
    // survive inside prose (e.g. inside a list item), so handle it for safety.
    const fenceM = FENCE.exec(t)
    if (fenceM) {
      const tok = fenceM[1]![0] // ` or ~
      const lang = fenceM[2] || undefined
      const closeRe = new RegExp(`^\\s*\\${tok}{3,}\\s*$`)
      const body: string[] = []
      i++
      while (i < lines.length && !closeRe.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '')
        i++
      }
      if (i < lines.length) i++ // consume the closing fence
      out.push(
        <CodeBlock
          key={`${keyBase}-${k++}`}
          value={body.join('\n')}
          language={lang}
          kb={`${keyBase}-cb${k}`}
        />
      )
      continue
    }

    // Display math — $$ … $$ or \[ … \] (single-line or spanning lines).
    if (t.startsWith('$$') || t.startsWith('\\[')) {
      const open = t.startsWith('$$') ? '$$' : '\\['
      const close = open === '$$' ? '$$' : '\\]'
      const closeAt = t.indexOf(close, open.length)
      let mathSrc: string
      if (closeAt > open.length - 1 && closeAt >= open.length) {
        mathSrc = t.slice(open.length, closeAt)
        i++
      } else {
        const buf: string[] = [t.slice(open.length)]
        i++
        while (i < lines.length) {
          const ln = lines[i] ?? ''
          const ci = ln.indexOf(close)
          if (ci !== -1) {
            buf.push(ln.slice(0, ci))
            i++
            break
          }
          buf.push(ln)
          i++
        }
        mathSrc = buf.join(' ')
      }
      out.push(
        <Text key={`${keyBase}-${k++}`} style={styles.latexBlock}>
          {cleanLatex(mathSrc)}
        </Text>
      )
      continue
    }

    if (HR.test(t)) {
      out.push(<View key={`${keyBase}-${k++}`} style={styles.hr} />)
      i++
      continue
    }

    const h = HEADING.exec(t)
    if (h) {
      const level = h[1]!.length
      const style = level <= 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3
      out.push(
        <Text key={`${keyBase}-${k++}`} style={style}>
          {inline(h[2] ?? '', `${keyBase}-h${k}`)}
        </Text>
      )
      i++
      continue
    }

    if (QUOTE.test(t)) {
      // Gather the quoted block; a blank quote line ("> ") starts a new
      // paragraph inside the quote so multi-paragraph quotes stay separated.
      const paras: string[][] = [[]]
      while (i < lines.length && QUOTE.test((lines[i] ?? '').trim())) {
        const innerText = QUOTE.exec((lines[i] ?? '').trim())![1] ?? ''
        if (innerText.trim() === '') paras.push([])
        else paras[paras.length - 1]!.push(innerText.trim())
        i++
      }
      const rendered = paras.map((p) => p.join(' ').trim()).filter(Boolean)
      out.push(
        <View key={`${keyBase}-${k++}`} style={styles.blockquote}>
          {rendered.map((p, pi) => (
            <Text
              key={pi}
              style={
                pi === rendered.length - 1
                  ? [styles.blockquoteText, { marginBottom: 0 }]
                  : styles.blockquoteText
              }
            >
              {inline(p, `${keyBase}-q${k}-${pi}`)}
            </Text>
          ))}
        </View>
      )
      continue
    }

    // List (bulleted / numbered / task, possibly nested). Depth comes from the
    // source indentation: an indent stack maps raw leading-space counts to
    // nesting levels so 2- or 4-space indents both work. Ordered counters live
    // per depth and reset when a shallower level reappears. A non-marker line
    // that is indented under the current item is folded in as a continuation.
    if (UL.test(t) || OL.test(t)) {
      type LI = {
        depth: number
        ordered: boolean
        num: number
        task: '' | ' ' | 'x'
        text: string
      }
      const items: LI[] = []
      const indentStack: number[] = []
      const counters: number[] = []
      while (i < lines.length) {
        const lr = lines[i] ?? ''
        if (!lr.trim()) {
          // Tolerate one blank line that the list continues across.
          const nx = lines[i + 1] ?? ''
          if (ITEM.test(nx) || (items.length > 0 && /^\s+\S/.test(nx) && !isBlockStart(i + 1))) {
            i++
            continue
          }
          break
        }
        const mm = ITEM.exec(lr)
        if (!mm) {
          // Lazy continuation: an indented, non-marker, non-block line belongs
          // to the previous item (e.g. a wrapped sentence under "3. …").
          if (items.length > 0 && /^\s+\S/.test(lr) && !isBlockStart(i)) {
            items[items.length - 1]!.text += ' ' + lr.trim()
            i++
            continue
          }
          break
        }
        const indent = mm[1]!.length
        const ordered = /\d/.test(mm[2]!)
        while (indentStack.length && indent < indentStack[indentStack.length - 1]!) {
          indentStack.pop()
          counters.pop()
        }
        if (indentStack.length === 0 || indent > indentStack[indentStack.length - 1]!) {
          indentStack.push(indent)
          counters.push(0)
        }
        const depth = indentStack.length - 1
        let num = 0
        if (ordered) {
          // Honor an explicit start number on the first item of a level.
          counters[depth] = counters[depth] ? counters[depth]! + 1 : parseInt(mm[2]!, 10)
          num = counters[depth]!
        }
        let itemText = mm[3] ?? ''
        let task: '' | ' ' | 'x' = ''
        const taskM = TASK.exec(itemText)
        if (taskM) {
          task = taskM[1]!.toLowerCase() === 'x' ? 'x' : ' '
          itemText = taskM[2] ?? ''
        }
        items.push({ depth, ordered, num, task, text: itemText })
        i++
      }
      const bulletGlyph = (d: number) => ['•', '○', '▪', '‣'][Math.min(d, 3)]
      out.push(
        <View key={`${keyBase}-${k++}`} style={styles.list}>
          {items.map((it, ii) => {
            const markerText = it.task
              ? it.task === 'x'
                ? '☑'
                : '☐'
              : it.ordered
                ? `${it.num}.`
                : bulletGlyph(it.depth)
            return (
              <View
                key={ii}
                style={[styles.listItem, { paddingLeft: 14 + it.depth * 18 }]}
                wrap={false}
              >
                <Text
                  style={[
                    styles.marker,
                    it.ordered && !it.task ? styles.markerNum : styles.markerBullet,
                  ]}
                >
                  {markerText}
                </Text>
                <Text style={styles.listText}>{inline(it.text, `${keyBase}-li${k}-${ii}`)}</Text>
              </View>
            )
          })}
        </View>
      )
      continue
    }

    // Table — a header row immediately followed by a delimiter row.
    if (isTableHead(i)) {
      const header = splitTableRow(raw)
      const align = parseTableAlign(splitTableRow(lines[i + 1] ?? ''))
      i += 2
      const rows: string[][] = []
      while (i < lines.length) {
        const rt = (lines[i] ?? '').trim()
        if (!rt || !rt.includes('|') || isBlockStart(i)) break
        rows.push(splitTableRow(lines[i] ?? ''))
        i++
      }
      out.push(
        <TableBlock
          key={`${keyBase}-${k++}`}
          header={header}
          rows={rows}
          align={align}
          kb={`${keyBase}-tb${k}`}
        />
      )
      continue
    }

    // Paragraph — gather consecutive non-blank, non-block lines. A line ending
    // in two+ spaces or a backslash is a markdown hard break, preserved as a
    // newline; otherwise soft-wrapped lines are joined with a space (GFM).
    const startIdx = i
    const parts: string[] = []
    while (i < lines.length) {
      const ln = lines[i] ?? ''
      if (!ln.trim()) break
      if (i > startIdx && isBlockStart(i)) break
      const hard = /\s{2,}$/.test(ln) || /\\$/.test(ln)
      parts.push(ln.trim().replace(/\\$/, '') + (hard ? '\n' : ' '))
      i++
    }
    const paraText = parts
      .join('')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n+$/, '')
      .trim()
    out.push(
      <Text key={`${keyBase}-${k++}`} style={styles.paragraph}>
        {inline(paraText, `${keyBase}-p${k}`)}
      </Text>
    )
  }

  return out
}

/* -------------------------------------------------------------------------- */
/*  Lightweight code syntax highlighting                                       */
/* -------------------------------------------------------------------------- */

const KEYWORDS = new Set([
  'abstract',
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'def',
  'default',
  'delete',
  'do',
  'echo',
  'elif',
  'else',
  'enum',
  'except',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'fn',
  'for',
  'foreach',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'match',
  'namespace',
  'new',
  'null',
  'of',
  'package',
  'print',
  'private',
  'protected',
  'public',
  'return',
  'self',
  'static',
  'struct',
  'super',
  'switch',
  'this',
  'throw',
  'trait',
  'true',
  'try',
  'type',
  'typeof',
  'use',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'pub',
  'mut',
  'impl',
  'where',
  'lambda',
  'None',
  'True',
  'False',
])

interface Tok {
  t: string
  c: string
}

function tokenizeLine(line: string): Tok[] {
  const toks: Tok[] = []
  const re =
    /(\/\/[^\n]*|#[^\n]*|\/\*.*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$\\][A-Za-z0-9_$]*)|(\s+|[^\sA-Za-z0-9_$"'`])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m[1] !== undefined) {
      toks.push({ t: m[1], c: C.com })
    } else if (m[2] !== undefined) {
      toks.push({ t: m[2], c: C.str })
    } else if (m[3] !== undefined) {
      toks.push({ t: m[3], c: C.num })
    } else if (m[4] !== undefined) {
      const word = m[4]
      const after = line[re.lastIndex]
      if (KEYWORDS.has(word)) toks.push({ t: word, c: C.kw })
      else if (after === '(') toks.push({ t: word, c: C.fn })
      else toks.push({ t: word, c: C.codeText })
    } else {
      toks.push({ t: m[5] ?? m[0], c: C.codeText })
    }
  }
  if (toks.length === 0) toks.push({ t: ' ', c: C.codeText })
  // Preserve indentation AND inter-token alignment: react-pdf collapses/trims
  // runs of regular spaces in <Text>, which flattens leading indent and any
  // column alignment. The tokenizer emits every whitespace run as its own
  // token, so swap each regular space for a real non-breaking space (U+00A0,
  // written as the   escape — a literal NBSP is visually identical to a
  // space and was the bug here before). In the monospace code font every NBSP
  // is one fixed cell, so nested blocks, function scopes, loops and
  // conditionals keep their exact original structure.
  for (const tok of toks) {
    if (/^\s+$/.test(tok.t)) tok.t = tok.t.replace(/ /g, ' ')
  }
  return toks
}

function CodeBlock({ value, language, kb }: { value: string; language?: string; kb: string }) {
  const lines = value.replace(/\t/g, '  ').replace(/\n$/, '').split('\n')
  return (
    <View style={styles.codeBlock} wrap>
      <View style={styles.codeBarRow}>
        <Text style={styles.codeLang}>{language || 'code'}</Text>
      </View>
      <View style={styles.codeBody}>
        {lines.map((ln, li) => {
          const toks = tokenizeLine(ln)
          return (
            <Text key={`${kb}-l${li}`} style={styles.codeLine}>
              {toks.map((tk, ti) => (
                <Text key={ti} style={{ color: tk.c }}>
                  {tk.t}
                </Text>
              ))}
            </Text>
          )
        })}
      </View>
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*  Content block dispatch                                                     */
/* -------------------------------------------------------------------------- */

function renderBlock(block: ContentBlock, kb: string): React.ReactNode {
  switch (block.type) {
    case 'text':
      return <View key={kb}>{renderMarkdown(block.value, kb)}</View>
    case 'code':
      return <CodeBlock key={kb} value={block.value} language={block.language} kb={kb} />
    case 'image':
      // A lone image still renders as a single-item group for consistent layout.
      return <ImageGroupView key={kb} images={[block]} kb={kb} />
    case 'latex':
      return (
        <Text key={kb} style={styles.latexBlock}>
          {cleanLatex(block.value)}
        </Text>
      )
    default:
      return null
  }
}

/* -------------------------------------------------------------------------- */
/*  Image group                                                                */
/* -------------------------------------------------------------------------- */

type ImageBlock = Extract<ContentBlock, { type: 'image' }>

// Render a run of consecutive image blocks as one figure group: a single image
// spans the content width, multiple images wrap into a 2-column grid. Each
// figure carries an optional caption and never splits across a page.
function ImageGroupView({ images, kb }: { images: ImageBlock[]; kb: string }) {
  const multi = images.length > 1
  return (
    <View style={styles.imageRow} wrap={false}>
      {images.map((img, i) => (
        <View
          key={`${kb}-${i}`}
          style={multi ? styles.imageFigMulti : styles.imageFigSingle}
          wrap={false}
        >
          {/* react-pdf <Image> is a PDF primitive, not a DOM <img> — alt does not apply. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image
            style={multi ? styles.imageImgMulti : styles.imageImgSingle}
            src={img.url}
            // @ts-expect-error — react-pdf Image onError is not typed but works at runtime
            onError={() => null}
          />
          {img.alt ? <Text style={styles.imageCaption}>{img.alt}</Text> : null}
        </View>
      ))}
    </View>
  )
}

// Map a message's content blocks to nodes, collapsing each run of consecutive
// image blocks into a single ImageGroupView so multi-image answers lay out as a
// grid while preserving the original order relative to surrounding text.
function renderContent(blocks: ContentBlock[], kb: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]!
    if (b.type === 'image') {
      const group: ImageBlock[] = []
      while (i < blocks.length && blocks[i]!.type === 'image') {
        group.push(blocks[i] as ImageBlock)
        i++
      }
      nodes.push(<ImageGroupView key={`${kb}-ig${i}`} images={group} kb={`${kb}-ig${i}`} />)
      continue
    }
    nodes.push(renderBlock(b, `${kb}-b${i}`))
    i++
  }
  return nodes
}

/* -------------------------------------------------------------------------- */
/*  Message                                                                    */
/* -------------------------------------------------------------------------- */

function MessageView({ msg, idx }: { msg: Message; idx: number }) {
  const isUser = msg.role === 'user'
  const kb = `m${idx}`
  const content = renderContent(msg.content, kb)

  // Reference framing: each turn opens with a header (avatar + role label, plus
  // a timestamp for user turns), then the body. User body = right-aligned grey
  // bubble; assistant body = full-width prose. minPresenceAhead keeps a turn
  // header from being stranded at the very foot of a page.
  if (isUser) {
    return (
      <View style={styles.message} minPresenceAhead={56}>
        <View style={styles.userHeaderRow} wrap={false}>
          {msg.timestamp ? <Text style={styles.metaTime}>{msg.timestamp}</Text> : null}
          <Text style={styles.roleName}>You</Text>
          <View style={[styles.avatar, styles.avatarUser]}>
            <Svg width={13} height={13} viewBox="0 0 24 24">
              <Path d={PERSON_PATH} fill="#ffffff" />
            </Svg>
          </View>
        </View>
        <View style={styles.userTurn}>
          <View style={styles.userBubble}>{content}</View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.message} minPresenceAhead={56}>
      <View style={styles.asstHeaderRow} wrap={false}>
        <View style={[styles.avatar, styles.avatarAssistant]}>
          <Svg width={13} height={13} viewBox="0 0 24 24">
            <Path d={SPARKLE_PATH} fill={C.inkStrong} />
          </Svg>
        </View>
        <Text style={styles.roleName}>ChatGPT</Text>
      </View>
      <View style={styles.assistantBody}>{content}</View>
    </View>
  )
}

/* -------------------------------------------------------------------------- */
/*  Document                                                                   */
/* -------------------------------------------------------------------------- */

function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  const text = firstUser?.content.find((b) => b.type === 'text')?.value
  if (!text) return 'ChatGPT Conversation'
  const oneLine = text
    .replace(/[#*`>_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine || 'ChatGPT Conversation'
}

// Compact a long title for the slim running header so it never wraps.
function clampHeaderTitle(title: string): string {
  return title.length > 68 ? `${title.slice(0, 68).trimEnd()}…` : title
}

export interface PdfDocumentProps {
  messages: Message[]
  // The real ChatGPT conversation title. Falls back to a derived one-liner.
  title?: string
  // The exact moment the export was generated. Captured once in
  // useChatGPTScrape and threaded through so the stamp printed in the PDF hero
  // is byte-identical to the one placed in the WhatsApp share caption. Defaults
  // to "now" for any caller that doesn't supply it (e.g. preview tests).
  exportedAt?: Date
}

// Named export — import as: import { PdfDocument } from '@/components/pdf/PdfDocument'
export function PdfDocument({ messages, title, exportedAt }: PdfDocumentProps) {
  // Single source of truth for the export stamp (lib/utils), e.g.
  // "June 1, 2026 at 09:02:46 UTC+7". Sharing this helper with the WhatsApp
  // caption guarantees the PDF and the shared message show the same value.
  const exportStamp = formatExportStamp(exportedAt)

  const docTitle = (title && title.trim()) || deriveTitle(messages)
  const turnCount = messages.length
  const turnLabel = `${turnCount} ${turnCount === 1 ? 'message' : 'messages'}`

  return (
    <Document title={docTitle} author={APP_NAME}>
      <Page size="A4" style={styles.page} wrap>
        {/* Running letterhead — repeats on every page, frames the document */}
        <View style={styles.letterhead} fixed>
          <Text style={styles.letterheadBrand}>{clampHeaderTitle(docTitle)}</Text>
          <View style={styles.letterheadBrandLockup}>
            <Image style={styles.letterheadLogo} src="/icons/icon-192x192.png" />
            <Text style={styles.letterheadSource}>{APP_NAME}</Text>
          </View>
        </View>

        {/* Hero title block — flows once at the very top of the document */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>ChatGPT Conversation</Text>
          <Text style={styles.heroTitle}>{docTitle}</Text>
          <View style={styles.heroMetaRow}>
            <Text style={styles.heroMeta}>Exported {exportStamp}</Text>
            <Text style={styles.heroMetaDot}>•</Text>
            <Text style={styles.heroMeta}>{turnLabel}</Text>
          </View>
          <View style={styles.heroRule} />
        </View>

        {messages.map((msg, msgIdx) => (
          <MessageView key={msgIdx} msg={msg} idx={msgIdx} />
        ))}

        {/* Persistent footer — repeats on every page */}
        <View style={styles.footer} fixed>
          <View style={styles.footerLeft}>
            <Text style={styles.footerText}>Exported with</Text>
            <Svg width={9} height={9} viewBox="0 0 24 24" style={styles.footerHeart}>
              <Path d={HEART_PATH} fill={C.heart} />
            </Svg>
            <Text style={styles.footerText}>by </Text>
            <Link src="https://membasuh.com" style={styles.footerLink}>
              Membasuh
            </Link>
          </View>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
