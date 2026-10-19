import { ICON_TITLE_MAX, type IconPickRequest, type IconPickResponse, PICK_ALTS } from '../../shared/icon-ai'
import { CATEGORIES } from './categories'
import { ALL_GROUP_ICONS, isGroupType, SHARED_TYPES } from './groupTypes'
import { ICONS, isIcon } from './icons'
import type { Category, GroupType } from '@/types'

/*
 * The automatic icon's AI fallback (functions/src/ai.ts iconPickAi). The app's own rules
 * (src/lib/icons.ts) go first and cost nothing; only when they find no icon for a title, and the
 * person typed enough, does the app ask the AI for the emoji that fits best, from its own
 * catalogue when one does and any other emoji when none does, plus a second to offer (and the
 * category or group type, while those are still the app's to choose). One short answer, so it
 * works on Split Now's free AI too. Never in a private group: its titles don't leave the phone.
 */

/** How long typing has to pause before the app asks: one question per title, not per letter. */
export const AUTO_PICK_MS = 1200

/** Shorter titles ("ab") say too little to choose from. */
export const AUTO_PICK_MIN = 3

/** The title to ask about, or null when there is nothing to ask: the rules found an icon, one was chosen, or it's too short. */
export function autoPickTitle(o: { title: string; offered: boolean; need: boolean }): string | null {
  if (!o.offered || !o.need) return null
  const t = o.title.replace(/\s+/g, ' ').trim().slice(0, ICON_TITLE_MAX)
  return t.length >= AUTO_PICK_MIN ? t : null
}

/** Every emoji the catalogue has, once each, in its order: what an expense's pick chooses from. */
export const EXPENSE_CHOICES: string[] = [...new Set(ICONS.map((e) => e.emoji))]

/** An expense's question: the catalogue, and the categories too while the category is still the app's guess of "Other". */
export function expensePickRequest(title: string, o: { category: Category; catTouched: boolean }): IconPickRequest {
  return {
    title,
    kind: 'expense',
    choices: EXPENSE_CHOICES,
    ...(!o.catTouched && o.category === 'other' ? { categories: Object.keys(CATEGORIES).filter((c) => c !== 'other') } : {}),
  }
}

/** A group's question: every group icon, and the shared types while the type wasn't chosen. */
export function groupPickRequest(name: string, o: { typeTouched: boolean }): IconPickRequest {
  return { title: name, kind: 'group', choices: ALL_GROUP_ICONS, ...(o.typeTouched ? {} : { types: SHARED_TYPES.filter((t) => t !== 'other') }) }
}

/**
 * What an answer gives the form: one emoji (the app's own or any other, as the AI chose) and up
 * to three different ones to offer beside it; a category or type only from the lists sent; nothing
 * from a refusal.
 */
export function pickAnswer(
  r: IconPickResponse | null,
  req: IconPickRequest,
): { emoji?: string; alts?: string[]; category?: Category; type?: GroupType } | null {
  if (!r || 'unavailable' in r) return null
  const emoji = isIcon(r.emoji) ? r.emoji : undefined
  // Several others to offer (a server from before sends one, as `alt`): each an icon, none the pick, none twice.
  const offered = r.alts ?? (r.alt ? [r.alt] : [])
  const alts = emoji ? [...new Set(offered.filter((a) => isIcon(a) && a !== emoji))].slice(0, PICK_ALTS) : []
  const category = r.category && req.categories?.includes(r.category) ? (r.category as Category) : undefined
  const type = r.type && req.types?.includes(r.type) && isGroupType(r.type) ? r.type : undefined
  return { emoji, ...(alts.length ? { alts } : {}), category, type }
}
