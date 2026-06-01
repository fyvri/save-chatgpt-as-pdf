# Download, Filenames & WhatsApp Sharing

Once the PDF blob exists, `ConvertForm` exposes three actions in a fixed order of
emphasis: **Download PDF** (primary), **Share to WhatsApp** (secondary), and
**Fullscreen Preview** (tertiary). The same Download/Share pair is repeated in
the fullscreen reader's toolbar.

## The Single Export Moment

`useChatGPTScrape` captures **one** `exportedAt = new Date()` immediately before
rendering the PDF, then threads it into both the PDF (`generatePdfBlob`) and back
to `ConvertForm`. This guarantees the timestamp printed in the PDF hero is
identical to the timestamp in the WhatsApp caption. (The download **filename**,
by contrast, is intentionally stamped at click time so it reflects the actual
moment of download.)

## Title Resolution

The conversation title is resolved with the same precedence everywhere:

1. The real ChatGPT `title` from the scrape (when present).
2. The first user message's text.
3. A generic fallback (`'ChatGPT conversation'` in the UI; `'ChatGPT
Conversation'` for the PDF's `deriveTitle`).

## Download Filename (`generatePdfFilename`)

```
chatgpt-as-pdf-{slug}-{yyyymmdd}-{hhiiss}-utc-{plus|min}-{n}.pdf
```

- `{slug}` — the title source, lowercased, non-alphanumerics stripped, spaces →
  `-`. Falls back to `conversation` when empty.
- `{yyyymmdd}` / `{hhiiss}` — local date and 24-hour time at download.
- `utc-{plus|min}-{n}` — the device UTC offset (`utc-plus-7`, `utc-min-5`, or
  `utc-plus-5-30` for half-hour zones).

Example (device in UTC+7):
`chatgpt-as-pdf-how-to-build-a-rest-api-20260530-143022-utc-plus-7.pdf`

This function is covered by `__tests__/utils.test.ts`.

## Human Export Stamp (`formatExportStamp`)

Used in the PDF hero **and** the WhatsApp caption:

```
June 1, 2026 at 09:02:46 UTC+7
```

Long month/day/year, 24-hour time with seconds, and the device UTC offset.

## Page Count (`countPdfPages`)

Counts pages by scanning the generated blob's bytes for PDF page objects
(`/Type /Page` not followed by `s`, to exclude the single `/Type /Pages` tree
root). The structural markers are ASCII even though stream contents are binary,
so a text read is safe. Returns `1` as a floor. Used only to fill the page count
in the share caption.

## WhatsApp Caption (`WHATSAPP_SHARE_TEXT`)

Built at **share time** (not module load) so the page count, timestamp, and live
app URL are current. `ShareSummary` shape: `{ title, totalMessages, totalPages,
exportStamp, appUrl }`. Output:

```
*Save ChatGPT as PDF*
📄 {title}
💬 {N} messages • {M} pages
🕒 {exportStamp}
Exported with 🤍 by Membasuh
{appUrl}
```

"message"/"messages" and "page"/"pages" are singularized correctly.

## Share Mechanics (`handleShare`)

1. Build a `File` from the blob (filename stamped now) and the caption.
2. If `navigator.canShare({ files })` is supported (mobile/PWA), call
   `navigator.share({ files, text })`. A user-dismissed dialog throws
   `AbortError`, which is treated as expected and ignored.
3. Otherwise (desktop fallback): open `https://wa.me/?text=<caption>` in a new
   tab **and** trigger a normal download of the PDF, since `wa.me` cannot carry
   a file attachment.

## Memory Hygiene

`URL.createObjectURL(blob)` object URLs are revoked by a `useEffect` cleanup in
`ConvertForm` whenever the blob changes or the component unmounts, so repeated
conversions do not leak blob memory.
