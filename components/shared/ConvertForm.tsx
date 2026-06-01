'use client'

import { useState, useEffect } from 'react'
import { FileDown, Link2, Maximize2, Share2, Sparkles, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useChatGPTScrape } from '@/hooks/useChatGPTScrape'
import { generatePdfFilename, formatExportStamp, countPdfPages } from '@/lib/utils'
import { APP_URL, WHATSAPP_SHARE_TEXT } from '@/constants/app'

// NOTE: react-pdf's <PDFViewer>/<PDFDownloadLink> each re-render the whole
// PdfDocument through the yoga-layout WASM engine. Mounting them here (inline +
// download + fullscreen) rendered a long conversation's layout tree 3–5 times
// concurrently in the browser tab, exhausting the renderer and crashing it with
// SIGILL on big chats. The PDF is already rendered exactly once in
// useChatGPTScrape (-> pdfBlob); we now display that single blob via a native
// <iframe> and download it via a plain anchor — zero extra react-pdf renders.

export function ConvertForm() {
  const [url, setUrl] = useState('')
  const { convert, messages, title, isLoading, error, fromCache, pdfBlob, exportedAt } =
    useChatGPTScrape()

  // Track object URL for memory cleanup
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  // Fullscreen reader is opt-in — the inline preview is always shown once ready.
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Gate the preview on the finished blob: the hook renders the PDF exactly
  // once and exposes it as pdfBlob (-> objectUrl). We display that single blob,
  // so the preview is only meaningful once objectUrl exists. This also keeps the
  // loading skeleton as the sole visible card until conversion fully completes.
  const hasPreview = !isLoading && !!messages && messages.length > 0 && !!objectUrl

  // Never leave the overlay open across a new conversion / cleared results.
  useEffect(() => {
    if (!hasPreview) setIsFullscreen(false)
  }, [hasPreview])

  // While the immersive reader is open, lock body scroll (only the PDF scrolls)
  // and let Escape exit fullscreen — like a native document viewer.
  useEffect(() => {
    if (!isFullscreen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isFullscreen])

  // Revoke previous object URL when a new pdfBlob arrives to prevent memory leaks
  useEffect(() => {
    if (!pdfBlob) return
    const newUrl = URL.createObjectURL(pdfBlob)
    setObjectUrl(newUrl)
    // Cleanup on unmount or when blob changes
    return () => URL.revokeObjectURL(newUrl)
  }, [pdfBlob])

  const firstMessageText = messages?.[0]?.content.find((b) => b.type === 'text')?.value

  // Prefer the real ChatGPT conversation title; fall back to the first user
  // message, then a generic label. Used for the toolbar and the PDF heading.
  const conversationTitle =
    (title && title.trim()) ||
    (firstMessageText && firstMessageText.trim()) ||
    'ChatGPT conversation'

  // Slug source for the download filename — same precedence as the title.
  const filenameSeed = (title && title.trim()) || firstMessageText

  // filename is computed at click/share time, not at render time.
  // This ensures the timestamp in the filename reflects when the user actually downloads.
  const getFilename = () => generatePdfFilename(filenameSeed)

  // Download the already-generated blob via a plain anchor. No react-pdf render
  // happens here — we reuse the single objectUrl produced by the hook. Filename
  // is computed now (click time) so its timestamp reflects the actual download.
  const handleDownload = () => {
    if (!objectUrl) return
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = getFilename()
    a.click()
  }

  const handleShare = async () => {
    if (!pdfBlob || !objectUrl) return
    // Compute filename at share time to capture the exact timestamp
    const filename = getFilename()
    const file = new File([pdfBlob], filename, { type: 'application/pdf' })
    // Build the polished share caption at share time: pages come from the
    // already-generated blob. The export stamp reuses the exact Date captured
    // when the PDF was generated (exportedAt) so the caption matches the stamp
    // printed in the PDF hero; fall back to "now" only if it's somehow unset.
    const totalPages = await countPdfPages(pdfBlob)
    const shareText = WHATSAPP_SHARE_TEXT({
      title: conversationTitle,
      totalMessages: messages?.length ?? 0,
      totalPages,
      exportStamp: formatExportStamp(exportedAt ?? undefined),
      appUrl: APP_URL,
    })

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: shareText })
      } catch (err) {
        // AbortError is thrown when user dismisses the share dialog — this is expected, not an error
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('[handleShare] Share failed:', err)
        }
      }
    } else {
      // Fallback: open WhatsApp in new tab + trigger download using tracked objectUrl
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.click()
      // objectUrl will be revoked by the useEffect cleanup above
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || isLoading) return
    convert(url)
  }

  return (
    <div className="space-y-6">
      {/* Converter card */}
      <Card className="border-border/60 shadow-lg shadow-black/[0.03]">
        <CardHeader>
          <CardTitle className="text-lg">Convert a conversation</CardTitle>
          <CardDescription>Paste a public ChatGPT share link to generate your PDF.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                placeholder="https://chatgpt.com/share/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
                aria-label="ChatGPT share URL"
                className="h-11 pl-9"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={isLoading || !url.trim()}
              className="h-11 sm:w-auto"
            >
              {isLoading ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Converting...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  Convert to PDF
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <Card aria-label="Loading">
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Inline PDF Preview — appears directly below the form once ready */}
      {hasPreview && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">PDF Preview</CardTitle>
              {fromCache && (
                <Badge variant="secondary" className="gap-1">
                  <Zap className="h-3 w-3" />
                  Loaded from cache
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Native iframe over the single generated blob — no re-render */}
            <div className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg border bg-muted/30">
              <iframe
                src={objectUrl ?? undefined}
                title="PDF Preview"
                className="h-full w-full"
                style={{ border: 'none' }}
              />
            </div>

            {/*
              Action order is fixed across every preview interface:
              1) Download PDF (primary)  2) Share to WhatsApp (secondary)
              3) Fullscreen Preview (tertiary). Variants step down in emphasis.
            */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {/* 1. Download PDF — reuses the single generated blob */}
              <Button onClick={handleDownload} disabled={!objectUrl}>
                <FileDown className="h-4 w-4" />
                Download PDF
              </Button>

              {/* 2. Share to WhatsApp */}
              <Button variant="secondary" onClick={handleShare} disabled={!pdfBlob}>
                <Share2 className="h-4 w-4" />
                Share to WhatsApp
              </Button>

              {/* 3. Fullscreen Preview */}
              <Button variant="outline" onClick={() => setIsFullscreen(true)}>
                <Maximize2 className="h-4 w-4" />
                Fullscreen Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/*
        Immersive fullscreen reader — opt-in via the Fullscreen Preview button.
        A fixed, full-viewport overlay (covers navbar/footer) so the document is
        the sole focus, à la WhatsApp Web / Google Drive. Flex column: sticky
        toolbar on top, the PDF iframe fills the rest. Exit via the button or Esc.
      */}
      {hasPreview && isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen PDF Preview"
          className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-background"
        >
          {/* Sticky action toolbar */}
          <header className="bg-background/90 sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(false)}
              className="shrink-0 gap-1.5"
              aria-label="Exit fullscreen"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Exit fullscreen</span>
            </Button>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="truncate text-sm font-medium" title={conversationTitle}>
                {conversationTitle}
              </p>
              {fromCache && (
                <Badge variant="secondary" className="hidden shrink-0 gap-1 sm:inline-flex">
                  <Zap className="h-3 w-3" />
                  Cached
                </Badge>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Download — reuses the single generated blob */}
              <Button size="sm" onClick={handleDownload} disabled={!objectUrl}>
                <FileDown className="h-4 w-4" />
                <span className="hidden sm:inline">Download PDF</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleShare}
                disabled={!pdfBlob}
                aria-label="Share to WhatsApp"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">Share to WhatsApp</span>
              </Button>
            </div>
          </header>

          {/* Document area — fills all remaining height; the iframe scrolls internally */}
          <div className="bg-muted/40 min-h-0 flex-1">
            <iframe
              src={objectUrl ?? undefined}
              title="Fullscreen PDF Preview"
              className="h-full w-full"
              style={{ border: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
