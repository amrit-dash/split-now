import { describe, expect, it } from 'vitest'
import {
  autoMode,
  customLook,
  effectiveMode,
  groupUsesApprovals,
  hintLookForMode,
  lookForMode,
  resolveModeChoice,
  SIMPLE_HIDES,
  settleAuto,
  showsFeature,
} from './mode'
import { DEFAULT_MOTION } from './motion'

const plain = { look: 'app', icons: 'app', duo: true, motion: DEFAULT_MOTION }

describe('resolveModeChoice', () => {
  it('reads a stored mode, anything else is auto', () => {
    expect(resolveModeChoice('simple')).toBe('simple')
    expect(resolveModeChoice('advanced')).toBe('advanced')
    expect(resolveModeChoice('extreme')).toBe('auto')
    expect(resolveModeChoice(null)).toBe('auto')
  })
})

describe('customLook', () => {
  it('is false for the defaults, true once a hidden setting was changed', () => {
    expect(customLook(plain)).toBe(false)
    expect(customLook({ ...plain, look: 'minimal' })).toBe(true)
    expect(customLook({ ...plain, icons: 'filled' })).toBe(true)
    expect(customLook({ ...plain, duo: false })).toBe(true)
    expect(customLook({ ...plain, motion: { ...DEFAULT_MOTION, on: !DEFAULT_MOTION.on } })).toBe(true)
  })
})

describe('groupUsesApprovals', () => {
  it('any approval setting counts', () => {
    expect(groupUsesApprovals({})).toBe(false)
    for (const k of ['requireApproval', 'paymentApproval', 'mergeNeedsOk', 'approveJoins']) expect(groupUsesApprovals({ [k]: true })).toBe(true)
  })
})

describe('auto mode', () => {
  it('is Simple for a new or light account, Advanced once it uses an Advanced feature', () => {
    expect(autoMode({ customLook: false })).toBe('simple')
    expect(autoMode({ customLook: false, capture: false, approvals: false })).toBe('simple')
    expect(autoMode({ customLook: true })).toBe('advanced')
    expect(autoMode({ customLook: false, capture: true })).toBe('advanced')
    expect(autoMode({ customLook: false, approvals: true })).toBe('advanced')
  })
  it('a picked mode wins over the signals', () => {
    expect(effectiveMode('simple', { customLook: true, capture: true })).toBe('simple')
    expect(effectiveMode('advanced', { customLook: false })).toBe('advanced')
    expect(effectiveMode('auto', { customLook: false, capture: true })).toBe('advanced')
  })
  it('keeps Advanced once it is known, never stores Simple, never overrides a pick', () => {
    expect(settleAuto('auto', { customLook: false, approvals: true })).toBe('advanced')
    expect(settleAuto('auto', { customLook: false })).toBeNull()
    expect(settleAuto('simple', { customLook: true })).toBeNull()
  })
})

describe('lookForMode', () => {
  it('Simple is always Short tips (needed); Advanced keeps the chosen detail level', () => {
    expect(lookForMode('simple', 'full')).toBe('needed')
    expect(lookForMode('advanced', 'tooltip')).toBe('tooltip')
  })
  it('subtext in Simple is Minimal: only the must-read lines', () => {
    expect(hintLookForMode('simple', 'full')).toBe('minimal')
    expect(hintLookForMode('advanced', 'needed')).toBe('needed')
  })
})

describe('showsFeature', () => {
  it('Advanced shows everything; Simple hides only its list', () => {
    for (const f of SIMPLE_HIDES) {
      expect(showsFeature('advanced', f)).toBe(true)
      expect(showsFeature('simple', f)).toBe(false)
    }
  })
  it('the list has no repeats', () => {
    expect(new Set(SIMPLE_HIDES).size).toBe(SIMPLE_HIDES.length)
  })
})
