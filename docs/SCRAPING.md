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
fetchWithTimeout(url)            → raw HTML (UA rotation, 15 s timeout, 1 retry)
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

| Function                | Responsibility                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fetchWithTimeout`      | `fetch` with a random User-Agent, 15 s `AbortController` timeout, one automatic retry on the first abort. Maps HTTP 403/404 to typed errors.                                                                                                                                                     |
| `extractEnqueuedChunks` | Walks the HTML, finds every `streamController.enqueue("…")` call and extracts the JS string literal (honoring `\` escapes). Malformed chunks are skipped.                                                                                                                                        |
| `unflatten`             | Rehydrates the turbo-stream flattened array into its real object graph. Arrays hold child indices; objects are `{ "_<keyIndex>": valueIndex }`; single-letter typed markers like `["P", n]` (promise) / `["D", n]` (date) carry one payload index. Cycles are handled with an index→value cache. |
| `findObjectWith`        | Depth-first search for the first object that owns a given key. Used to locate the container holding `linear_conversation` so its sibling `title` can be read at the same time.                                                                                                                   |
| `contentToText`         | Flattens a message's `content` (`parts[]` joined with blank lines, or a `text` field) to a string.                                                                                                                                                                                               |
| `markdownToBlocks`      | Splits assistant markdown into `text` and fenced-`code` `ContentBlock`s (language captured from the fence info string).                                                                                                                                                                          |
| `interleaveImages`      | For an assistant turn carrying `content_references`, splices `image` blocks into the surrounding prose at their exact source offsets; the text around them still flows through `markdownToBlocks`. Exported for unit testing.                                                                    |
| `embedImagesInMessages` | After all turns are built, downloads every referenced image once (deduped, parallel, capped) and rewrites each `image` block's `url` to an inlined base64 data URI. Mutates `messages` in place; un-fetchable images are dropped.                                                                |
| `sanitizeTitle`         | Collapses whitespace, strips control chars, clamps to 200 chars. Returns `undefined` when the field is absent.                                                                                                                                                                                   |
| `formatTimestamp`       | Converts a message `create_time` (Unix seconds) to `"YYYY-MM-DD HH:MM:SS"`, or `undefined` when absent.                                                                                                                                                                                          |

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

## User-Agent Rotation

Four UA strings are defined in `constants/app.ts` (`USER_AGENTS`) and one is
chosen at random per request. Rotation reduces the chance ChatGPT's bot
detection blocks a single fingerprint.

```
Chrome 124 (Windows)
Safari 17.4.1 (macOS)
Chrome 123 (Linux)
Firefox 125 (Windows)
```

## Fragility & Maintenance

This scraper depends on private, undocumented OpenAI internals — both the
`streamController.enqueue` bootstrap shape and the `linear_conversation` /
`title` field names. Any of these can change without notice.

`lib/scraper.ts` and `constants/app.ts` carry `// TODO: verify … — last checked
YYYY-MM-DD` markers on the embedding-format assumptions and the UA list. Update
the date whenever you confirm or change them.

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
