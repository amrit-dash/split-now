import { describe, expect, it } from 'vitest'
import type { Expense, OpenItem } from '@/types'
import {
  CLAIM_SETTLE_MS,
  OPEN_ITEM_EDIT_FIELDS,
  aiPickOf,
  askedMe,
  autoIcon,
  categoryChosen,
  chosenIcon,
  claimHref,
  editOpenItem,
  itemAltsOffered,
  itemInput,
  needsItemAutoPick,
  newOpenItem,
  openItemEmoji,
  sheetCategory,
  sheetEmoji,
  withAutoPick,
  withCategory,
  withIcon,
  withIconImage,
  withIconSvg,
  withTitle,
  openItemErrors,
  openItemMeta,
  openItemPrefill,
  openItemState,
  sortOpenItems,
  suspectLine,
} from './open-items'

const NOW = 1_760_000_000_000
const item = (over: Partial<OpenItem> = {}): OpenItem => ({
  id: 'o1',
  groupId: 'g1',
  title: 'Lunch',
  status: 'open',
  createdBy: 'u1',
  createdAt: NOW - 10_000,
  updatedAt: NOW - 10_000,
  ...over,
})
const SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#f59e0b"/></svg>'
const PIC = 'data:image/webp;base64,AAAA'
const expense = (id: string, over: Partial<Expense> = {}) => ({ id, ...over }) as Expense

describe('openItemState', () => {
  it('open, claimed and deleted', () => {
    const ex = new Map([['e1', {}]])
    expect(openItemState(item(), ex, NOW)).toBe('open')
    expect(openItemState(item({ status: 'claimed', expenseId: 'e1' }), ex, NOW)).toBe('claimed')
    expect(openItemState(item({ deletedAt: NOW }), ex, NOW)).toBe('deleted')
    // deleted wins over claimed
    expect(openItemState(item({ status: 'claimed', expenseId: 'e1', deletedAt: NOW }), ex, NOW)).toBe('deleted')
  })
  it('a claimed item whose expense is in Recently deleted is open again', () => {
    const ex = new Map([['e1', { deletedAt: NOW }]])
    expect(openItemState(item({ status: 'claimed', expenseId: 'e1', claimedAt: NOW - 1000 }), ex, NOW)).toBe('open')
  })
  it('a missing expense: claimed for a moment (listener lag), then open (deleted for good)', () => {
    const ex = new Map<string, object>()
    expect(openItemState(item({ status: 'claimed', expenseId: 'e9', claimedAt: NOW - 1000 }), ex, NOW)).toBe('claimed')
    expect(openItemState(item({ status: 'claimed', expenseId: 'e9', claimedAt: NOW - CLAIM_SETTLE_MS - 1 }), ex, NOW)).toBe('open')
  })
  it('expenses still loading: a claimed item stays claimed', () => {
    expect(openItemState(item({ status: 'claimed', expenseId: 'e9', claimedAt: 0 }), null, NOW)).toBe('claimed')
  })
  it('claimed without an expense id counts as open', () => {
    expect(openItemState(item({ status: 'claimed' }), new Map(), NOW)).toBe('open')
  })
})

describe('sortOpenItems', () => {
  it('splits and orders: open by date (newest first, undated last), claimed by claim time', () => {
    const items = [
      item({ id: 'a', date: '2026-10-01' }),
      item({ id: 'b', date: '2026-10-03' }),
      item({ id: 'c', createdAt: NOW }),
      item({ id: 'd', status: 'claimed', expenseId: 'e1', claimedAt: NOW - 5 }),
      item({ id: 'e', status: 'claimed', expenseId: 'e2', claimedAt: NOW - 1 }),
      item({ id: 'f', deletedAt: NOW }),
      item({ id: 'g', status: 'claimed', expenseId: 'e3', claimedAt: NOW - 3 }),
    ]
    const { open, claimed } = sortOpenItems(items, [expense('e1'), expense('e2'), expense('e3', { deletedAt: NOW })], NOW)
    expect(open.map((i) => i.id)).toEqual(['b', 'a', 'c', 'g'])
    expect(claimed.map((i) => i.id)).toEqual(['e', 'd'])
  })
  it('nothing loaded yet', () => {
    expect(sortOpenItems(null, null, NOW)).toEqual({ open: [], claimed: [] })
  })
})

describe('openItemPrefill', () => {
  it('paid by the claimer, split among everyone, with the item’s details', () => {
    const p = openItemPrefill(item({ title: 'Lunch', amount: 29000, date: '2026-10-02', category: 'food' }), {
      order: ['m1', 'm2', 'm3'],
      me: 'm2',
      currency: 'INR',
    })
    expect(p).toEqual({
      text: 'Lunch',
      description: 'Lunch',
      amount: 29000,
      currency: 'INR',
      payer: 'm2',
      participants: ['m1', 'm2', 'm3'],
      date: '2026-10-02',
      category: 'food',
    })
  })
  it('leaves the amount empty when unknown', () => {
    expect(openItemPrefill(item(), { order: ['m1'], me: 'm1', currency: 'INR' }).amount).toBeUndefined()
  })
  it('carries the item’s icon, drawn icon and picture, so a claimed item keeps its icon', () => {
    const ctx = { order: ['m1'], me: 'm1', currency: 'INR' }
    const p = openItemPrefill(item({ icon: '🐝', iconSvg: SVG, iconImage: PIC }), ctx)
    expect([p.icon, p.iconAuto, p.iconImage]).toEqual(['🐝', undefined, PIC])
    expect(p.iconSvg).toContain('<svg')
    expect(openItemPrefill(item({ icon: '🇱🇰', iconAuto: true }), ctx)).toMatchObject({ icon: '🇱🇰', iconAuto: true })
    const bad = openItemPrefill(item({ icon: 'locked', iconSvg: '<svg><script/></svg>', iconImage: 'nope' }), ctx)
    expect(['icon' in bad, 'iconSvg' in bad, 'iconImage' in bad]).toEqual([false, false, false])
  })
})

describe('openItemEmoji', () => {
  it('the chosen icon, else the app’s rules from the title, else the category’s', () => {
    expect(openItemEmoji({ title: 'Lunch', icon: '🐝' })).toBe('🐝')
    expect(openItemEmoji({ title: 'Pizza night' })).toBe('🍕')
    expect(openItemEmoji({ title: 'Qwzx', category: 'travel' })).toBe('✈️')
    expect(openItemEmoji({ title: 'Qwzx' })).toBe('🧾')
    // a locked private group's token isn't an emoji: the title's (scrambled) words, then the category
    expect(openItemEmoji({ title: 'Qwzx', icon: 'v1.abcdef', category: 'travel' })).toBe('✈️')
    expect(openItemEmoji({ title: 'Qwzx', category: 'nope' as never })).toBe('🧾')
  })
})

describe('claimHref', () => {
  it('opens the expense form for the item', () => {
    expect(claimHref('g 1', 'o1')).toBe('/add?group=g%201&open=o1')
  })
})

describe('openItemMeta', () => {
  it('date and amount, or what is unknown', () => {
    expect(openItemMeta({ date: '2026-10-02', amount: 29000 }, 'INR', '2026-10-11')).toMatch(/2 Oct · ₹290/)
    expect(openItemMeta({ date: '2026-10-02' }, 'INR', '2026-10-11')).toMatch(/2 Oct · amount not known/)
    expect(openItemMeta({ amount: 29000 }, 'INR', '2026-10-11')).toMatch(/^No date · ₹290/)
  })
  it('shows the year for another year', () => {
    expect(openItemMeta({ date: '2025-12-30' }, 'INR', '2026-01-02')).toMatch(/2025/)
  })
})

describe('suspectLine', () => {
  const names: Record<string, string> = { m1: 'Rahul', m2: 'Priya', m3: 'Ananya' }
  const name = (id: string) => names[id]
  it('names the people, you first', () => {
    expect(suspectLine(['m1'], 'm9', name)).toBe('Rahul might have paid')
    expect(suspectLine(['m1', 'm9'], 'm9', name)).toBe('You or Rahul might have paid')
    expect(suspectLine(['m1', 'm2', 'm3'], undefined, name)).toBe('Rahul, Priya or Ananya might have paid')
  })
  it('nobody, or only unknown people', () => {
    expect(suspectLine(undefined, 'm1', name)).toBeNull()
    expect(suspectLine(['zz'], 'm1', name)).toBeNull()
  })
  it('askedMe', () => {
    expect(askedMe({ suspects: ['m1'] }, 'm1')).toBe(true)
    expect(askedMe({ suspects: ['m1'] }, 'm2')).toBe(false)
    expect(askedMe({}, undefined)).toBe(false)
  })
})

describe('openItemErrors', () => {
  const today = '2026-10-11'
  it('needs a title', () => {
    expect(openItemErrors({ title: '  ' }, today).title).toBeTruthy()
    expect(openItemErrors({ title: 'x'.repeat(121) }, today).title).toBeTruthy()
    expect(openItemErrors({ title: 'Lunch' }, today)).toEqual({})
  })
  it('amount is optional but must be positive whole minor units', () => {
    expect(openItemErrors({ title: 'Lunch', amount: 0 }, today).amount).toBeTruthy()
    expect(openItemErrors({ title: 'Lunch', amount: 10.5 }, today).amount).toBeTruthy()
    expect(openItemErrors({ title: 'Lunch', amount: 100 }, today).amount).toBeUndefined()
  })
  it('no future dates', () => {
    expect(openItemErrors({ title: 'Lunch', date: '2026-10-12' }, today).date).toBeTruthy()
    expect(openItemErrors({ title: 'Lunch', date: '2026-10-11' }, today).date).toBeUndefined()
  })
})

describe('newOpenItem / editOpenItem', () => {
  it('trims, guesses the category, drops empty fields', () => {
    const o = newOpenItem({ title: '  Lunch   at  cafe ', notes: '  ', suspects: ['m1', 'm1'] }, { id: 'o1', groupId: 'g1', uid: 'u1', now: NOW })
    expect(o).toEqual({
      id: 'o1',
      groupId: 'g1',
      title: 'Lunch at cafe',
      category: 'food',
      suspects: ['m1'],
      status: 'open',
      createdBy: 'u1',
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
  it('an edit replaces the editable fields and keeps the rest', () => {
    const before = item({ amount: 100, notes: 'x', status: 'open' })
    const after = editOpenItem(before, { title: 'Dinner', date: '2026-10-02' }, NOW)
    expect(after.title).toBe('Dinner')
    expect(after.amount).toBeUndefined()
    expect(after.notes).toBeUndefined()
    expect(after.date).toBe('2026-10-02')
    expect(after.createdBy).toBe('u1')
    expect(after.updatedAt).toBe(NOW)
  })
})

describe('an item’s icon on save', () => {
  const ctx = { id: 'o1', groupId: 'g1', uid: 'u1', now: NOW }
  it('keeps a chosen icon, the AI’s pick with iconAuto, a drawn icon and a picture', () => {
    expect(newOpenItem({ title: 'Bees', icon: '🐝' }, ctx)).toMatchObject({ icon: '🐝' })
    expect('iconAuto' in newOpenItem({ title: 'Bees', icon: '🐝' }, ctx)).toBe(false)
    expect(newOpenItem({ title: 'Bees', icon: '🇱🇰', iconAuto: true }, ctx)).toMatchObject({ icon: '🇱🇰', iconAuto: true })
    const o = newOpenItem({ title: 'Bees', iconSvg: SVG, iconImage: PIC }, ctx)
    expect(o.iconSvg).toContain('<svg')
    expect(o.iconImage).toBe(PIC)
  })
  it('drops what isn’t an icon, and never keeps a drawing in a private group', () => {
    const o = newOpenItem({ title: 'Bees', icon: 'bees', iconAuto: true, iconSvg: '<svg><script/></svg>', iconImage: 'https://x.test/a.png' }, ctx)
    expect(['icon' in o, 'iconAuto' in o, 'iconSvg' in o, 'iconImage' in o]).toEqual([false, false, false, false])
    const v = newOpenItem({ title: 'Bees', icon: '🐝', iconSvg: SVG, iconImage: PIC }, { ...ctx, vault: true })
    expect(v.icon).toBe('🐝')
    expect(['iconSvg' in v, 'iconImage' in v]).toEqual([false, false])
    expect('iconSvg' in editOpenItem(item({ iconSvg: SVG }), { title: 'x', iconSvg: SVG }, NOW, { vault: true })).toBe(false)
  })
  it('an edit replaces the icon fields too (going back to Automatic removes them)', () => {
    const before = item({ icon: '🐝', iconAuto: true, iconSvg: SVG, iconImage: PIC })
    const after = editOpenItem(before, { title: 'Lunch' }, NOW)
    expect(['icon' in after, 'iconAuto' in after, 'iconSvg' in after, 'iconImage' in after]).toEqual([false, false, false, false])
    expect(itemInput(before)).toMatchObject({ title: 'Lunch', icon: '🐝', iconAuto: true, iconSvg: SVG, iconImage: PIC })
    expect('icon' in itemInput(item({ icon: 'v1.token' }))).toBe(false)
  })
  it('every editable field is one an edit writes', () => {
    expect([...OPEN_ITEM_EDIT_FIELDS].sort()).toEqual(['amount', 'category', 'date', 'icon', 'iconAuto', 'iconImage', 'iconSvg', 'notes', 'suspects', 'title'])
  })
})

describe('the sheet’s icon', () => {
  it('a category chosen, else the words’ guess, else Other', () => {
    expect(sheetCategory({ title: 'Pizza' })).toBe('food')
    expect(sheetCategory({ title: 'Pizza', category: 'travel' })).toBe('travel')
    expect(sheetCategory({ title: 'Qwzx' })).toBe('other')
    expect(categoryChosen({ category: 'food' })).toBe(true)
    expect(categoryChosen({ category: 'food', categoryAuto: true })).toBe(false)
    expect(categoryChosen({})).toBe(false)
    expect(withCategory({ title: 'x', category: 'food', categoryAuto: true }, 'travel')).toEqual({ title: 'x', category: 'travel' })
  })
  it('asks the AI only when nothing is chosen and the app’s rules find nothing', () => {
    expect(needsItemAutoPick({ title: '' })).toBe(false)
    expect(needsItemAutoPick({ title: 'Pizza' })).toBe(false)
    expect(needsItemAutoPick({ title: 'Sri Lanka bees' })).toBe(true)
    expect(needsItemAutoPick({ title: 'Sri Lanka bees', icon: '🐝' })).toBe(false)
    expect(needsItemAutoPick({ title: 'Sri Lanka bees', icon: '🇱🇰', iconAuto: true })).toBe(false)
    expect(needsItemAutoPick({ title: 'Sri Lanka bees', iconSvg: SVG })).toBe(false)
    expect(needsItemAutoPick({ title: 'Sri Lanka bees', iconImage: PIC })).toBe(false)
  })
  it('applies the AI’s pick for this title, and its category only while none was chosen', () => {
    const f = { title: 'Sri Lanka bees' }
    const a = withAutoPick(f, { title: 'Sri Lanka bees', icon: '🇱🇰', category: 'travel' })
    expect(a).toEqual({ title: 'Sri Lanka bees', icon: '🇱🇰', iconAuto: true, category: 'travel', categoryAuto: true })
    expect(chosenIcon(a)).toBeUndefined()
    expect(autoIcon(a)).toBe('🇱🇰')
    expect(sheetEmoji(a)).toBe('🇱🇰')
    // an old title's answer, or one after an icon was chosen, changes nothing
    expect(withAutoPick(f, { title: 'Sri Lanka', icon: '🇱🇰' })).toBe(f)
    const chosen = { ...f, icon: '🐝' }
    expect(withAutoPick(chosen, { title: 'Sri Lanka bees', icon: '🇱🇰' })).toBe(chosen)
    expect(withAutoPick({ ...f, iconSvg: SVG }, { title: 'Sri Lanka bees', icon: '🇱🇰' }).icon).toBeUndefined()
    // a chosen category stays; one the words guess stays
    expect(withAutoPick({ ...f, category: 'food' }, { title: 'Sri Lanka bees', icon: '🇱🇰', category: 'travel' }).category).toBe('food')
    expect(withAutoPick({ title: 'Toit lunch' }, { title: 'Toit lunch', category: 'travel' }).category).toBeUndefined()
    expect(withAutoPick(f, { title: 'Sri Lanka bees', icon: 'nope', category: 'nope' as never })).toEqual(f)
  })
  it('a new title drops the AI’s pick and its category, never a chosen icon or category', () => {
    const a = withAutoPick({ title: 'Sri Lanka bees' }, { title: 'Sri Lanka bees', icon: '🇱🇰', category: 'travel' })
    expect(withTitle(a, 'Sri Lanka bees!')).toEqual({ title: 'Sri Lanka bees!' })
    expect(withTitle(a, 'Sri Lanka bees')).toBe(a)
    expect(withTitle({ title: 'x', icon: '🐝', category: 'food' }, 'y')).toEqual({ title: 'y', icon: '🐝', category: 'food' })
  })
  it('picking an icon, a drawing or a picture', () => {
    const a = { title: 'Bees', icon: '🇱🇰', iconAuto: true as const, iconSvg: SVG, iconImage: PIC }
    expect(withIcon(a, '🐝')).toEqual({ title: 'Bees', icon: '🐝' })
    expect(chosenIcon(withIcon(a, '🐝'))).toBe('🐝')
    expect(withIcon(a, undefined)).toEqual({ title: 'Bees' })
    expect(withIcon(a, 'nope')).toEqual({ title: 'Bees' })
    const s = withIconSvg({ title: 'Bees', iconImage: PIC }, SVG)
    expect(s.iconSvg).toContain('<svg')
    expect('iconImage' in s).toBe(false)
    expect(withIconSvg(s, '<svg><script/></svg>')).toBe(s)
    const p = withIconImage(s, PIC)
    expect(p.iconImage).toBe(PIC)
    expect('iconSvg' in p).toBe(false)
    expect(withIconImage(p, 'https://x.test/a.png')).toBe(p)
  })
  it('the automatic icon without a pick: the title’s, else the category’s', () => {
    expect(autoIcon({ title: 'Pizza', icon: '🐝' })).toBe('🍕')
    expect(autoIcon({ title: 'Qwzx', category: 'travel' })).toBe('✈️')
    expect(sheetEmoji({ title: 'Pizza', icon: '🐝' })).toBe('🐝')
  })
})

describe('the AI’s other icons as pills', () => {
  it('while the icon is one of its answer for this title, the rest of it; picking one keeps the others', () => {
    const pick = aiPickOf('Sri Lanka bees', { emoji: '🇱🇰', alts: ['🐝', '🍯', '🇱🇰', 'nope'] })
    expect(pick).toEqual({ title: 'Sri Lanka bees', emojis: ['🇱🇰', '🐝', '🍯'] })
    expect(aiPickOf('x', { alts: ['🐝'] })).toBeNull()
    const f = withAutoPick({ title: 'Sri Lanka bees' }, { title: 'Sri Lanka bees', icon: '🇱🇰' })
    expect(itemAltsOffered(pick, f, false)).toEqual(['🐝', '🍯'])
    expect(itemAltsOffered(pick, withIcon(f, '🐝'), false)).toEqual(['🇱🇰', '🍯'])
    // not while asking again, not for another title, not once another icon or a drawing is chosen
    expect(itemAltsOffered(pick, f, true)).toEqual([])
    expect(itemAltsOffered(pick, withTitle(f, 'Sri Lanka'), false)).toEqual([])
    expect(itemAltsOffered(pick, withIcon(f, '🦄'), false)).toEqual([])
    expect(itemAltsOffered(pick, withIconSvg(f, SVG), false)).toEqual([])
    expect(itemAltsOffered(null, f, false)).toEqual([])
  })
})
