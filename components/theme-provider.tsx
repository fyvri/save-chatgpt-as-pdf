'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

const themeScript = `
  if (typeof __name === 'undefined') {
    window.__name = (fn, name) => fn;
  }
`

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <NextThemesProvider {...props}>{children}</NextThemesProvider>
    </>
  )
}
