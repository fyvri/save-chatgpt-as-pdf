import type { MetadataRoute } from 'next'
import { APP_NAME, APP_URL } from '@/constants/app'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: 'ChatGPT as PDF',
    description: 'Save ChatGPT conversations as PDF',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#b3002d',
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
