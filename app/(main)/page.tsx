import { FileDown, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { ConvertForm } from '@/components/shared/ConvertForm'
import { Badge } from '@/components/ui/badge'
import { APP_NAME, APP_URL } from '@/constants/app'

// JSON-LD structured data.
// SECURITY NOTE: This object contains only hardcoded constants — it is safe.
// NEVER pass scraped ChatGPT content into dangerouslySetInnerHTML — that would be an XSS risk.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: APP_NAME,
  url: APP_URL,
  description: 'Save ChatGPT conversations to a clean, formatted PDF.',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
}

const features = [
  {
    icon: ShieldCheck,
    title: 'Private & safe',
    description:
      'No sign-up, accounts, or third-party tracking. When caching is enabled, the parsed conversation is stored for up to an hour, then expires automatically.',
  },
  {
    icon: Zap,
    title: 'Instant export',
    description:
      'The PDF is generated in your browser and never uploaded to a server. Revisiting the same link can reuse the cached conversation and skip re-fetching from ChatGPT.',
  },
  {
    icon: FileDown,
    title: 'Clean formatting',
    description:
      'Markdown, tables, syntax-highlighted code, inline images, and emoji are rendered into a clean, consistent A4 PDF.',
  },
]

export default function HomePage() {
  return (
    <>
      {/*
        JSON-LD: inject using a plain <script> tag with dangerouslySetInnerHTML.
        Safe ONLY because jsonLd contains hardcoded constants above.
        Do NOT use next/script for JSON-LD — it causes hydration issues in App Router.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section className="relative flex flex-col items-center text-center">
        {/* Decorative gradient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-gradient-to-tr from-primary/30 via-red-500/20 to-orange-500/20 blur-3xl"
        />

        <Badge variant="secondary" className="mb-5 gap-1.5">
          <Sparkles className="h-3 w-3" />
          Free · No sign-up required
        </Badge>

        <h1 className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
          Save ChatGPT as PDF
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Paste a public ChatGPT share link and download the whole conversation as a clean,
          formatted PDF — in one click.
        </p>
      </section>

      {/* Converter */}
      <div className="mt-10">
        <ConvertForm />
      </div>

      {/* Feature highlights */}
      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-xl border bg-card/50 p-5 text-left transition-colors hover:bg-card"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </section>
    </>
  )
}
