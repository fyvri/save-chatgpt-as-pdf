# Scraping

All scraping lives in `lib/scraper.ts`. It does **not** parse the DOM — there is
no HTML-selector logic and `cheerio` is not used. ChatGPT share pages are
client-rendered, so the server-delivered HTML contains **no**
`[data-message-author-role]` nodes. The conversation is embedded as JSON inside
the page's bootstrap script and is decoded directly.

## How a Share Page Carries the Conversation

A `chatgpt.com/share/<uuid>` page ships its data as a series of
`window.__reactRouterContext.streamController.enqueue("…")` calls. The argument
of each call is a JavaScript string literal whose contents are React Router's
[`turbo-stream`](https://github.com/jacob-ebey/turbo-stream) format: a single
flattened array where every value is stored once and referenced by index
(repeated keys/values are de-duplicated).

```
window.__reactRouterContext.streamController.enqueue("[\"...flattened graph...\"]");
```

## Decoding Pipeline (`scrapeMessages`)

```
fetchWithTimeout(url)            → raw HTML (fixed Chrome fingerprint, 15 s timeout, 1 retry)
→ extractEnqueuedChunks(html)    → string[] of every enqueue("…") payload
→ join + take the first stream line (the synchronous loader data)
→ JSON.parse → unflatten(values) → rehydrated object graph
→ findObjectWith(root, 'linear_conversation')  → the conversation container
→ read container.title (sanitized) + container.linear_conversation[]
→ for each node: filter, normalize, split into ContentBlock[]
   (assistant turns with image_group references → interleaveImages)
→ embedImagesInMessages(messages)  — fetch each image, inline as base64 data URI
→ { messages, title }
```

| Function                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetchWithTimeout`      | `fetch` with a fixed, coherent Chrome fingerprint (`CHATGPT_FETCH_HEADERS`), 15 s `AbortController` timeout, one automatic retry on the first abort. Maps HTTP 404 to a typed error and **classifies 403** into a transient Cloudflare bot challenge (`code: 'BOT_BLOCKED'`) vs a genuinely private share (`code: 'PRIVATE'`) — see [Bot Detection & the 403 Split](#bot-detection--the-403-split). |
| `extractEnqueuedChunks` | Walks the HTML, finds every `streamController.enqueue("…")` call and extracts the JS string literal (honoring `\` escapes). Malformed chunks are skipped.                                                                                                                                                                                                                                           |
| `unflatten`             | Rehydrates the turbo-stream flattened array into its real object graph. Arrays hold child indices; objects are `{ "_<keyIndex>": valueIndex }`; single-letter typed markers like `["P", n]` (promise) / `["D", n]` (date) carry one payload index. Cycles are handled with an index→value cache.                                                                                                    |
| `findObjectWith`        | Depth-first search for the first object that owns a given key. Used to locate the container holding `linear_conversation` so its sibling `title` can be read at the same time.                                                                                                                                                                                                                      |
| `contentToText`         | Flattens a message's `content` (`parts[]` joined with blank lines, or a `text` field) to a string.                                                                                                                                                                                                                                                                                                  |
| `markdownToBlocks`      | Splits assistant markdown into `text` and fenced-`code` `ContentBlock`s (language captured from the fence info string).                                                                                                                                                                                                                                                                             |
| `interleaveImages`      | For an assistant turn carrying `content_references`, splices `image` blocks into the surrounding prose at their exact source offsets; the text around them still flows through `markdownToBlocks`. Exported for unit testing.                                                                                                                                                                       |
| `embedImagesInMessages` | After all turns are built, downloads every referenced image once (deduped, parallel, capped) and rewrites each `image` block's `url` to an inlined base64 data URI. Mutates `messages` in place; un-fetchable images are dropped.                                                                                                                                                                   |
| `sanitizeTitle`         | Collapses whitespace, strips control chars, clamps to 200 chars. Returns `undefined` when the field is absent.                                                                                                                                                                                                                                                                                      |
| `formatTimestamp`       | Converts a message `create_time` (Unix seconds) to `"YYYY-MM-DD HH:MM:SS"`, or `undefined` when absent.                                                                                                                                                                                                                                                                                             |

## Message Filtering Rules

Within `linear_conversation`, a node is **kept** only when all of the following hold:

- It has a `message` object.
- `message.metadata.is_visually_hidden_from_conversation` is **not** truthy
  (hidden system/tool turns are dropped).
- `message.author.role` is `user` or `assistant` (other roles, e.g. `system` /
  `tool`, are dropped).
- The flattened content text is non-empty.

Block building per kept turn:

- A message whose `content.content_type === 'code'` becomes a single `code`
  block.
- An **assistant** turn whose `content.parts` is a single text string **and**
  which carries a `metadata.content_references` array is run through
  `interleaveImages` (text → `markdownToBlocks`, with `image` blocks spliced in
  at their offsets — see [Images](#images-web-search-image_group-carousels)).
- Everything else is run through `markdownToBlocks`.

The resulting `Message` carries `{ role, content, timestamp }`.

If, after filtering, there are no messages — or the stream/`linear_conversation`
can't be found — `scrapeMessages` throws an `Error('PARSE_ERROR')` with
`status: 500`, which the API surfaces as _"ChatGPT structure changed. Contact
developer."_

## Images (web-search `image_group` carousels)

When ChatGPT answers with web-search results it renders an inline image carousel.
That carousel is **not** in the message text — it lives in
`message.metadata.content_references` as a reference whose `type` is
`"image_group"`, with a placeholder occupying the character range
`[start_idx, end_idx)` of the message's single text part. The scraper turns those
references into real `image` `ContentBlock`s:

```
content_references[]  → extractImageGroups()   → positioned image groups
                          (resolve each entry to one best URL + dimensions + caption)
text + groups         → interleaveImages()      → ContentBlock[] (text/code/image, in order)
all image blocks      → embedImagesInMessages()  → fetchImageAsDataUri() per unique URL
                          → block.url rewritten to data:<mime>;base64,…
```

| Function                | Responsibility                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extractImageGroups`    | Pulls every `image_group` out of `content_references`, resolving each image to one URL — `content_url` (full size) → `thumbnail_url` → `original_content_url` — plus pixel dimensions and a caption. Sorted by position.       |
| `interleaveImages`      | Walks the source text once, emitting `markdownToBlocks` for the prose between groups and `image` blocks at each group's position, so image order relative to headings/lists/code is preserved. Overlapping groups are skipped. |
| `fetchImageAsDataUri`   | Fetches one image (8 s timeout, rotating UA), validates it is an `image/*` response within size limits, and returns a `data:` URI — or `null` on any failure (swallowed).                                                      |
| `embedImagesInMessages` | Collects unique remote image URLs across all messages, fetches up to `MAX_EMBEDDED_IMAGES` in parallel, and rewrites each block's `url` to its data URI. Images that fail or exceed the cap are removed from their message.    |

**Why inline as base64?** The PDF is rendered **client-side** by `@react-pdf/renderer`.
If image blocks kept remote URLs, the browser would hit cross-origin/CORS failures
fetching them at render time. Embedding them server-side as data URIs sidesteps that
entirely, and the data URIs ride along in the cached payload so a cache hit needs no
re-fetch.

**Caps & safety** (`constants/app.ts`): `MAX_EMBEDDED_IMAGES` (24) bounds fetches per
conversation, `MAX_IMAGE_BYTES` (~3 MB) skips oversized images, and
`IMAGE_FETCH_TIMEOUT_MS` (8 s) bounds each fetch. These keep the conversion within
Cloudflare Worker subrequest/CPU budgets and bound the cached payload size. Only
`http(s)` URLs are fetched, and the Worker's `global_fetch_strictly_public`
compatibility flag (`wrangler.toml`) additionally blocks any fetch to private/internal
addresses (SSRF). A single broken image never aborts the conversion — it is simply
dropped so the PDF omits it cleanly.

> Generated/uploaded images outside the web-search `image_group` carousel (DALL·E
> output, user uploads) are **not** yet extracted — see the Fidelity Limitations in
> [PDF.md](./PDF.md). Add their reference shapes here to support them.

## Bot Detection & the 403 Split

`chatgpt.com` sits behind **Cloudflare Bot Management**. The app runs on
Cloudflare Workers (OpenNext), so the share-page `fetch` leaves from a Worker
egress IP — exactly the kind of source Cloudflare scores as a bot. A request
with sparse headers earns an HTTP **403 challenge page**, which the app
previously mislabeled as _"Chat is private"_ for every public link.

Two mitigations live in the scraper:

**1. One coherent browser fingerprint (`CHATGPT_FETCH_HEADERS`).** The share-page
fetch sends a single, internally consistent Chrome-on-Windows header set rather
than a rotating User-Agent. The `User-Agent`, the `sec-ch-ua` brand list, and
`sec-ch-ua-platform` all agree, and the `Sec-Fetch-*` values describe a plausible
top-level navigation (`Sec-Fetch-Site: none`, so no `Referer`). Rotating UAs from
a single IP is itself a bot tell, so rotation is **not** used here.

> When bumping the Chrome major version, update the UA string **and** all three
> `sec-ch-ua` brands together, or the mismatch raises the bot score.

**2. 403 classification (`fetchWithTimeout`).** A `403` is ambiguous, so the
scraper inspects the response:

- A Cloudflare challenge — `cf-mitigated: challenge` header, or a body containing
  `cdn-cgi/challenge-platform` / `_cf_chl_opt` / "just a moment" / "attention
  required" / "enable javascript and cookies to continue" — throws
  `code: 'BOT_BLOCKED'`, surfaced by the API as **503** _"ChatGPT is temporarily
  blocking automated requests. Please try again in a moment."_ (`Retry-After: 15`).
- Anything else is treated as a genuinely private/disabled share — `code:
'PRIVATE'`, surfaced as **403** _"This chat is private. Open the share link and
  make it public first."_

> ⚠️ The fingerprint is a **best-effort** defense. If Cloudflare blocks purely on
> the Worker egress IP, headers alone won't pass. The high-confidence fallback is
> to route the share fetch through a **non-Cloudflare egress** (a scraping API
> such as ScraperAPI/ScrapingBee/Browserless, or a small relay on Vercel/a VPS).

## User-Agent Rotation (image fetches only)

Four UA strings are defined in `constants/app.ts` (`USER_AGENTS`) and one is
chosen at random per **image** fetch (`fetchImageAsDataUri`). The share page no
longer uses these — only the far less bot-sensitive `images.openai.com` /
source-site CDN fetches do.

```
Chrome 137 (Windows)
Safari 17.4.1 (macOS)
Chrome 137 (Linux)
Firefox 128 (Windows)
```

## Fragility & Maintenance

This scraper depends on private, undocumented OpenAI internals — both the
`streamController.enqueue` bootstrap shape and the `linear_conversation` /
`title` field names. Any of these can change without notice.

`lib/scraper.ts` carries a `// TODO: verify … — last checked YYYY-MM-DD` marker
on the embedding-format assumption. Update the date whenever you confirm or
change it. The bot-evasion headers (`CHATGPT_FETCH_HEADERS` in `constants/app.ts`)
and the image-fetch `USER_AGENTS` list also need periodic version bumps — see
[Bot Detection & the 403 Split](#bot-detection--the-403-split).

> ⚠️ Review after any OpenAI share-page change and at least every 3 months.
> The contract verified by `__tests__/scraper.test.ts` (which builds a real
> turbo-stream fixture via a `flatten` inverse of `unflatten`) is the canonical
> description of the expected payload shape — keep it in sync with reality.

## Updating the Scraper

1. Capture a fresh share page and inspect the `streamController.enqueue` payload.
2. Adjust `extractEnqueuedChunks` / `unflatten` / field lookups in
   `lib/scraper.ts` as needed.
3. Update the `// TODO: verify … — last checked` dates.
4. Update the fixtures/assertions in `__tests__/scraper.test.ts`.
5. Update this document.
