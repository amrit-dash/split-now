import type { Category } from '@/types'
import { CATEGORIES, guessCategory } from './categories'
import { pastCategory, type Suggestion } from './recents'

/*
 * Merchant memory: the categories a user picked by hand, remembered across groups so the
 * second "Blue Tokai" is filed under Food without a tap. Stored per user at
 * users/{uid}/settings/merchants (owner only; demo mode keeps it in localStorage) as two small
 * maps keyed by the normalised merchant: the category, and when it was last used, so the memory
 * can stay under MERCHANT_CAP entries by dropping the least recently used.
 */

export const MERCHANT_CAP = 200
const MAX_KEY = 60

export interface MerchantMemory {
  categories: Record<string, Category>
  /** normalised merchant → epoch ms of the last save that used it */
  touched: Record<string, number>
}

export const EMPTY_MEMORY: MerchantMemory = { categories: {}, touched: {} }

/** "SWIGGY*INSTAMART 4521" → "swiggy instamart": letters only, lower-cased, no accents, no reference numbers. */
export function normaliseMerchant(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !/^\d+$/.test(w))
    .join(' ')
    .trim()
    .slice(0, MAX_KEY)
    .trim()
}

const isCategory = (v: unknown): v is Category => typeof v === 'string' && v in CATEGORIES

/** A stored document → a clean memory (bad keys, unknown categories and junk dropped). */
export function parseMemory(raw: unknown): MerchantMemory {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { categories?: unknown; touched?: unknown }
  const cats = (r.categories && typeof r.categories === 'object' ? r.categories : {}) as Record<string, unknown>
  const touch = (r.touched && typeof r.touched === 'object' ? r.touched : {}) as Record<string, unknown>
  const out: MerchantMemory = { categories: {}, touched: {} }
  for (const [k, v] of Object.entries(cats)) {
    if (!k || k.length > MAX_KEY || !isCategory(v)) continue
    out.categories[k] = v
    const t = touch[k]
    out.touched[k] = typeof t === 'number' && Number.isFinite(t) ? t : 0
  }
  return trim(out)
}

/** Keeps the MERCHANT_CAP most recently used entries. */
function trim(m: MerchantMemory): MerchantMemory {
  const keys = Object.keys(m.categories)
  if (keys.length <= MERCHANT_CAP) return m
  const keep = new Set(keys.sort((a, b) => (m.touched[b] ?? 0) - (m.touched[a] ?? 0)).slice(0, MERCHANT_CAP))
  return {
    categories: Object.fromEntries(Object.entries(m.categories).filter(([k]) => keep.has(k))),
    touched: Object.fromEntries(Object.entries(m.touched).filter(([k]) => keep.has(k))),
  }
}

export const isEmptyMemory = (m: MerchantMemory | null | undefined) => !m || Object.keys(m.categories).length === 0

export function recallCategory(m: MerchantMemory | null | undefined, merchant: string): Category | undefined {
  if (!m) return undefined
  const k = normaliseMerchant(merchant)
  return k ? m.categories[k] : undefined
}

/** The memory with this merchant filed under `category` (and touched now). The same object when nothing changes. */
export function rememberMerchant(m: MerchantMemory, merchant: string, category: Category, now = Date.now()): MerchantMemory {
  const k = normaliseMerchant(merchant)
  if (!k) return m
  if (m.categories[k] === category && m.touched[k] === now) return m
  return trim({ categories: { ...m.categories, [k]: category }, touched: { ...m.touched, [k]: now } })
}

export function forgetMerchant(m: MerchantMemory, merchant: string): MerchantMemory {
  const k = normaliseMerchant(merchant)
  if (!k || !(k in m.categories)) return m
  const { [k]: _c, ...categories } = m.categories
  const { [k]: _t, ...touched } = m.touched
  return { categories, touched }
}

/**
 * The category to suggest for a description: what the user taught the app (memory) first, then
 * what this group filed exactly this description under, then the keyword guess.
 */
export function suggestCategory(description: string, opts: { memory?: MerchantMemory | null; history?: Suggestion[] } = {}): Category | null {
  if (!description.trim()) return null
  return recallCategory(opts.memory, description) ?? pastCategory(opts.history ?? [], description) ?? guessCategory(description)
}

/**
 * After a save: when the chosen category differs from what would have been suggested, the
 * user corrected it, so the merchant is remembered under their choice. Returns the memory to
 * store, or null when there is nothing new to learn.
 */
export function learnFromSave(m: MerchantMemory, description: string, chosen: Category, suggested: Category | null, now = Date.now()): MerchantMemory | null {
  if (!description.trim() || chosen === suggested) return null
  const next = rememberMerchant(m, description, chosen, now)
  return next === m ? null : next
}
