/*
 * How the admin console groups its switches and limits, so an admin sees which part of the app a
 * switch belongs to. Every flag and every limit sits in exactly one section (the tests check it),
 * so adding one without a section fails CI instead of quietly disappearing from the console.
 */

import { LIMIT_NAMES, type LimitName } from '../../shared/limits'
import { FLAG_NAMES, type FlagName } from './flags'

export interface Section<K extends string> {
  id: string
  title: string
  hint: string
  keys: readonly K[]
}

export const FLAG_SECTIONS: readonly Section<FlagName>[] = [
  {
    id: 'ai',
    title: 'AI',
    hint: 'What Gemini reads for people. Who may use Split Now’s key, and its limits, are in the AI tab.',
    keys: ['aiImages', 'aiSms', 'aiQuickAdd', 'chatAi', 'aiPayments', 'aiIcons', 'aiIconAuto'],
  },
  {
    id: 'expenses',
    title: 'Adding expenses',
    hint: 'The expense form and the + button.',
    keys: ['quickAdd', 'moneyReceived', 'duplicates', 'merchantMemory', 'whoseTurn'],
  },
  { id: 'groups', title: 'Groups', hint: 'What a group offers besides its expenses.', keys: ['groupChat', 'openItems', 'liveTables', 'vaults'] },
  {
    id: 'payments',
    title: 'Payments and reminders',
    hint: 'Getting paid back, and the pushes about it.',
    keys: ['payLinks', 'nudges', 'budgetAlerts', 'pushPrompt'],
  },
  { id: 'capture', title: 'Capture and import', hint: 'Payments that come in from outside the app.', keys: ['autoCapture', 'statementImport'] },
  { id: 'app', title: 'The app', hint: 'Banners about the app itself.', keys: ['whatsNew'] },
]

export const LIMIT_SECTIONS: readonly Section<LimitName>[] = [
  { id: 'capture', title: 'Auto-capture', hint: 'Per capture key.', keys: ['capturePerHour', 'capturePerDay', 'captureKeepDays'] },
  {
    id: 'ai',
    title: 'AI on people’s own keys',
    hint: 'Split Now’s shared key has its own limits in the AI tab.',
    keys: ['aiOwnPerHour', 'aiOwnPerDay', 'proofChecksPerHour', 'proofChecksPerDay'],
  },
  { id: 'nudges', title: 'Nudges', hint: 'The push next to Remind.', keys: ['nudgePerDay'] },
  { id: 'fx', title: 'Exchange rates', hint: 'The Refresh button next to a currency.', keys: ['fxPerUserPerHour', 'fxPerUserPerDay'] },
  { id: 'logs', title: 'Logs', hint: 'Admin → Logs.', keys: ['appErrorKeepDays'] },
]

/** "3 of 4 on" for a section's header. */
export function onCount(flags: Record<FlagName, boolean>, keys: readonly FlagName[]): string {
  const on = keys.filter((k) => flags[k] !== false).length
  return on === keys.length ? (keys.length === 1 ? 'On' : 'All on') : on === 0 ? (keys.length === 1 ? 'Off' : 'All off') : `${on} of ${keys.length} on`
}

/** Names that are missing from every section, or in more than one (should be none). */
export function sectionGaps<K extends string>(all: readonly K[], sections: readonly Section<K>[]): { missing: K[]; twice: K[] } {
  const seen = new Map<K, number>()
  for (const s of sections) for (const k of s.keys) seen.set(k, (seen.get(k) ?? 0) + 1)
  return { missing: all.filter((k) => !seen.has(k)), twice: all.filter((k) => (seen.get(k) ?? 0) > 1) }
}

export const FLAG_GAPS = () => sectionGaps(FLAG_NAMES, FLAG_SECTIONS)
export const LIMIT_GAPS = () => sectionGaps(LIMIT_NAMES, LIMIT_SECTIONS)
