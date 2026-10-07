/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import pkg from './package.json' with { type: 'json' }
import { tesseractAssets } from './scripts/vite-tesseract'

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    tesseractAssets(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Split It — shared expenses, simplified',
        short_name: 'Split It',
        description: 'Split bills with friends, simplify debts and settle up.',
        theme_color: '#6d28d9',
        background_color: '#0b0a14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Add expense', url: '/add', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Scan receipt', url: '/scan', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
          { name: 'Inbox', url: '/inbox', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] },
        ],
        // Android only: "Share → Split It" for payment screenshots, receipts and payment texts.
        // POST so images can be shared; public/share-target-sw.js handles it in the service worker.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'image', accept: ['image/*'] }] },
        },
      },
      workbox: {
        importScripts: ['share-target-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Firebase Auth's redirect handler (/__/auth/*) must reach the network, not the SPA shell.
        navigateFallbackDenylist: [/^\/__\//],
        // OCR files are big; cache them on first use instead of precaching.
        globIgnores: ['tesseract/**'],
        runtimeCaching: [
          { urlPattern: /\/tesseract\/[^/]+\.js$/, handler: 'CacheFirst', options: { cacheName: 'tesseract', expiration: { maxEntries: 8 } } },
          { urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data\//, handler: 'CacheFirst', options: { cacheName: 'tesseract-lang', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 4 } } },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
