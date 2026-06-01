'use client'

import { useState, useCallback } from 'react'
import type { Message } from '@/types/chatgpt'
import { generatePdfBlob } from '@/lib/pdf-generator'

export interface UseChatGPTScrapeReturn {
  convert: (url: string) => Promise<void>
  reset: () => void
  messages: Message[] | null
  // The ChatGPT conversation's real title (null when the share omits it).
  title: string | null
  isLoading: boolean
  error: string | null
  fromCache: boolean
  pdfBlob: Blob | null
  // The exact moment the current pdfBlob was generated. Reused by the share
  // caption so its export stamp matches the one printed in the PDF hero.
  exportedAt: Date | null
}

// This hook is the ONLY place that calls /api/convert.
// Never call the API directly from a component.
export function useChatGPTScrape(): UseChatGPTScrapeReturn {
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [exportedAt, setExportedAt] = useState<Date | null>(null)

  const convert = useCallback(async (url: string) => {
    setIsLoading(true)
    setError(null)
    setMessages(null)
    setTitle(null)
    // Release previous blob URL memory before creating a new one
    setPdfBlob(null)
    setExportedAt(null)

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'An unexpected error occurred.')
        return
      }

      setMessages(data.messages)
      setTitle(data.title ?? null)
      setFromCache(data.fromCache)

      // Capture the export moment once, here, then thread it into the PDF so
      // the hero stamp and the WhatsApp caption (built later in ConvertForm
      // from this same Date) are guaranteed to agree.
      const exportMoment = new Date()
      const blob = await generatePdfBlob(data.messages, data.title, exportMoment)
      setPdfBlob(blob)
      setExportedAt(exportMoment)
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Clear all results — used by the viewer's Back action to return to the form.
  const reset = useCallback(() => {
    setMessages(null)
    setTitle(null)
    setError(null)
    setFromCache(false)
    setPdfBlob(null)
    setExportedAt(null)
  }, [])

  return { convert, reset, messages, title, isLoading, error, fromCache, pdfBlob, exportedAt }
}
