'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // In development the SW must NOT run: it caches the app shell and then
    // serves stale HTML referencing old hashed chunks, causing 404s on
    // /_next chunks and a non-functional page. Actively unregister any
    // previously installed SW and purge its caches so dev self-heals.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((reg) => reg.unregister()))
        .catch(console.error)
      if ('caches' in window) {
        caches
          .keys()
          .then((keys) => keys.forEach((key) => caches.delete(key)))
          .catch(console.error)
      }
      return
    }

    // Production only: register the service worker for offline support.
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  }, [])
  return null
}
