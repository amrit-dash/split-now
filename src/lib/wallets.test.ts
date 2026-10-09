import { describe, expect, it } from 'vitest'
import { FIRST_WALLET_NAME, MORE_WALLETS_PLACEHOLDER, justMeTarget, walletNaming, walletsOf } from './wallets'

const trip = { id: 'goa', type: 'trip' }
const mine = { id: 'w1', type: 'personal' }
const fuel = { id: 'w2', type: 'personal' }
const old = { id: 'w0', type: 'personal', archived: true }

describe('wallets', () => {
  it('walletsOf keeps open personal wallets only', () => {
    expect(walletsOf([trip, mine, old, fuel]).map((g) => g.id)).toEqual(['w1', 'w2'])
  })
  it('the first wallet defaults to "My spending"; later ones need a name', () => {
    expect(walletNaming(0)).toEqual({ placeholder: FIRST_WALLET_NAME, fallbackName: FIRST_WALLET_NAME })
    expect(walletNaming(1)).toEqual({ placeholder: MORE_WALLETS_PLACEHOLDER, fallbackName: '' })
  })
  it('"Personal" on a capture: create, open the only wallet, or choose', () => {
    expect(justMeTarget([trip])).toEqual({ kind: 'create' })
    expect(justMeTarget([trip, old])).toEqual({ kind: 'create' })
    expect(justMeTarget([trip, mine, old])).toEqual({ kind: 'open', id: 'w1' })
    expect(justMeTarget([mine, fuel])).toEqual({ kind: 'pick', wallets: [mine, fuel] })
  })
})
