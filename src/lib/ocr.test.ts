import { describe, expect, it } from 'vitest'
import { corePath, coreVariant } from './ocr'

describe('OCR core selection', () => {
  it('prefers relaxed SIMD, then SIMD, then the basic core', () => {
    expect(coreVariant(() => true)).toBe('relaxedsimd')
    let calls = 0
    expect(coreVariant(() => calls++ === 1)).toBe('simd')
    expect(coreVariant(() => false)).toBe('basic')
  })

  it('falls back to the basic core when validation itself fails', () => {
    expect(coreVariant(() => { throw new Error('no WebAssembly') })).toBe('basic')
  })

  it('detects a real engine', () => {
    expect(['relaxedsimd', 'simd', 'basic']).toContain(coreVariant())
  })

  it('maps each variant to the glue file scripts/vite-tesseract.ts emits', () => {
    expect(corePath('basic')).toBe('/tesseract/tesseract-core-lstm.js')
    expect(corePath('simd')).toBe('/tesseract/tesseract-core-simd-lstm.js')
    expect(corePath('relaxedsimd')).toBe('/tesseract/tesseract-core-relaxedsimd-lstm.js')
  })
})
