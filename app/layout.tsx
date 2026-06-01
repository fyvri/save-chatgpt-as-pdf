import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
// IMPORTANT: Import ThemeProvider from the wrapper component, NOT from next-themes directly.
// next-themes ThemeProvider is a Client Component — importing it in a Server Component breaks the build.
import { ThemeProvider } from '@/components/theme-provider'
import { ServiceWorkerRegister } from '@/components/shared/ServiceWorkerRegister'
import { APP_NAME, APP_URL } from '@/constants/app'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  // APP_URL defaults to 'http://localhost:3000' — safe fallback, never empty string
  metadataBase: new URL(APP_URL),
  title: {
    default: `Save ChatGPT Conversations as PDF`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Paste a public ChatGPT share link and instantly download the conversation as a clean, formatted PDF.',
  openGraph: {
    title: `Save ChatGPT Conversations as PDF`,
    description:
      'Paste a public ChatGPT share link and instantly download the conversation as a clean, formatted PDF.',
    url: APP_URL,
    siteName: APP_NAME,
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Save ChatGPT Conversations as PDF`,
    description:
      'Paste a public ChatGPT share link and instantly download the conversation as a clean, formatted PDF.',
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512x512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // React.ReactNode type is available via the JSX transform — no explicit React import needed in Next.js 15
  return (
    // suppressHydrationWarning is required — next-themes updates the html element on client
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-gr-* / data-new-gr-* attributes on <body> before React hydrates */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/*
          Four branded variants + System. Each theme maps to a SINGLE class on
          <html> — next-themes' classList.add/remove does not split on spaces, so
          multi-class values would throw. AMOLED is therefore a self-contained
          class; the `dark` Tailwind variant is extended to match `.amoled` too
          (see @custom-variant in app/globals.css) so dark: utilities still apply.
          `themes` must list every selectable variant so next-themes persists them.
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          themes={['light', 'dark', 'amoled', 'brand']}
          disableTransitionOnChange
        >
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
