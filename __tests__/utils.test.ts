import { describe, it, expect } from 'vitest'
import { generatePdfFilename } from '@/lib/utils'

describe('generatePdfFilename', () => {
  const date = new Date('2026-05-30T14:30:22')

  // Mirror the implementation's UTC-offset suffix so assertions stay
  // deterministic regardless of the machine timezone running the tests.
  const pad = (n: number) => String(n).padStart(2, '0')
  const offMin = -date.getTimezoneOffset()
  const abs = Math.abs(offMin)
  const num =
    abs % 60 === 0 ? `${Math.floor(abs / 60)}` : `${Math.floor(abs / 60)}-${pad(abs % 60)}`
  const tz = `utc-${offMin >= 0 ? 'plus' : 'min'}-${num}`
  const stamp = `20260530-143022-${tz}`

  it('slugifies a normal title', () => {
    expect(generatePdfFilename('How to build a REST API', date)).toBe(
      `chatgpt-as-pdf-how-to-build-a-rest-api-${stamp}.pdf`
    )
  })

  it("falls back to 'conversation' when undefined", () => {
    expect(generatePdfFilename(undefined, date)).toBe(`chatgpt-as-pdf-conversation-${stamp}.pdf`)
  })

  it("falls back to 'conversation' on empty string", () => {
    expect(generatePdfFilename('', date)).toBe(`chatgpt-as-pdf-conversation-${stamp}.pdf`)
  })

  it('strips special characters', () => {
    expect(generatePdfFilename('Hello! @World# 123', date)).toBe(
      `chatgpt-as-pdf-hello-world-123-${stamp}.pdf`
    )
  })

  it('collapses and trims excess whitespace', () => {
    expect(generatePdfFilename('  spaces   only  ', date)).toBe(
      `chatgpt-as-pdf-spaces-only-${stamp}.pdf`
    )
  })

  it('includes seconds and a utc offset segment', () => {
    expect(generatePdfFilename('x', date)).toMatch(/-\d{8}-\d{6}-utc-(plus|min)-\d+(-\d{2})?\.pdf$/)
  })
})
