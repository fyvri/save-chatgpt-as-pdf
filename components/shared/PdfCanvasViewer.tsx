'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { FileWarning, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Why this exists: the previous preview embedded the generated blob in a native
// <iframe src="blob:…pdf">. Desktop Chromium renders that through its built-in
// PDFium plugin, but iOS Safari and most Android browsers cannot display a PDF
// inside an iframe/object at all — they show a broken-document placeholder. No
// CSP tweak (object-src/frame-src) can fix a missing platform capability.
//
// So we rasterize the PDF to <canvas> with pdf.js, which works identically on
// every device. Pages are rendered lazily via IntersectionObserver so a long
// conversation doesn't allocate dozens of full-resolution canvases up front
// (mobile memory is tight). The worker is self-hosted at /pdf.worker.min.mjs
// (synced from pdfjs-dist by the copy-pdf-worker npm script) so nothing is
// fetched from a third-party CDN — consistent with the app's privacy stance.
//
// NOTE: pdf.js is imported dynamically *inside* the effect, never at module
// scope. Next renders client components on the server too, and pdf.js touches
// the browser-only DOMMatrix at import time — a static import crashes the
// SSR/prerender pass with "DOMMatrix is not defined".

// Cap device-pixel-ratio so high-DPI phones don't blow up canvas memory while
// still rendering crisply.
const MAX_DPR = 2

type Props = {
  /** The already-generated PDF blob. Passing the blob (not an object URL) lets
   *  pdf.js read the bytes directly without a second fetch. */
  file: Blob | null
  className?: string
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function PdfCanvasViewer({ file, className }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    if (!file) {
      setStatus('idle')
      return
    }

    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null
    let pdfDoc: PDFDocumentProxy | null = null
    let observer: IntersectionObserver | null = null
    const renderTasks = new Set<RenderTask>()

    async function run() {
      setStatus('loading')
      try {
        // Browser-only import (see note above). Set the worker source once the
        // library is actually loaded on the client.
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        const data = await file!.arrayBuffer()
        if (cancelled) return

        // useWasm:false forces pure-JS image decoding so we never fetch a wasm
        // binary at runtime — keeps the viewer self-contained and avoids extra
        // CSP/connect-src surface. pdf.js auto-detects that eval() is blocked by
        // the production CSP and falls back without it.
        loadingTask = pdfjsLib.getDocument({ data, useWasm: false })
        pdfDoc = await loadingTask.promise
        if (cancelled) {
          loadingTask.destroy()
          return
        }

        const pagesEl = pagesRef.current
        const scrollEl = scrollRef.current
        if (!pagesEl || !scrollEl) return
        pagesEl.replaceChildren()

        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
        // Fit pages to the container width (minus the page gap/padding).
        const containerWidth = pagesEl.clientWidth || scrollEl.clientWidth || 600

        // Render a page into its placeholder on demand, then stop observing it.
        const rendered = new WeakSet<Element>()
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              const placeholder = entry.target as HTMLDivElement
              if (rendered.has(placeholder)) continue
              rendered.add(placeholder)
              observer?.unobserve(placeholder)
              const pageNum = Number(placeholder.dataset.page)
              void renderPage(pageNum, placeholder)
            }
          },
          { root: scrollEl, rootMargin: '300px 0px' }
        )

        async function renderPage(pageNum: number, placeholder: HTMLDivElement) {
          if (cancelled || !pdfDoc) return
          try {
            const page = await pdfDoc.getPage(pageNum)
            if (cancelled) return
            const base = page.getViewport({ scale: 1 })
            const scale = containerWidth / base.width
            const viewport = page.getViewport({ scale: scale * dpr })

            const canvas = document.createElement('canvas')
            canvas.width = Math.floor(viewport.width)
            canvas.height = Math.floor(viewport.height)
            canvas.style.width = '100%'
            canvas.style.height = 'auto'
            canvas.style.display = 'block'
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            const task = page.render({ canvas, canvasContext: ctx, viewport })
            renderTasks.add(task)
            await task.promise
            renderTasks.delete(task)
            if (cancelled) return
            placeholder.replaceChildren(canvas)
          } catch (err) {
            // RenderingCancelledException is expected on unmount/teardown.
            if (err instanceof Error && err.name === 'RenderingCancelledException') return
            console.error(`[PdfCanvasViewer] page ${pageNum} render failed:`, err)
          }
        }

        // Build sized placeholders for every page first (cheap — no rasterizing),
        // so the scrollbar reflects the true document length immediately and the
        // observer can lazily fill them in as the user scrolls.
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          const page = await pdfDoc.getPage(pageNum)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const placeholder = document.createElement('div')
          placeholder.dataset.page = String(pageNum)
          placeholder.style.width = '100%'
          // Reserve the correct height via aspect-ratio so layout doesn't jump
          // when the canvas swaps in.
          placeholder.style.aspectRatio = `${base.width} / ${base.height}`
          placeholder.className = 'bg-white shadow-sm'
          pagesEl.appendChild(placeholder)
          observer.observe(placeholder)
        }

        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (cancelled) return
        console.error('[PdfCanvasViewer] failed to load PDF:', err)
        setStatus('error')
      }
    }

    void run()

    return () => {
      cancelled = true
      observer?.disconnect()
      renderTasks.forEach((t) => t.cancel())
      // Destroying the loading task tears down the worker and the document.
      loadingTask?.destroy()
    }
  }, [file])

  return (
    <div
      ref={scrollRef}
      className={cn('relative overflow-auto bg-muted/30', className)}
      aria-label="PDF preview"
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Rendering preview…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <FileWarning className="h-6 w-6" />
          Couldn’t render the preview here. Use “Download PDF” to open it in your device’s PDF
          viewer.
        </div>
      )}
      {/* Page column — centered, with breathing room between pages. */}
      <div ref={pagesRef} className="mx-auto flex max-w-3xl flex-col gap-3 p-3" />
    </div>
  )
}
