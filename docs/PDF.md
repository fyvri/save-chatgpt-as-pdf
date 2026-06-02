# PDF Rendering

The PDF is produced **in the browser** with `@react-pdf/renderer`. Two files own
this:

- `lib/pdf-generator.ts` — font/emoji registration + `generatePdfBlob()`.
- `components/pdf/PdfDocument.tsx` — the document template and all markdown →
  PDF layout logic.

It is rendered **exactly once** per conversion (in `useChatGPTScrape`), and the
single `Blob` is reused for the inline preview, the fullscreen reader, the
download, and the WhatsApp share. (Mounting react-pdf's `<PDFViewer>` /
`<PDFDownloadLink>` re-rendered the whole tree several times and crashed the
renderer on large chats — hence the single-blob design.) That one blob is shown
by `components/shared/PdfCanvasViewer.tsx`, which rasterizes it to `<canvas>`
with pdf.js — see [Inline Preview](#inline-preview-pdfjs-canvas).

## `generatePdfBlob(messages, title?, exportedAt?)`

Awaits a `Font.load` pre-pass for the registered text faces, then creates the
`PdfDocument` element and calls `pdf(doc).toBlob()`. `exportedAt` is captured
once by the caller and threaded through so the stamp printed in the PDF hero is
byte-identical to the WhatsApp share caption (see [SHARING.md](./SHARING.md)).

> **Why the font pre-pass:** react-pdf measures text during layout. If a face is
> still being fetched when layout runs, lines can be mis-measured and collapse
> onto one another (the classic "all text stacked at the top of the page" bug).
> Awaiting `Font.load` first makes the render deterministic regardless of network
> timing; failures are swallowed since per-glyph fallback still applies.

## Fonts (registered at module load)

`Font.register` must run before any `pdf()` call. Three font families — spanning
six `.ttf` files — are registered from `/public/fonts/`:

| Family           | Files                                                                                                                       | Use                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Roboto`         | `Roboto-Regular.ttf` (400), `Roboto-Bold.ttf` (700), `Roboto-Italic.ttf` (400 italic), `Roboto-BoldItalic.ttf` (700 italic) | Body text & headings; italics power `*emphasis*` and `***bold italic***`           |
| `RobotoMono`     | `RobotoMono-Regular.ttf`                                                                                                    | Code & inline code/math                                                            |
| `SymbolFallback` | `SymbolFallback-Regular.ttf` (mapped to 400 & 700, upright & italic)                                                        | Per-glyph fallback for symbols Roboto's subset lacks (→ ← ↔ ✔ ✓ ✗ √ ∑ ∫ ∞ ≤ ≥ ≠ …) |

react-pdf does **per-glyph** font fallback when `fontFamily` is an array, so the
styles use `['Roboto', 'SymbolFallback']` and `['RobotoMono', 'SymbolFallback']`.
Both `SymbolFallback` weights point at the one regular file so a symbol inside
bold text still resolves instead of dropping to `.notdef`.

> Do not over-strip the SymbolFallback subset — too aggressive a subset makes the
> text shaper hang.

## Emoji

`Font.registerEmojiSource` points at the **same-origin** path `/emoji/`. At
render time react-pdf swaps each emoji for an inline 72×72 color PNG fetched from
there. Emoji are **load-bearing** in ChatGPT prose (🧠/✅/❌ headings, ✔ table
cells, 👉 pointers), so they are kept verbatim rather than stripped.

The PNGs are the Twemoji 14.x set, vendored from the `twemoji-emojis` package and
copied into `public/emoji/` by `scripts/prepare-assets.mjs` (wired to
`postinstall` / `predev` / `prebuild` / `build:worker`, so they exist on every
install and every build path). They are **gitignored** — regenerated, not
committed. Serving them same-origin (instead of the previous `cdn.jsdelivr.net`
CDN) is a deliberate performance fix: the per-emoji CDN round-trip was ~5.6 s of
a ~7 s cold render; local assets are edge-cached and bring an emoji-heavy
conversion to the ~1.4 s warm floor. It also removes the third-party CDN
dependency — only the same-origin `connect-src 'self'` / `img-src 'self'` CSP
allowances are needed (no `cdn.jsdelivr.net`). Because the assets are
same-origin, the PWA service worker can cache them, so emoji also render offline
after first use.

> The Twemoji set is ~3,700 PNGs (~15 MB). It is a build artifact, not source —
> delete `public/emoji/` to force `prepare-assets` to recopy after bumping
> `twemoji-emojis`.

## Document Structure (`PdfDocument`)

A single A4 `<Page wrap>` with:

- **Fixed letterhead** (`fixed`, repeats every page): clamped conversation title
  on the left, app logo + name on the right.
- **Hero block** (flows once, page 1): eyebrow, large title, and an
  "Exported {stamp} • N messages" meta row.
- **Message turns**, each opening with a header then a body:
  - **Assistant** — sparkle avatar + "ChatGPT" label, full-width prose.
  - **User** — right-aligned timestamp + "You" + person avatar, with the
    body in a right-aligned grey bubble (mirrors ChatGPT's share view).
  - `minPresenceAhead` keeps a turn header from being stranded at a page foot.
- **Fixed footer** (`fixed`, repeats every page): "Exported with ♥ by Membasuh"
  (a live link, styled to read as plain text) and a `pageNumber/totalPages` stamp.

> **Layout gotcha:** never set `lineHeight` on the `Page`. A page-level
> line-height multiplier corrupts the `fixed` footer's layout and stops it from
> rendering. Line height is set **per block** instead — and it must be a healthy
> value (~1.5 for prose, ~1.3 for headings). A too-tight `lineHeight: 1` leaves
> no leading, so inline emoji images (which carry their own height) and ordinary
> font-metric variance can push adjacent lines into each other. Generous
> per-block leading is both the ChatGPT-faithful look and the safety margin that
> prevents overlap.

## Markdown → PDF

`renderMarkdown` is a hand-written block parser (it does not use a markdown
library) that keeps the conversion deterministic. It operates on the **raw**
source lines — leading whitespace is preserved because it carries list-nesting
depth (collapsing it globally flattens deep lists). Citation/spacing
normalization is applied per prose chunk via the `inline` helper, never to code.

Supported blocks:

- **ATX headings** `#`–`######` (→ h1/h2/h3 styles).
- **Horizontal rules** (`---`, `***`, `___`).
- **Blockquotes**, including multi-paragraph quotes (a blank `>` line starts a
  new paragraph inside the quote) with inline formatting.
- **Lists** — ordered (`1.` / `1)`), unordered, and GitHub **task lists**
  (`- [ ]` → ☐, `- [x]` → ☑). Nesting depth comes from source indentation (an
  indent stack, so 2- or 4-space indents both work); bullet glyph varies by
  depth; ordered counters are per-depth and honor an explicit start number. A
  wrapped, indented line with no marker is folded into the previous item as a
  lazy continuation.
- **Pipe tables** with per-column alignment from the `:--`/`:--:`/`--:` row;
  cells are inline-parsed.
- **Fenced code blocks** (` ``` ` / `~~~`, optional language) — normally split
  out by the scraper, but also handled here if a fence survives inside prose.
- **Display math** `$$ … $$` and `\[ … \]` (single- or multi-line) → centered
  `latexBlock`.
- **Paragraphs**, with markdown hard breaks (a line ending in two+ spaces or a
  backslash) preserved as line breaks; ordinary soft-wrapped lines are joined
  with a space (GFM behavior).

`parseInline` is a recursive left-to-right scanner (not one mega-regex) so spans
nest correctly — the inner text of bold/italic/strike/link is parsed again.
In priority order it handles:

- backslash escapes (`\*`, `\_`, `` \` ``, …) → literal characters;
- inline math `\( … \)` and `$ … $` (cleaned to unicode);
- code spans `` `code` `` and ``` ``co`de`` ``` (literal inner);
- links `[text](url "title")` → **real, clickable `<Link>`** preserving the URL;
- bare-URL autolinks (`https://…`, `www.…`) at word boundaries;
- strikethrough `~~x~~`;
- bold-italic `***x***` / `___x___`, bold `**x**` / `__x__`, italic `*x*` / `_x_`.
  `_`-emphasis only fires at word boundaries, so `snake_case` is left intact.

Emphasis renders as **true italic** (Roboto-Italic / Roboto-BoldItalic are
registered). Inline code uses the mono font with a distinct tint and **no**
background box (an inline background renders as an oversized, misaligned block).

`normalizeText` rewrites ChatGPT's leaked entity-citation markers
(`entity["product","Raspberry Pi 4"]` → `Raspberry Pi 4`) and collapses stray
interior space runs. It is applied to prose only (via `inline`), never to code.

## Code Blocks & Highlighting

`CodeBlock` renders a language tab + the code body. `tokenizeLine` is a
lightweight, language-agnostic tokenizer (comments, strings, numbers,
identifiers; identifiers in a `KEYWORDS` set are colored as keywords, and a name
followed by `(` is colored as a function). Indentation and inter-token alignment
are preserved by converting each leading/aligning space to a non-breaking space
(U+00A0) — react-pdf otherwise collapses runs of regular spaces in `<Text>`.

## Images

`image` `ContentBlock`s (emitted by the scraper from web-search `image_group`
carousels — see [SCRAPING.md](./SCRAPING.md)) arrive with `url` already set to a
base64 `data:` URI, so the renderer embeds them with no network fetch.
`renderContent` collapses each **run of consecutive** image blocks into one
`ImageGroupView` figure: a lone image spans the full content width; multiple
images wrap into a **2-column grid** mirroring ChatGPT's inline carousel. Each
figure is `wrap={false}` so it never splits across a page, `objectFit: 'contain'`

- a `maxHeight` letterbox guards against a tall image overflowing, and the
  optional `alt`/title renders as a small caption. A failed `<Image>` load returns
  null via `onError` rather than rendering a broken box.

## LaTeX / Math

No math engine ships in the PDF. `cleanLatex` renders LaTeX as cleaned unicode:
it strips `$`/`\[`/`\(` delimiters, resolves `\sqrt{}`, `\frac{}{}`, and
`\text{}`-style wrappers innermost-first, maps named commands/Greek letters to
glyphs via the `LATEX_SYMBOLS` table, drops sizing commands, and unwraps braces.
This applies both to inline `$…$` (in `parseInline`) and to any `latex`
`ContentBlock` (rendered centered as a math display). The symbol glyphs it
produces are exactly why `SymbolFallback` is required.

## Vector Marks

The footer heart, the assistant sparkle avatar, and the user person avatar are
drawn as inline `<Svg><Path/></Svg>` vectors (not font glyphs or emoji) so they
render exactly regardless of font coverage.

## Inline Preview (pdf.js canvas)

`components/shared/PdfCanvasViewer.tsx` displays the generated blob. It does
**not** use an `<iframe src="blob:…pdf">`: desktop Chromium renders that through
its built-in PDFium plugin, but **iOS Safari and most Android browsers cannot
display a PDF in an iframe/object at all** — they show a broken-document
placeholder, and no CSP allowance can fix a missing platform capability. So the
viewer rasterizes the PDF to `<canvas>` with **pdf.js** (`pdfjs-dist`), which
works identically on every device.

Key behaviors:

- **Lazy rendering.** An `IntersectionObserver` renders each page to a canvas
  only as it scrolls into view (sized placeholders reserve the right height up
  front via `aspect-ratio`), so a long conversation never allocates dozens of
  full-resolution canvases at once — important for mobile memory.
- **Self-hosted worker.** `GlobalWorkerOptions.workerSrc` points at
  `/pdf.worker.min.mjs`, copied from `pdfjs-dist` by `scripts/prepare-assets.mjs`
  (same mechanism as the emoji set; gitignored). No third-party CDN.
- **SSR-safe import.** pdf.js is imported dynamically **inside** the effect, never
  at module scope — Next renders client components on the server too, and pdf.js
  touches the browser-only `DOMMatrix` at import time (a static import crashes the
  prerender with `DOMMatrix is not defined`).
- **CSP-friendly.** `getDocument({ useWasm: false })` forces pure-JS image
  decoding so no wasm binary is fetched at runtime; pdf.js auto-detects that the
  production CSP blocks `eval()` and falls back without it. The worker loads under
  `worker-src 'self'`.
- **Adaptive height.** The inline preview container uses `max-h-[70vh]` (not a
  fixed height), so a short one-page PDF shrinks to fit with no dead space while
  long conversations cap at 70vh and scroll. The fullscreen reader fills the
  viewport.

The same component renders both the inline preview and the fullscreen reader; the
`URL.createObjectURL` object URL is still used for the **download** and the
**share** fallback (not for the preview).

## Visual Testing

Two manual harnesses under `__tests__/_render-*.test.ts` render documents to
`/tmp` for inspection with `pdftoppm`/`pdftotext`. They register fonts by
absolute path (the app registers by URL, which only resolves in the browser) and
are **excluded from CI** (they hit the Twemoji CDN). Run them with the no-exclude
runner config:

```bash
npx vitest run -c vitest.preview.config.ts __tests__/_render-preview.test.ts  # reference conversation
npx vitest run -c vitest.preview.config.ts __tests__/_render-stress.test.ts   # every markdown construct
pdftoppm -png -r 110 /tmp/chatgpt-stress.pdf out                              # → out-1.png, out-2.png, …
```

`_render-stress.test.ts` is the fidelity oracle: it exercises h1–h6, hard breaks,
nested/ordered/task lists, multi-paragraph blockquotes, aligned tables with
inline formatting, fenced + inline code, inline + bare links, strikethrough,
bold/italic/bold-italic, escapes, inline + display math, HRs, long unbreakable
URLs, emoji, and multilingual Latin text. See [TESTING.md](./TESTING.md).

## Fidelity Limitations & Recommendations

Known gaps between a ChatGPT conversation and the exported PDF, with the path to
closing each:

- **Non-Latin scripts** (CJK 中文/日本語/한국어, Arabic, Hebrew, Devanagari, Thai,
  Cyrillic beyond the SymbolFallback subset) render as `.notdef` boxes — the
  bundled Roboto subset and SymbolFallback cover Latin + symbols only.
  _Recommendation:_ register Noto Sans + the relevant Noto script faces (e.g.
  `Noto Sans SC`, `Noto Sans Arabic`) and append them to the font arrays. RTL
  shaping in react-pdf is still limited, so Arabic/Hebrew will improve but not be
  perfect.
- **Math is approximated, not typeset.** `cleanLatex` maps LaTeX to unicode
  (fractions become `(a)/(b)`, no real super/subscripts, matrices/`\begin{}` are
  not laid out). _Recommendation:_ pre-render math to SVG (KaTeX → MathML → SVG)
  server-side and embed as images for true typesetting.
- **Emoji are now served same-origin** from `/emoji/` (vendored Twemoji set — see
  [Emoji](#emoji)). This was previously a CDN dependency that dropped emoji on
  offline renders; the PNGs are now local and PWA-cacheable, so emoji render fast
  and work offline after first use. _Remaining nuance:_ react-pdf embeds each
  emoji occurrence as its own image, so emoji-dense documents are larger and a bit
  slower to lay out — inherent to react-pdf, not the asset source.
- **Syntax highlighting is heuristic**, not a real grammar — a single
  language-agnostic tokenizer, so some tokens are mis-colored. _Recommendation:_
  swap in a real highlighter (e.g. Shiki/Prism) to produce colored spans.
- **A handful of newer ChatGPT UI blocks** (Canvas documents, interactive
  charts, file-attachment cards, multi-column tool output) are not modeled and
  fall back to their plain-text payload. _Recommendation:_ extend the scraper's
  `content_references`/part handling and add matching `ContentBlock` types.
- **Generated/uploaded images** beyond the web-search `image_group` carousel
  (DALL·E output, user uploads) are not yet extracted. _Recommendation:_ add
  their reference shapes to `lib/scraper.ts` (see [SCRAPING.md](./SCRAPING.md)).
