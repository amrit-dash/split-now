import type { Expense, Recurrence, RecurrenceFreq } from '@/types'

/**
 * Recurring expenses without a server.
 *
 * A *template* expense carries `recurrence`. Whenever a member opens the group, the client
 * asks `dueOccurrences(template, today)` which dates are due, writes one copy per date with
 * a deterministic id (`occurrenceId`), and advances `recurrence.nextDate`. Two clients
 * catching up at the same moment write the same ids, so nothing is duplicated.
 *
 * Occurrence dates are always computed from the template's own `date` (the anchor), never
 * from the previous occurrence, so month-end clamping doesn't drift:
 * Jan 31 → Feb 28 (29 in leap years) → Mar 31 → Apr 30 …
 */

export const FREQ_LABEL: Record<RecurrenceFreq, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/** Upper bound on occurrences created in one catch-up (e.g. a weekly bill left for years). */
export const MAX_CATCH_UP = 120

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(iso: string): [number, number, number] {
  const m = ISO.exec(iso)
  if (!m) throw new Error(`Invalid date: ${iso}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const fmt = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`

export function daysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso)
  const idx = y * 12 + (m - 1) + months
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** The n-th occurrence (n = 0 is the anchor itself). */
export function nthOccurrence(anchor: string, freq: RecurrenceFreq, n: number): string {
  switch (freq) {
    case 'weekly':
      return addDays(anchor, 7 * n)
    case 'fortnightly':
      return addDays(anchor, 14 * n)
    case 'monthly':
      return addMonths(anchor, n)
    case 'yearly':
      return addMonths(anchor, 12 * n)
  }
}

/** The first occurrence after the anchor, i.e. the initial `nextDate` for a new template. */
export function firstNextDate(anchor: string, freq: RecurrenceFreq): string {
  return nthOccurrence(anchor, freq, 1)
}

/** The first occurrence after the anchor (n >= 1) that falls strictly after `after`. */
export function nextAfter(anchor: string, freq: RecurrenceFreq, after: string): string {
  let n = 1
  let d = nthOccurrence(anchor, freq, n)
  while (d <= after && n < 100_000) d = nthOccurrence(anchor, freq, ++n)
  return d
}

export interface DueResult {
  /** Dates (yyyy-mm-dd, ascending) that should exist as occurrences now. */
  dates: string[]
  /**
   * The template's new recurrence after catching up: `nextDate` advanced past `today`,
   * or `undefined` when the series has ended (past `until`).
   * Equal to the input recurrence when nothing changed.
   */
  recurrence: Recurrence | undefined
  /** True when `recurrence` differs from the template's current value. */
  changed: boolean
}

/**
 * Pure: which occurrences of `template` are due on or before `today`, and what the
 * template's recurrence should become afterwards.
 */
export function dueOccurrences(template: Pick<Expense, 'date' | 'recurrence'>, today: string): DueResult {
  const r = template.recurrence
  if (!r) return { dates: [], recurrence: undefined, changed: false }
  const anchor = template.date

  // Find the occurrence index that nextDate points at. nextDate normally lands exactly on
  // an occurrence; if it was hand-edited, resume at the first occurrence on/after it.
  let n = 1
  while (nthOccurrence(anchor, r.freq, n) < r.nextDate && n < 100_000) n++

  const dates: string[] = []
  let next = nthOccurrence(anchor, r.freq, n)
  while (next <= today && (!r.until || next <= r.until) && dates.length < MAX_CATCH_UP) {
    dates.push(next)
    n++
    next = nthOccurrence(anchor, r.freq, n)
  }

  if (r.until && next > r.until) {
    return { dates, recurrence: undefined, changed: true }
  }
  const recurrence: Recurrence = { ...r, nextDate: next }
  return { dates, recurrence, changed: next !== r.nextDate }
}

export function occurrenceId(templateId: string, date: string): string {
  return `${templateId}_${date}`
}

/**
 * Build the concrete expense for one occurrence of a template. The receipt (URL and Storage
 * path) belongs to the template: a copy carrying the path would delete the template's image
 * when purged or when a photo is attached to it.
 */
export function makeOccurrence(template: Expense, date: string, now = Date.now()): Expense {
  const { recurrence: _r, receiptUrl: _receipt, receiptPath: _path, ...rest } = template
  return {
    ...rest,
    id: occurrenceId(template.id, date),
    date,
    recurringFrom: template.id,
    createdAt: now,
    updatedAt: now,
  }
}

/** Everything a client needs to write to catch a template up, or null if nothing is due. */
export function planCatchUp(template: Expense, today: string, now = Date.now()): { occurrences: Expense[]; template: Expense } | null {
  const due = dueOccurrences(template, today)
  if (!due.dates.length && !due.changed) return null
  return {
    occurrences: due.dates.map((d) => makeOccurrence(template, d, now)),
    template: { ...template, recurrence: due.recurrence },
  }
}
