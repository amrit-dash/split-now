import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('icon-art', () => {
  it('the generated icon files match the lists in scripts/icon-art.mjs (run npm run icons:art)', () => {
    const run = () => execFileSync(process.execPath, [join(__dirname, 'icon-art.mjs'), '--check'], { stdio: 'pipe' })
    expect(run).not.toThrow()
  }, 60_000)
})
