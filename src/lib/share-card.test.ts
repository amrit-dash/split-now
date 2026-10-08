import { describe, expect, it } from 'vitest'
import { cardSpec, firstName, reminderText, reminderUpi, settleLink, type ReminderArgs } from './share-card'

const base: ReminderArgs = {
  origin: 'https://split-now.web.app',
  groupId: 'g_goa',
  groupName: 'Goa trip',
  emoji: '🏖️',
  debtor: { id: 'm_rahul', name: 'Rahul Sharma' },
  payee: { id: 'm_priya', name: 'Priya' },
  amount: 124000,
  currency: 'INR',
  upi: 'priya@okaxis',
}

describe('settle link', () => {
  it('lands on the prefilled Settle up screen', () => {
    expect(settleLink(base)).toBe('https://split-now.web.app/groups/g_goa/settle?from=m_rahul&to=m_priya&amount=124000')
  })
  it('encodes ids and rounds the amount', () => {
    expect(settleLink({ ...base, groupId: 'a b', debtor: { id: 'x&y', name: 'X' }, amount: 10.4 })).toBe(
      'https://split-now.web.app/groups/a%20b/settle?from=x%26y&to=m_priya&amount=10',
    )
  })
})

describe('reminder text', () => {
  it('uses first names, the amount, the group and the UPI ID', () => {
    expect(reminderText(base)).toBe('Hey Rahul, friendly nudge: you owe Priya ₹1,240.00 for “Goa trip”. UPI: priya@okaxis. Pay in one tap:')
  })
  it('leaves UPI out for other currencies or a missing / invalid handle', () => {
    expect(reminderText({ ...base, currency: 'AUD' })).not.toContain('UPI')
    expect(reminderText({ ...base, upi: undefined })).not.toContain('UPI')
    expect(reminderText({ ...base, upi: 'not a vpa' })).not.toContain('UPI')
  })
  it('first names', () => {
    expect(firstName('Rahul Sharma')).toBe('Rahul')
    expect(firstName('  Priya ')).toBe('Priya')
    expect(firstName('')).toBe('')
  })
})

describe('card spec', () => {
  it('spells out who owes whom with a UPI QR for the exact amount', () => {
    const s = cardSpec(base)
    expect(s).toMatchObject({
      group: '🏖️ Goa trip',
      heading: 'Rahul → Priya',
      amount: '₹1,240.00',
      line: 'Rahul owes Priya',
      pay: 'Pay with UPI → priya@okaxis',
    })
    expect(s.qr).toBe('upi://pay?pa=priya@okaxis&pn=Priya&am=1240.00&cu=INR&tn=Split%20Now%20Goa%20trip')
    expect(reminderUpi(base)).toBe(s.qr)
  })
  it('has no QR without a usable UPI ID', () => {
    expect(cardSpec({ ...base, upi: undefined }).qr).toBeUndefined()
    expect(cardSpec({ ...base, currency: 'AUD' }).pay).toBeUndefined()
    expect(cardSpec({ ...base, emoji: undefined }).group).toBe('Goa trip')
  })
})
