// Bundles src/index.ts (plus ../shared/sms-parse.ts and ../shared/capture-filters.ts, which live outside this package) into
// lib/index.js. Packages from node_modules (firebase-functions, firebase-admin) stay external
// and are installed by Cloud Build from package.json. `gcp-build` is empty in package.json so
// Cloud Build doesn't try to rebuild (it doesn't receive ../shared); the CLI uploads lib/.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
})
