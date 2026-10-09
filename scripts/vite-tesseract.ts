/**
 * Self-hosts the Tesseract.js worker and WASM cores under /tesseract/ so receipt OCR
 * doesn't depend on a CDN and keeps working offline once the files have been cached
 * (see workbox runtimeCaching in vite.config.ts). Dev: served from node_modules.
 * Build: emitted as assets. Only the LSTM cores are shipped (we always use OEM 1).
 *
 * The English language data (~2 MB) still comes from the jsDelivr CDN on first use;
 * tesseract.js caches it in IndexedDB and the service worker caches the response too.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)

function files(): Record<string, string> {
  const tjs = path.dirname(require.resolve('tesseract.js/package.json'))
  const core = path.dirname(require.resolve('tesseract.js-core/package.json'))
  const out: Record<string, string> = { 'worker.min.js': path.join(tjs, 'dist/worker.min.js') }
  for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
    out[f] = path.join(core, f)
  }
  return out
}

export function tesseractAssets(): Plugin {
  return {
    name: 'split-it:tesseract-assets',
    configureServer(server) {
      const map = files()
      server.middlewares.use('/tesseract/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0]
        const src = map[name]
        if (!src) return next()
        res.setHeader('Content-Type', 'text/javascript')
        res.end(readFileSync(src))
      })
    },
    generateBundle() {
      for (const [name, src] of Object.entries(files())) {
        this.emitFile({ type: 'asset', fileName: `tesseract/${name}`, source: readFileSync(src) })
      }
    },
  }
}
