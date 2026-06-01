import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Required by shadcn/ui — do not remove
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Build the UTC-offset suffix for a date: `utc-plus-7`, `utc-min-5`,
 * or `utc-plus-5-30` for half-hour zones (e.g. India UTC+5:30).
 *
 * getTimezoneOffset() returns minutes BEHIND UTC (negative when ahead),
 * so we negate it: UTC+7 → +420 → `plus`, offset hours 7.
 */
function utcOffsetSuffix(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const offMin = -date.getTimezoneOffset()
  const sign = offMin >= 0 ? 'plus' : 'min'
  const abs = Math.abs(offMin)
  const hours = Math.floor(abs / 60)
  const minutes = abs % 60
  const num = minutes === 0 ? `${hours}` : `${hours}-${pad(minutes)}`
  return `utc-${sign}-${num}`
}

/**
 * Generate PDF filename:
 * chatgpt-as-pdf-{full-title}-{yyyymmdd}-{hhiiss}-utc-{plus|min}-{n}.pdf
 *
 * {yyyymmdd} = date, {hhiiss} = hour+minute+second (24-hour), and the trailing
 * segment encodes the device UTC offset at export time. Local date parts are
 * used (not UTC) so the stamp matches the user's wall-clock at download time.
 *
 * @param firstMessage - Full text of first user message (slug source)
 * @param date - Export date (defaults to now)
 *
 * Example (device in UTC+7):
 *   generatePdfFilename('How to build a REST API', new Date('2026-05-30T14:30:22'))
 *   → 'chatgpt-as-pdf-how-to-build-a-rest-api-20260530-143022-utc-plus-7.pdf'
 */
export function generatePdfFilename(firstMessage?: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyymmdd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` // 20260530
  const hhiiss = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` // 143022
  const tz = utcOffsetSuffix(date)

  const slug =
    firstMessage && firstMessage.trim().length > 0
      ? firstMessage
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .trim()
          .replace(/\s+/g, '-')
      : 'conversation'

  return `chatgpt-as-pdf-${slug}-${yyyymmdd}-${hhiiss}-${tz}.pdf`
}

/**
 * Human-readable export timestamp for the share summary, e.g.
 * "June 1, 2026 at 08:40:32 UTC+7". Mirrors the stamp shown in the PDF hero:
 * long month/day/year, 24-hour time with seconds, and the device UTC offset.
 */
export function formatExportStamp(date = new Date()): string {
  const dateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const offMin = -date.getTimezoneOffset()
  const offAbs = Math.abs(offMin)
  const offH = Math.floor(offAbs / 60)
  const offRem = offAbs % 60
  const utcLabel = `UTC${offMin >= 0 ? '+' : '-'}${offH}${offRem ? ':' + String(offRem).padStart(2, '0') : ''}`
  return `${dateStr} at ${timeStr} ${utcLabel}`
}

/**
 * Count pages in a generated PDF blob by scanning its bytes for page objects.
 * react-pdf (pdfkit) writes each page as `/Type /Page` and the single page-tree
 * root as `/Type /Pages`, so we match `/Type /Page` not followed by `s`. The
 * structural markers are ASCII even though stream contents are binary, so a
 * text read is safe. Returns 1 as a floor when the markers can't be found.
 */
export async function countPdfPages(blob: Blob): Promise<number> {
  const text = await blob.text()
  const matches = text.match(/\/Type\s*\/Page(?![s])/g)
  return matches && matches.length > 0 ? matches.length : 1
}
