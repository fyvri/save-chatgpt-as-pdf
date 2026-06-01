// ContentBlock is a union type — a single message can contain mixed content types.
// Do NOT use flat isCode/isLatex boolean flags on Message.
export type ContentBlock =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string; language?: string }
  // `url` is a base64 data URI once the scraper has embedded the image
  // server-side (see lib/scraper.ts). `width`/`height` are the source pixel
  // dimensions, used by the PDF renderer to preserve aspect ratio.
  | { type: 'image'; url: string; alt?: string; width?: number; height?: number }
  | { type: 'latex'; value: string }

export interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock[]
  timestamp?: string
}

export interface ConvertResponse {
  messages: Message[]
  // The ChatGPT conversation's own title. Optional: older share payloads or a
  // missing field leave it undefined, and the client derives a fallback title.
  title?: string
  fromCache: boolean
}

export interface ConvertError {
  error: string
  code: 400 | 403 | 404 | 429 | 500
}
