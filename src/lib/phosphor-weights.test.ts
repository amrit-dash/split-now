import { describe, expect, it } from 'vitest'
import { dropWeights, isWeightsFile, KEPT_WEIGHTS } from './phosphor-weights'

const fixture = `import * as e from "react";
const a = /* @__PURE__ */ new Map([
  [
    "bold",
    e.createElement("path", { d: "M1,2a[3]" })
  ],
  [
    "fill",
    e.createElement(e.Fragment, null, e.createElement("path", { d: "M4,5" }))
  ],
  [
    "regular",
    e.createElement("path", { d: "M6,7" })
  ],
  [
    "thin",
    e.createElement("path", { d: "M8,9" })
  ]
]);
export { a as default };
`

describe('dropWeights', () => {
  it('keeps regular, duotone and fill, and drops the rest', () => {
    const out = dropWeights(fixture)
    expect(out).toContain('"fill"')
    expect(out).toContain('"regular"')
    expect(out).not.toContain('"bold"')
    expect(out).not.toContain('"thin"')
    expect(out).toContain('export { a as default };')
  })
  it('skips brackets inside strings', () => {
    expect(dropWeights(fixture)).not.toContain('M1,2a[3]')
  })
  it('leaves a file that is not a weights map alone', () => {
    expect(dropWeights('export const x = 1')).toBe('export const x = 1')
    expect(dropWeights('[ "bold", ( ')).toBe('[ "bold", ( ')
  })
  it('a real Phosphor icon still evaluates to a map of the kept weights', async () => {
    // The package's exports hide dist/defs, so read the file by its path from the project root.
    const files = import.meta.glob<string>('/node_modules/@phosphor-icons/react/dist/defs/House.es.js', { query: '?raw', import: 'default', eager: true })
    const src = Object.values(files)[0]
    expect(src).toContain('"bold"')
    const out = dropWeights(src)
    expect(out.length).toBeLessThan(src.length * 0.65)
    // Evaluate it with a stand-in React, the way the bundle will.
    const body = out.replace(/^import \* as (\w+) from "react";/, 'const $1 = React;').replace(/export \{\s*(\w+) as default\s*\};?/, 'return $1;')
    const map = new Function('React', body)({ createElement: (...a: unknown[]) => a, Fragment: 'F' }) as Map<string, unknown>
    expect([...map.keys()].sort()).toEqual([...KEPT_WEIGHTS].sort())
  })
})

describe('isWeightsFile', () => {
  it('matches only Phosphor’s weights files', () => {
    expect(isWeightsFile('/x/node_modules/@phosphor-icons/react/dist/defs/House.es.js')).toBe(true)
    expect(isWeightsFile('C:\\x\\node_modules\\@phosphor-icons\\react\\dist\\defs\\House.es.js')).toBe(true)
    expect(isWeightsFile('/x/node_modules/@phosphor-icons/react/dist/csr/House.es.js')).toBe(false)
    expect(isWeightsFile('/x/src/lib/icons.ts')).toBe(false)
  })
})
