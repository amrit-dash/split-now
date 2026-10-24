/*
 * Quick add's test lines: real ways people type or say a cost, a payment or a group, with what
 * each should become. The phone's reader is checked against them in quick-cases.test.ts (every CI
 * run); scripts/quick-eval.ts runs the same lines through Quick add with AI against the real model
 * (not in CI: it costs a few cents a run). A case names where it was said from (`from`: a group's
 * page, or 'home'), and what should happen. People are member ids of the fixture groups below.
 */
import type { Group, Member } from '@/types'

const m = (name: string, uid?: string): Member => ({ name, color: '#000', ...(uid ? { uid } : {}) })
const g = (id: string, name: string, type: Group['type'], members: Record<string, Member>): Group => ({
  id,
  name,
  emoji: '✈️',
  type,
  currency: 'INR',
  simplify: true,
  members,
  memberUids: Object.values(members)
    .map((x) => x.uid)
    .filter((x): x is string => !!x),
  inviteCode: 'X',
  createdBy: 'u_me',
  createdAt: 1,
  updatedAt: 1,
})

/** Your groups in every case: a trip, a flat, a 1:1 with Rahul Sharma, an office group with another Rahul, and college friends with two Rahuls. */
export const CASE_GROUPS: Group[] = [
  g('g_goa', 'Goa Trip', 'trip', { me: m('Asha', 'u_me'), p_rahul: m('Rahul Sharma'), p_priya: m('Priya'), p_rohan: m('Rohan') }),
  g('g_flat', 'Flat 4B', 'home', { me2: m('Asha', 'u_me'), p_meera: m('Meera'), p_arjun: m('Arjun') }),
  g('g_rahul', 'Rahul Sharma', 'direct', { me3: m('Asha', 'u_me'), p_r: m('Rahul Sharma') }),
  g('g_office', 'Office Lunch', 'office', { me4: m('Asha', 'u_me'), p_rk: m('Rahul Kapoor'), p_dev: m('Dev'), p_priya2: m('Priya Nair') }),
  g('g_col', 'College', 'other', { me5: m('Asha', 'u_me'), p_rs: m('Rahul Sharma'), p_rv: m('Rahul Verma'), p_neha: m('Neha') }),
]
export const CASE_UID = 'u_me'

export type QuickExpect =
  | {
      kind: 'expense'
      group: string
      amount?: number
      description?: string
      /** member id, or 'me' */
      payer?: string
      /** exactly these share it (member ids / 'me'); omitted: not checked; 'all': the whole group */
      sharers?: string[] | 'all'
      /** exact minor units per person */
      exact?: Record<string, number>
      date?: string
    }
  | { kind: 'payment'; group: string; from: string; to: string; amount?: number }
  | { kind: 'askGroup'; groups: string[] }
  | { kind: 'askPayer'; group: string; choices: string[] }
  /** "Which Rahul?" */
  | { kind: 'askWho'; group: string; ids: string[] }
  /** someone the group doesn't have: add them or leave them out */
  | { kind: 'askUnknown'; group: string; names: string[] }
  | { kind: 'newGroup'; names: string[] }
  | { kind: 'openItem'; group: string }
  /** the phone can't settle it: AI should (the AI eval checks `ai`) */
  | { kind: 'ai'; ai?: Exclude<QuickExpect, { kind: 'ai' }> }

export interface QuickCase {
  line: string
  /** a group's page ('g_goa'), or 'home' (no group: the default is the last group used, g_goa) */
  from: string
  expect: QuickExpect
}

export const QUICK_CASES: QuickCase[] = [
  // ---- the owner's lines (23 Oct 2026) ----
  {
    line: 'For lunch with Rahul bill was 1762 and they paid',
    from: 'g_goa',
    expect: { kind: 'expense', group: 'g_goa', amount: 176200, description: 'Lunch', payer: 'p_rahul', sharers: ['me', 'p_rahul'] },
  },
  // from Home: the smallest group with a Rahul is the 1:1 (the form shows it, with Change, before anything saves)
  { line: 'For lunch with Rahul bill was 1762 and they paid', from: 'home', expect: { kind: 'expense', group: 'g_rahul', amount: 176200, payer: 'p_r' } },
  // two groups of the same size have Priya: which one
  { line: 'coffee 200 with Priya', from: 'home', expect: { kind: 'askGroup', groups: ['g_goa', 'g_office'] } },
  // ---- who paid ----
  {
    line: 'dinner 1200 with Rahul, I paid',
    from: 'g_goa',
    expect: { kind: 'expense', group: 'g_goa', amount: 120000, payer: 'me', sharers: ['me', 'p_rahul'] },
  },
  { line: 'cab 300 Priya paid', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 30000, payer: 'p_priya' } },
  { line: 'coffee 300 Rohan covered it', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 30000, payer: 'p_rohan' } },
  { line: 'drinks 1200 on Priya', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 120000, payer: 'p_priya' } },
  { line: 'paid by Rohan, petrol 2000', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 200000, payer: 'p_rohan' } },
  {
    line: 'cab 450 with Priya she paid',
    from: 'g_goa',
    expect: { kind: 'expense', group: 'g_goa', amount: 45000, payer: 'p_priya', sharers: ['me', 'p_priya'] },
  },
  { line: 'dinner with Priya and Rohan 3000 he paid', from: 'g_goa', expect: { kind: 'askPayer', group: 'g_goa', choices: ['p_priya', 'p_rohan'] } },
  { line: 'lunch 900 they paid', from: 'g_goa', expect: { kind: 'ai' } },
  // ---- who shares it ----
  { line: 'groceries 640', from: 'g_flat', expect: { kind: 'expense', group: 'g_flat', amount: 64000, payer: 'me', sharers: 'all' } },
  { line: 'dinner 2400 with Priya and Rohan', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', sharers: ['me', 'p_priya', 'p_rohan'] } },
  {
    line: 'taxi 900 everyone except Rohan, Priya paid',
    from: 'g_goa',
    expect: { kind: 'expense', group: 'g_goa', payer: 'p_priya', sharers: ['me', 'p_rahul', 'p_priya'] },
  },
  { line: 'movie 600 for everyone', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 60000, sharers: 'all' } },
  { line: 'lunch for Rohan 500', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 50000, payer: 'me', sharers: ['p_rohan'] } },
  { line: 'pizza 900 split 3 ways', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 90000 } },
  // ---- uneven parts ----
  { line: 'cab 600 I paid, Rahul owes 400', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', payer: 'me', exact: { p_rahul: 40000, me: 20000 } } },
  { line: 'pizza 1000 I paid, Rahul 700 rest me', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', exact: { p_rahul: 70000, me: 30000 } } },
  { line: 'groceries 1500 split 60/40 with Meera', from: 'g_flat', expect: { kind: 'expense', group: 'g_flat', exact: { me2: 90000, p_meera: 60000 } } },
  {
    line: 'hotel 9000 Rahul 2 shares Priya 1 share me 1 share',
    from: 'g_goa',
    expect: { kind: 'expense', group: 'g_goa', exact: { p_rahul: 450000, p_priya: 225000, me: 225000 } },
  },
  { line: 'snacks 500 Rahul 30% Priya 70%', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', exact: { p_rahul: 15000, p_priya: 35000 } } },
  { line: 'tickets 1000 Rahul 700 Priya 300', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', exact: { p_rahul: 70000, p_priya: 30000 } } },
  {
    line: 'rent 30000 Meera 12000 Arjun 9000 rest me',
    from: 'g_flat',
    expect: { kind: 'expense', group: 'g_flat', exact: { p_meera: 1200000, p_arjun: 900000, me2: 900000 } },
  },
  // ---- payments back ----
  { line: 'paid Rahul 500 back', from: 'g_goa', expect: { kind: 'payment', group: 'g_goa', from: 'me', to: 'p_rahul', amount: 50000 } },
  { line: 'I paid Priya 300', from: 'g_goa', expect: { kind: 'payment', group: 'g_goa', from: 'me', to: 'p_priya', amount: 30000 } },
  { line: 'Rohan paid me 200 back', from: 'g_goa', expect: { kind: 'payment', group: 'g_goa', from: 'p_rohan', to: 'me', amount: 20000 } },
  { line: 'sent Meera 1500', from: 'g_flat', expect: { kind: 'payment', group: 'g_flat', from: 'me2', to: 'p_meera', amount: 150000 } },
  { line: 'got 800 back from Arjun', from: 'g_flat', expect: { kind: 'payment', group: 'g_flat', from: 'p_arjun', to: 'me2', amount: 80000 } },
  { line: 'paid Arjun 500 back', from: 'home', expect: { kind: 'payment', group: 'g_flat', from: 'me2', to: 'p_arjun', amount: 50000 } },
  // ---- choosing the group from Home ----
  { line: 'chai 60 with Meera', from: 'home', expect: { kind: 'expense', group: 'g_flat', amount: 6000, sharers: ['me2', 'p_meera'] } },
  { line: 'cab 300 with Dev', from: 'home', expect: { kind: 'expense', group: 'g_office', amount: 30000 } },
  { line: 'beach shack 2000 with Priya and Rohan', from: 'home', expect: { kind: 'expense', group: 'g_goa', amount: 200000 } },
  { line: 'drinks 2000 with Kabir I paid', from: 'home', expect: { kind: 'newGroup', names: ['Kabir'] } },
  { line: 'movie 800', from: 'home', expect: { kind: 'expense', group: 'g_goa', amount: 80000 } },
  // ---- money, dates, words ----
  { line: 'dinner ₹1,250.50 with Rohan', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 125050 } },
  { line: 'petrol 2k Rohan paid', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 200000, payer: 'p_rohan' } },
  { line: 'yesterday breakfast 450 with Priya', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 45000, date: '2026-10-22' } },
  { line: 'dinner the total came to 2400 with Rohan', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 240000, description: 'Dinner' } },
  // ---- same names, full names, people the group doesn't have ----
  { line: 'dinner 1200 with Rahul', from: 'g_col', expect: { kind: 'askWho', group: 'g_col', ids: ['p_rs', 'p_rv'] } },
  { line: 'cab 300 Rahul paid', from: 'g_col', expect: { kind: 'askWho', group: 'g_col', ids: ['p_rs', 'p_rv'] } },
  { line: 'paid Rahul 500 back', from: 'g_col', expect: { kind: 'askWho', group: 'g_col', ids: ['p_rs', 'p_rv'] } },
  { line: 'dinner 900 with Rahul Verma', from: 'g_col', expect: { kind: 'expense', group: 'g_col', description: 'Dinner', sharers: ['me', 'p_rv'] } },
  { line: 'dinner 1500 with Rahul Verma', from: 'home', expect: { kind: 'expense', group: 'g_col', sharers: ['me', 'p_rv'] } },
  { line: 'lunch with Rahul 600', from: 'home', expect: { kind: 'expense', group: 'g_rahul', amount: 60000, sharers: ['me', 'p_r'] } },
  { line: 'dinner 1500 with Kabir', from: 'g_goa', expect: { kind: 'askUnknown', group: 'g_goa', names: ['Kabir'] } },
  { line: 'pri paid 400 for snacks', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', description: 'Snacks', payer: 'p_priya' } },
  { line: 'rahulji paid 600 chai', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', payer: 'p_rahul' } },
  // ---- more payments ----
  { line: 'settled up with Rahul by paying 700', from: 'g_goa', expect: { kind: 'payment', group: 'g_goa', from: 'me', to: 'p_rahul', amount: 70000 } },
  { line: 'Priya sent me 250', from: 'g_goa', expect: { kind: 'payment', group: 'g_goa', from: 'p_priya', to: 'me', amount: 25000 } },
  { line: 'gave Rohan 100', from: 'g_goa', expect: { kind: 'payment', group: 'g_goa', from: 'me', to: 'p_rohan', amount: 10000 } },
  // ---- more splits ----
  { line: 'hotel 6000 Priya 4000', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', description: 'Hotel', exact: { p_priya: 400000, me: 200000 } } },
  { line: 'wifi 999 Arjun 50% Meera 50%', from: 'g_flat', expect: { kind: 'expense', group: 'g_flat', exact: { p_arjun: 49950, p_meera: 49950 } } },
  {
    line: 'drinks 1500 split between me and Priya',
    from: 'g_goa',
    expect: { kind: 'expense', group: 'g_goa', description: 'Drinks', sharers: ['me', 'p_priya'] },
  },
  { line: 'dinner 2000 only for Priya', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', payer: 'me', sharers: ['p_priya'] } },
  { line: 'electricity 2400 Meera paid, split equally', from: 'g_flat', expect: { kind: 'expense', group: 'g_flat', payer: 'p_meera', sharers: 'all' } },
  { line: 'dinner 1000 with Rohan he paid', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', payer: 'p_rohan', sharers: ['me', 'p_rohan'] } },
  { line: 'Priya and Rohan owe me 300 each for cab', from: 'g_goa', expect: { kind: 'ai' } },
  // ---- money and currency ----
  { line: 'dinner 1,500 rupees with Rohan', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 150000, description: 'Dinner' } },
  { line: 'lunch $40 with Rohan', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 4000 } },
  { line: 'Rs. 450 auto with Priya', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 45000, description: 'Auto' } },
  { line: 'parking 50 paid', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 5000, description: 'Parking', payer: 'me' } },
  { line: 'groceries 640 on 2 Oct', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 64000, date: '2026-10-02' } },
  { line: 'I got 500 back for the hotel', from: 'g_goa', expect: { kind: 'expense', group: 'g_goa', amount: 50000, description: 'Hotel' } },
  // ---- no amount, or several steps: AI ----
  { line: 'dinner with Priya', from: 'g_goa', expect: { kind: 'ai' } },
  { line: 'create a group Bali with Rohan and add dinner 2000', from: 'g_goa', expect: { kind: 'ai' } },
  // ---- not sure who paid ----
  { line: 'lunch at Cafe Blue 800, not sure who paid', from: 'g_goa', expect: { kind: 'openItem', group: 'g_goa' } },
]
