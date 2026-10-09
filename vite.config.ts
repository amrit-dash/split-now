/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { tesseractAssets } from './scripts/vite-tesseract.ts'

/** "0.1.0+ab12cd3": package version plus the git commit, so a bug report can name the build. */
function appVersion(): string {
  let sha = 'dev'
  try {
    sha =
      execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() || 'dev'
  } catch {
    /* not a git checkout */
  }
  return `${pkg.version}+${sha}`
}

/**
 * Preloads the Latin Inter file alongside the stylesheet. A browser only discovers a font when
 * it lays out the first text that needs it, i.e. after CSS and JS have arrived; the hint starts
 * the (same-origin, precached after the first visit) download with the HTML instead.
 */
function fontPreload(): Plugin {
  let base = '/'
  return {
    name: 'split-it:font-preload',
    apply: 'build',
    configResolved(c) {
      base = c.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((f) => /inter-latin-wght-normal[^/]*\.woff2$/.test(f))
          .map((f) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href: base + f },
            injectTo: 'head' as const,
          }))
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  // Which data layer `#repo-impl` is (src/data/index.ts): Firebase when the project is configured
  // for this mode (.env.production, .env.local, …), else the in-browser demo repo (`vite --mode e2e`,
  // a checkout without .env.local). A static import either way, so the browser preloads it with
  // the entry instead of discovering it after React has started, and neither build ships the other's code.
  const firebase = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID)
  return {
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '#repo-impl': path.resolve(import.meta.dirname, firebase ? 'src/data/impl.firebase.ts' : 'src/data/impl.local.ts'),
        // Firestore imports re2js (43 KB gzip) for pipeline regex expressions the app never issues; see the stub.
        re2js: path.resolve(import.meta.dirname, 'src/stubs/re2js.ts'),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      tesseractAssets(),
      fontPreload(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          // A stable identity for the installed app, so start_url can change later without creating a second app.
          id: '/',
          name: 'Split Now — split bills, settle up over UPI',
          short_name: 'Split Now',
          description: 'Spending is wise, splitting is free. Split Now! Split bills with friends, simplify debts and settle up over UPI in a tap.',
          lang: 'en',
          dir: 'ltr',
          theme_color: '#6d28d9',
          background_color: '#0b0a14',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          // Shortcuts, shares and notification taps reuse the open window instead of opening another.
          launch_handler: { client_mode: 'navigate-existing' },
          // No orientation lock: tablets and foldables may rotate.
          start_url: '/',
          scope: '/',
          categories: ['finance', 'productivity'],
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'pwa-mono-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
          ],
          shortcuts: [
            // Android draws shortcut icons from the alpha channel: the white silhouette, not the colour tile.
            { name: 'Add expense', url: '/add', icons: [{ src: 'badge-96.png', sizes: '96x96', type: 'image/png' }] },
            { name: 'Scan receipt', url: '/scan', icons: [{ src: 'badge-96.png', sizes: '96x96', type: 'image/png' }] },
            { name: 'Inbox', url: '/inbox', icons: [{ src: 'badge-96.png', sizes: '96x96', type: 'image/png' }] },
          ],
          // Android only: "Share → Split Now" for payment screenshots, receipts and payment texts.
          // POST so images can be shared; public/share-target-sw.js handles it in the service worker.
          share_target: {
            action: '/share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'image', accept: ['image/*'] }] },
          },
        },
        workbox: {
          importScripts: ['share-target-sw.js', 'push-sw.js'],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Take control of open windows as soon as the worker activates (first visit included), so
          // offline routing, the share target and notification taps work without a reload.
          // skipWaiting stays off: updates still go through the prompt (UpdatePrompt.tsx).
          clientsClaim: true,
          navigateFallback: '/index.html',
          // Firebase Auth's redirect handler (/__/auth/*) and the API must reach the network, not the
          // SPA shell; /share-target is answered by share-target-sw.js (a GET there has nothing to show).
          navigateFallbackDenylist: [/^\/__\//, /^\/api\//, /^\/share-target/],
          // OCR files are big; cache them on first use instead of precaching.
          globIgnores: ['tesseract/**'],
          runtimeCaching: [
            { urlPattern: /\/tesseract\/[^/]+\.(?:js|wasm)$/, handler: 'CacheFirst', options: { cacheName: 'tesseract', expiration: { maxEntries: 10 } } },
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data\//,
              handler: 'CacheFirst',
              options: { cacheName: 'tesseract-lang', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 4 } },
            },
          ],
        },
      }),
    ],
    test: { environment: 'node', include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'functions/src/**/*.test.ts'] },
  }
})
