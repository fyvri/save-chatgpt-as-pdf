export const APP_NAME = 'Save ChatGPT as PDF'

// Safe fallback prevents new URL('') crash in layout.tsx if env var is missing
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
export const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/fyvri/save-chatgpt-as-pdf'

// Rate limiting
export const RATE_LIMIT_REQUESTS = 10
// 'as const' satisfies @upstash/ratelimit Duration type in strict mode
export const RATE_LIMIT_WINDOW = '60 s' as const

// Caching
export const CACHE_TTL_SECONDS = 3600

// Max URL length — reject before regex to prevent long-string attacks
export const MAX_URL_LENGTH = 200

// Fetch timeout for ChatGPT scraping — in constants so it can be tuned without touching scraper internals
export const FETCH_TIMEOUT_MS = 15_000

// Image embedding — images from ChatGPT web-search "image_group" results are
// fetched server-side and inlined as base64 data URIs so the client-side PDF
// renderer (react-pdf) embeds them without hitting cross-origin/CORS failures.
// Caps keep us within Cloudflare Worker subrequest/CPU budgets and bound the
// cached payload size; anything over the limits is skipped, never fatal.
export const MAX_EMBEDDED_IMAGES = 24 // hard cap on images fetched per conversation
export const MAX_IMAGE_BYTES = 3_000_000 // skip any single image larger than ~3 MB
export const IMAGE_FETCH_TIMEOUT_MS = 8_000 // per-image fetch timeout

// User-Agent rotation — used for the per-image fetches (images.openai.com and
// source-site CDNs), which are far less bot-sensitive than the share page.
// Update every 3 months or when ChatGPT blocks scraping.
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
] as const

// Coherent browser fingerprint for the ChatGPT share-page fetch.
//
// chatgpt.com sits behind Cloudflare Bot Management. A request from a Cloudflare
// Worker egress IP with sparse headers scores as a bot and gets a 403 challenge.
// The single best defense we have without a proxy is to send ONE internally
// consistent Chrome-on-Windows header set: the UA, sec-ch-ua client hints, and
// sec-ch-ua-platform must all agree, and the Sec-Fetch-* values must describe a
// plausible top-level navigation. Rotating UAs from one IP is itself a bot tell,
// so the page fetch uses this fixed fingerprint rather than USER_AGENTS.
// Keep the Chrome major version in the UA and all three sec-ch-ua brands in sync
// when you bump it. No Referer: Sec-Fetch-Site:none means a direct navigation,
// and a Referer would contradict that.
export const CHATGPT_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  Priority: 'u=0, i',
}

// WhatsApp share caption — a polished document summary built at share time (not
// at module load) so the page count, timestamp, and live APP_URL are all
// current. Layout mirrors a professional share card: a bold product line, then
// emoji-led rows for the conversation title, the message/page statistics, and
// the export stamp, closing with the attribution and a link back to the app.
//
//   *Save ChatGPT as PDF*
//   📄 {title}
//   💬 {totalMessages} messages • {totalPages} pages
//   🕒 {exportStamp}
//   Exported with 🤍 by Membasuh
//   {appUrl}
//
// The exportStamp passed in MUST be the same value rendered in the PDF hero so
// the shared caption and the exported file always agree (see formatExportStamp
// in lib/utils + the single export Date captured in useChatGPTScrape).
export interface ShareSummary {
  /** The conversation title (already resolved, never empty). */
  title: string
  /** Number of conversation turns. */
  totalMessages: number
  /** Number of rendered PDF pages. */
  totalPages: number
  /** Pre-formatted export stamp, e.g. "June 1, 2026 at 09:02:46 UTC+7". */
  exportStamp: string
  /** Public app URL to link back to. */
  appUrl: string
}

export const WHATSAPP_SHARE_TEXT = ({
  title,
  totalMessages,
  totalPages,
  exportStamp,
  appUrl,
}: ShareSummary): string => {
  const messageLabel = totalMessages === 1 ? 'message' : 'messages'
  const pageLabel = totalPages === 1 ? 'page' : 'pages'
  return [
    `*${APP_NAME}*`,
    `📄 ${title}`,
    `💬 ${totalMessages} ${messageLabel} • ${totalPages} ${pageLabel}`,
    `🕒 ${exportStamp}`,
    'Exported with 🤍 by Membasuh',
    appUrl,
  ].join('\n')
}
