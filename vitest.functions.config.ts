import { defineConfig } from 'vitest/config'

/** Integration tests against the Functions + Firestore emulators: npm run test:functions. */
export default defineConfig({
  test: { environment: 'node', include: ['functions/test/**/*.test.ts'], testTimeout: 30000, fileParallelism: false },
})
