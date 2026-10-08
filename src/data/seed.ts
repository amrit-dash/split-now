import type { ActivityEntry, Expense, Group, Settlement } from '@/types'
import { computeSplits } from '@/lib/splits'
import { colorFor } from '@/lib/colors'
import { firstNextDate } from '@/lib/recurrence'
import { convertMinor } from '@/lib/fx'
import { amountLabel } from '@/lib/activity'
import { formatMoney } from '@/lib/money'
import { localISODate } from '@/lib/id'
import type { AuthUser } from './repo'

/**
 * Sample data so demo mode looks alive on first launch: a Goa trip and a Bengaluru flat, in
 * INR. Covers every split type, a recurring bill, trip dates with a pending capture, a foreign
 * currency expense (USD at a locked rate), a settlement and some activity history.
 * Amounts are paise (₹1 = 100).
 */
export function seedDemo(_state: unknown, user: AuthUser) {
  const now = Date.now()
  // Local calendar days, like todayISO(): the trip window must contain "today" on this device.
  const day = (offset: number) => localISODate(now - offset * 86400000)
  const goa: Group = {
    id: 'g_goa', name: 'Goa Trip', emoji: '🏖️', type: 'trip', currency: 'INR', budget: 12000000, simplify: true,
    startDate: day(26), endDate: day(12),
    memberUids: [user.uid],
    members: {
      me: { name: user.displayName, uid: user.uid, color: colorFor(0) },
      p_priya: { name: 'Priya', color: colorFor(1) },
      p_rohan: { name: 'Rohan', color: colorFor(2) },
      p_ananya: { name: 'Ananya', color: colorFor(3) },
    },
    inviteCode: 'GOA2026', createdBy: user.uid, createdAt: now - 30 * 86400000, updatedAt: now,
  }
  const flat: Group = {
    id: 'g_flat', name: 'Indiranagar Flat', emoji: '🏠', type: 'home', currency: 'INR', simplify: false,
    memberUids: [user.uid],
    members: {
      me: { name: user.displayName, uid: user.uid, color: colorFor(0) },
      p_arjun: { name: 'Arjun', color: colorFor(4) },
      p_kavya: { name: 'Kavya', color: colorFor(5) },
    },
    inviteCode: 'FLAT42', createdBy: user.uid, createdAt: now - 90 * 86400000, updatedAt: now - 86400000,
  }
  const G = Object.keys(goa.members)
  const F = Object.keys(flat.members)
  const mk = (g: Group, order: string[], i: number, description: string, amount: number, category: Expense['category'], payer: string, offset: number, splitType: Expense['splitType'] = 'equal', splitInput: Expense['splitInput'] = { selected: order }): Expense => ({
    id: `e_${g.id}_${i}`, groupId: g.id, description, amount, category, date: day(offset),
    paidBy: { [payer]: amount }, splits: computeSplits(amount, splitType, splitInput, order), splitType, splitInput,
    createdBy: user.uid, createdAt: now - offset * 86400000, updatedAt: now - offset * 86400000,
  })
  // Booked in dollars on a travel site, converted once at a locked rate.
  const cruiseUsd = 7200
  const usdInr = 84.12
  const cruise: Expense = {
    ...mk(goa, G, 8, 'Sunset cruise (Klook)', convertMinor(cruiseUsd, 'USD', 'INR', usdInr), 'entertainment', 'p_ananya', 13),
    original: { currency: 'USD', amount: cruiseUsd, rate: usdInr, rateDate: day(13), source: 'ecb' },
  }
  const expenses: Expense[] = [
    mk(goa, G, 1, 'Villa in Anjuna (3 nights)', 3600000, 'stay', 'me', 20),
    mk(goa, G, 2, 'Flights BLR → GOI', 2240000, 'travel', 'p_priya', 25, 'shares', { shares: { me: 1, p_priya: 1, p_rohan: 1, p_ananya: 1 } }),
    mk(goa, G, 3, 'Beach shack dinner, Baga', 485000, 'food', 'p_rohan', 18),
    mk(goa, G, 4, 'Scooty rental (3 days)', 270000, 'transport', 'p_ananya', 17, 'equal', { selected: ['me', 'p_rohan', 'p_ananya'] }),
    mk(goa, G, 5, 'Parasailing at Calangute', 600000, 'entertainment', 'me', 16, 'exact', { exact: { me: 150000, p_priya: 150000, p_rohan: 300000 } }),
    mk(goa, G, 6, 'Fish thali + Kingfishers', 196000, 'food', 'p_priya', 15),
    mk(goa, G, 7, 'Dudhsagar jeep safari', 800000, 'entertainment', 'p_rohan', 14, 'percent', { percent: { me: 40, p_priya: 20, p_rohan: 20, p_ananya: 20 } }),
    cruise,
    mk(flat, F, 1, 'Rent — September', 5400000, 'rent', 'me', 37),
    mk(flat, F, 2, 'BESCOM electricity', 214800, 'utilities', 'p_arjun', 33),
    mk(flat, F, 3, 'Swiggy Instamart', 156700, 'groceries', 'p_kavya', 9),
    { ...mk(flat, F, 4, 'ACT Fibernet broadband', 117900, 'utilities', 'me', 6), recurrence: { freq: 'monthly', nextDate: firstNextDate(day(6), 'monthly') } },
    mk(flat, F, 5, 'Rent — October', 5400000, 'rent', 'me', 7),
    mk(flat, F, 6, 'Maid & cook — October', 750000, 'other', 'p_kavya', 5),
    mk(flat, F, 7, 'Zepto order', 123400, 'groceries', 'p_arjun', 3),
  ]
  const settlements: Settlement[] = [
    { id: 's_1', groupId: 'g_flat', from: 'p_arjun', to: 'me', amount: 1800000, method: 'UPI', date: day(30), createdBy: user.uid, createdAt: now - 30 * 86400000 },
  ]
  // A little history so the activity feeds aren't empty on first launch.
  const byId = Object.fromEntries(expenses.map((e) => [e.id, e]))
  const added = (eid: string, actor: string, actorUid: string): ActivityEntry => {
    const e = byId[eid]
    return {
      id: `a_${eid}`, groupId: e.groupId, type: 'expense.created', actorUid, actorName: actor, targetId: eid,
      summary: `${actor} added “${e.description}” (${amountLabel(e.amount, e.original, 'INR')})`,
      after: { description: e.description, amount: e.amount }, createdAt: e.createdAt,
    }
  }
  const shack = byId.e_g_goa_3
  const activity: ActivityEntry[] = [
    added('e_g_goa_3', 'Rohan', 'seed_rohan'),
    {
      id: 'a_e_g_goa_3_edit', groupId: 'g_goa', type: 'expense.updated', actorUid: 'seed_rohan', actorName: 'Rohan', targetId: shack.id,
      summary: `Rohan changed amount ${formatMoney(420000, 'INR')} → ${formatMoney(shack.amount, 'INR')} on “${shack.description}”`,
      before: { amount: 420000 }, after: { amount: shack.amount }, createdAt: shack.createdAt + 3600_000,
    },
    added('e_g_goa_6', 'Priya', 'seed_priya'),
    added('e_g_goa_7', 'Rohan', 'seed_rohan'),
    added('e_g_goa_8', 'Ananya', 'seed_ananya'),
    added('e_g_flat_3', 'Kavya', 'seed_kavya'),
    added('e_g_flat_7', 'Arjun', 'seed_arjun'),
  ]
  return {
    activity: Object.fromEntries(activity.map((a) => [a.id, a])),
    groups: { [goa.id]: goa, [flat.id]: flat },
    expenses: Object.fromEntries(expenses.map((e) => [e.id, e])),
    settlements: Object.fromEntries(settlements.map((s) => [s.id, s])),
    // One card payment from the trip (picked up from a bank SMS), waiting in the inbox.
    captures: {
      c_demo: {
        id: 'c_demo', owner: user.uid, amount: 324000, currency: 'INR', merchant: 'Britto’s, Baga', date: day(16), source: 'android-auto',
        card: 'HDFC Visa', status: 'pending' as const, createdAt: now - 16 * 86400000, updatedAt: now - 16 * 86400000,
      },
    },
  }
}
