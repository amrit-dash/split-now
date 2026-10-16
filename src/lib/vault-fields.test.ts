import { describe, expect, it } from 'vitest'
import { isToken, openText, vaultKey } from './vault-crypto'
import { CAPS, sealChat, sealComment, sealExpense } from './vault-fields'

const dek = btoa(String.fromCharCode(...new Array(32).fill(9)))

describe('sealing a private group’s writes', () => {
  it('seals a message, its author and the reply it quotes, within the rules’ caps', async () => {
    const k = await vaultKey('g', dek)
    const m = await sealChat(k, { text: 'on my way', authorName: 'Asha', replyTo: { id: 'c1', authorUid: 'u2', authorName: 'Dev', text: 'where are you?' } })
    expect(isToken(m.text)).toBe(true)
    expect(isToken(m.authorName)).toBe(true)
    expect(isToken(m.replyTo?.text)).toBe(true)
    expect(m.replyTo?.text.length).toBeLessThanOrEqual(CAPS.replyText)
    expect(m.replyTo?.id).toBe('c1')
    expect(await openText(m.replyTo?.authorName ?? '', k)).toBe('Dev')
  })
  it('seals a comment’s author, and an expense’s words but not its amount', async () => {
    const k = await vaultKey('g', dek)
    const c = await sealComment(k, { text: 'paid', authorName: 'Asha' })
    expect(isToken(c.authorName)).toBe(true)
    const e = await sealExpense(k, { description: 'Hotel', notes: '', icon: '🏨' })
    expect(isToken(e.description)).toBe(true)
    expect(isToken(e.icon)).toBe(true)
    expect(e.icon?.length).toBeLessThanOrEqual(CAPS.emoji)
    expect(e.notes).toBe('')
  })
})
