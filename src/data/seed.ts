import type { Expense, Group, Settlement } from '@/types'
import { computeSplits } from '@/lib/splits'
import { colorFor } from '@/lib/colors'
import { firstNextDate } from '@/lib/recurrence'
import type { AuthUser } from './repo'

/** Sample data so demo mode looks alive on first launch. */
export function seedDemo(_state: unknown, user: AuthUser) {
  const now = Date.now()
  const day = (offset: number) => {
    const d = new Date(now - offset * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const bali: Group = {
    id: 'g_bali', name: 'Bali Trip', emoji: '🏝️', type: 'trip', currency: 'AUD', budget: 400000, simplify: true,
    memberUids: [user.uid],
    members: {
      me: { name: user.displayName, uid: user.uid, color: colorFor(0) },
      p_sarah: { name: 'Sarah', color: colorFor(1) },
      p_jay: { name: 'Jay', color: colorFor(2) },
      p_mia: { name: 'Mia', color: colorFor(3) },
    },
    inviteCode: 'BALI26', createdBy: user.uid, createdAt: now - 30 * 86400000, updatedAt: now,
  }
  const flat: Group = {
    id: 'g_flat', name: 'Fitzroy Flat', emoji: '🏠', type: 'home', currency: 'AUD', simplify: false,
    memberUids: [user.uid],
    members: {
      me: { name: user.displayName, uid: user.uid, color: colorFor(0) },
      p_alex: { name: 'Alex', color: colorFor(4) },
      p_sam: { name: 'Sam', color: colorFor(5) },
    },
    inviteCode: 'FLAT42', createdBy: user.uid, createdAt: now - 90 * 86400000, updatedAt: now - 86400000,
  }
  const B = Object.keys(bali.members)
  const F = Object.keys(flat.members)
  const mk = (g: Group, order: string[], i: number, description: string, amount: number, category: Expense['category'], payer: string, offset: number, splitType: Expense['splitType'] = 'equal', splitInput: Expense['splitInput'] = { selected: order }): Expense => ({
    id: `e_${g.id}_${i}`, groupId: g.id, description, amount, category, date: day(offset),
    paidBy: { [payer]: amount }, splits: computeSplits(amount, splitType, splitInput, order), splitType, splitInput,
    createdBy: user.uid, createdAt: now - offset * 86400000, updatedAt: now - offset * 86400000,
  })
  const expenses: Expense[] = [
    mk(bali, B, 1, 'Villa in Canggu', 168000, 'stay', 'me', 20),
    mk(bali, B, 2, 'Flights MEL → DPS', 92000, 'travel', 'p_sarah', 25, 'shares', { shares: { me: 1, p_sarah: 1, p_jay: 1, p_mia: 1 } }),
    mk(bali, B, 3, 'Beach club dinner', 34500, 'food', 'p_jay', 18),
    mk(bali, B, 4, 'Scooter hire', 12000, 'transport', 'p_mia', 17, 'equal', { selected: ['me', 'p_jay', 'p_mia'] }),
    mk(bali, B, 5, 'Surf lessons', 24000, 'entertainment', 'me', 16, 'exact', { exact: { me: 6000, p_sarah: 6000, p_jay: 12000 } }),
    mk(bali, B, 6, 'Nasi goreng + Bintangs', 8650, 'food', 'p_sarah', 15),
    mk(bali, B, 7, 'Uluwatu temple tour', 18000, 'entertainment', 'p_jay', 14, 'percent', { percent: { me: 40, p_sarah: 20, p_jay: 20, p_mia: 20 } }),
    mk(flat, F, 1, 'Rent — September', 330000, 'rent', 'me', 37),
    mk(flat, F, 2, 'Power bill', 21480, 'utilities', 'p_alex', 33),
    mk(flat, F, 3, 'Woolworths shop', 15675, 'groceries', 'p_sam', 9),
    { ...mk(flat, F, 4, 'Internet — NBN', 8999, 'utilities', 'me', 6), recurrence: { freq: 'monthly', nextDate: firstNextDate(day(6), 'monthly') } },
    mk(flat, F, 5, 'Rent — October', 330000, 'rent', 'me', 7),
    mk(flat, F, 6, 'Coles shop', 12340, 'groceries', 'p_alex', 3),
  ]
  const settlements: Settlement[] = [
    { id: 's_1', groupId: 'g_flat', from: 'p_alex', to: 'me', amount: 110000, method: 'PayID', date: day(30), createdBy: user.uid, createdAt: now - 30 * 86400000 },
  ]
  return {
    groups: { [bali.id]: bali, [flat.id]: flat },
    expenses: Object.fromEntries(expenses.map((e) => [e.id, e])),
    settlements: Object.fromEntries(settlements.map((s) => [s.id, s])),
  }
}
