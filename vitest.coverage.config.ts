import type { ConfigEnv } from 'vite'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/**
 * Unit tests with coverage: npm run test:coverage. Same suite as `npm test` (the `test` block in
 * vite.config.ts), plus the v8 provider over the pure modules. The provider is a separate package
 * pinned to the vitest version: `npm i -D @vitest/coverage-v8@5.0.3` once, then the thresholds
 * below gate regressions (set a few points under the measured numbers; raise them as cover grows).
 * vite.config.ts is a function of the mode (it picks the data layer), so it is called first.
 */
export default defineConfig((env: ConfigEnv) =>
  mergeConfig(
    typeof viteConfig === 'function' ? viteConfig(env) : viteConfig,
    defineConfig({
      test: {
        coverage: {
          provider: 'v8',
          include: ['src/lib/**', 'src/data/localRepo.ts', 'shared/**', 'functions/src/lib/**'],
          exclude: ['**/*.test.ts', '**/*.d.ts'],
          reporter: ['text-summary', 'lcov'],
          thresholds: { lines: 75, functions: 75, branches: 65, statements: 75 },
        },
      },
    }),
  ),
)
