import { describe, it, expect, vi, afterEach } from 'vitest'
import { validateUrl, scrapeMessages, interleaveImages } from '@/lib/scraper'

const VALID_URL = 'https://chatgpt.com/share/12345678-1234-1234-1234-123456789abc'

function mockFetchHtml(html: string, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => html,
    }))
  )
}

/**
 * Encode an object graph into React Router's turbo-stream "flattened" array
 * (the inverse of lib/scraper.ts's `unflatten`): arrays hold child indices,
 * objects become `{ "_<keyIndex>": valueIndex }`, primitives are stored inline.
 */
function flatten(root: unknown): unknown[] {
  const values: unknown[] = []
  const primitives = new Map<unknown, number>()

  function add(val: unknown): number {
    if (val === null || typeof val !== 'object') {
      if (primitives.has(val)) return primitives.get(val) as number
      const idx = values.length
      values.push(val)
      primitives.set(val, idx)
      return idx
    }
    const idx = values.length
    values.push(null) // reserve slot before recursing
    if (Array.isArray(val)) {
      values[idx] = val.map(add)
    } else {
      const obj: Record<string, number> = {}
      for (const k of Object.keys(val as Record<string, unknown>)) {
        const keyIdx = add(k)
        const valIdx = add((val as Record<string, unknown>)[k])
        obj[`_${keyIdx}`] = valIdx
      }
      values[idx] = obj
    }
    return idx
  }

  add(root)
  return values
}

// Wrap a flattened graph in the same <script> shape ChatGPT ships.
function shareHtml(root: unknown): string {
  const firstLine = JSON.stringify(flatten(root))
  const literal = JSON.stringify(firstLine) // valid quoted JS string literal
  return `<!doctype html><html><body><script nonce="x">window.__reactRouterContext.streamController.enqueue(${literal});</script></body></html>`
}

function conversation(
  turns: Array<{ role: 'user' | 'assistant'; type?: string; parts?: string[]; text?: string }>,
  title?: string
) {
  return {
    loaderData: {
      serverResponse: {
        data: {
          ...(title ? { title } : {}),
          linear_conversation: turns.map((t) => ({
            message: {
              author: { role: t.role },
              content: {
                content_type: t.type ?? 'text',
                ...(t.parts ? { parts: t.parts } : {}),
                ...(t.text ? { text: t.text } : {}),
              },
            },
          })),
        },
      },
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('validateUrl', () => {
  it('accepts a valid ChatGPT share URL', () => {
    expect(validateUrl(VALID_URL)).toBe(true)
  })

  it('rejects a non-ChatGPT URL', () => {
    expect(validateUrl('https://example.com/share/abc')).toBe(false)
  })

  it('rejects a URL longer than MAX_URL_LENGTH', () => {
    const long = VALID_URL + 'a'.repeat(300)
    expect(validateUrl(long)).toBe(false)
  })

  it('rejects an encoded hostname bypass attempt', () => {
    expect(validateUrl('https://chatgpt%2Ecom/share/12345678-1234-1234-1234-123456789abc')).toBe(
      false
    )
  })

  it('rejects an empty string', () => {
    expect(validateUrl('')).toBe(false)
  })
})

describe('scrapeMessages', () => {
  it('extracts user message text from the embedded turbo-stream', async () => {
    mockFetchHtml(shareHtml(conversation([{ role: 'user', parts: ['Hello there'] }])))
    const { messages } = await scrapeMessages(VALID_URL)
    expect(messages[0]?.role).toBe('user')
    expect(messages[0]?.content[0]).toEqual({ type: 'text', value: 'Hello there' })
  })

  it('extracts assistant message text', async () => {
    mockFetchHtml(shareHtml(conversation([{ role: 'assistant', parts: ['Hi, how can I help?'] }])))
    const { messages } = await scrapeMessages(VALID_URL)
    expect(messages[0]?.role).toBe('assistant')
    expect(messages[0]?.content[0]).toEqual({ type: 'text', value: 'Hi, how can I help?' })
  })

  it('extracts the conversation title alongside the linear_conversation', async () => {
    mockFetchHtml(
      shareHtml(conversation([{ role: 'user', parts: ['Hello'] }], '  How to build a REST API  '))
    )
    const { title } = await scrapeMessages(VALID_URL)
    // Sanitized: surrounding whitespace collapsed/trimmed.
    expect(title).toBe('How to build a REST API')
  })

  it('leaves the title undefined when the share omits it', async () => {
    mockFetchHtml(shareHtml(conversation([{ role: 'user', parts: ['Hello'] }])))
    const { title } = await scrapeMessages(VALID_URL)
    expect(title).toBeUndefined()
  })

  it('splits fenced code blocks out of assistant markdown with language', async () => {
    mockFetchHtml(
      shareHtml(conversation([{ role: 'assistant', parts: ['Here:\n```ts\nconst x = 1\n```'] }]))
    )
    const { messages } = await scrapeMessages(VALID_URL)
    expect(messages[0]?.content).toEqual([
      { type: 'text', value: 'Here:' },
      { type: 'code', value: 'const x = 1', language: 'ts' },
    ])
  })

  it('preserves conversation order across multiple turns', async () => {
    mockFetchHtml(
      shareHtml(
        conversation([
          { role: 'user', parts: ['Question?'] },
          { role: 'assistant', parts: ['Answer.'] },
        ])
      )
    )
    const { messages } = await scrapeMessages(VALID_URL)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('throws PARSE_ERROR when no embedded stream is present', async () => {
    mockFetchHtml('<html><body></body></html>')
    await expect(scrapeMessages(VALID_URL)).rejects.toThrow('PARSE_ERROR')
  })

  it('throws PARSE_ERROR when the stream lacks a linear_conversation', async () => {
    mockFetchHtml(shareHtml({ loaderData: { serverResponse: { data: {} } } }))
    await expect(scrapeMessages(VALID_URL)).rejects.toThrow('PARSE_ERROR')
  })
})

describe('interleaveImages', () => {
  // An image_group content reference, the shape ChatGPT ships for inline web
  // image carousels: a placeholder spanning [start, end) plus its images.
  const imageGroup = (
    start: number,
    end: number,
    images: Array<{ image_result?: Record<string, unknown>; image_search_query?: string }>
  ) => ({ type: 'image_group', start_idx: start, end_idx: end, images })

  it('returns plain text blocks when there are no image references', () => {
    expect(interleaveImages('Hello world', [])).toEqual([{ type: 'text', value: 'Hello world' }])
  })

  it('splices an image group into the prose at its position, preserving order', () => {
    // "IMG" occupies indices 7..9; end_idx is exclusive (10).
    const refs = [
      imageGroup(7, 10, [
        {
          image_result: {
            content_url: 'https://images.openai.com/a.jpg',
            content_size: { width: 800, height: 600 },
            title: 'Diagram A',
          },
          image_search_query: 'q',
        },
      ]),
    ]
    expect(interleaveImages('Before IMG After', refs)).toEqual([
      { type: 'text', value: 'Before' },
      {
        type: 'image',
        url: 'https://images.openai.com/a.jpg',
        alt: 'Diagram A',
        width: 800,
        height: 600,
      },
      { type: 'text', value: 'After' },
    ])
  })

  it('supports multiple images per group and prefers content_url over thumbnail', () => {
    const refs = [
      imageGroup(0, 0, [
        {
          image_result: {
            content_url: 'https://x/full.jpg',
            thumbnail_url: 'https://x/thumb.jpg',
            content_size: { width: 1, height: 1 },
          },
        },
        { image_result: { thumbnail_url: 'https://y/thumb.jpg', title: 'Only thumb' } },
      ]),
    ]
    const blocks = interleaveImages('text', refs)
    expect(blocks[0]).toEqual({
      type: 'image',
      url: 'https://x/full.jpg',
      alt: undefined,
      width: 1,
      height: 1,
    })
    expect(blocks[1]).toEqual({
      type: 'image',
      url: 'https://y/thumb.jpg',
      alt: 'Only thumb',
      width: undefined,
      height: undefined,
    })
    expect(blocks[2]).toEqual({ type: 'text', value: 'text' })
  })

  it('ignores references that lack images or character offsets', () => {
    const refs = [
      { type: 'attribution', start_idx: 0, end_idx: 3 },
      { type: 'image_group', images: [{ image_result: { content_url: 'https://z/a.jpg' } }] },
    ]
    expect(interleaveImages('abcdef', refs)).toEqual([{ type: 'text', value: 'abcdef' }])
  })
})
