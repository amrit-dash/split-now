import type { Expense, Group, MemberId, Settlement } from '@/types'
import { CATEGORIES } from './categories'
import { minorDigits } from './money'

/**
 * CSV export of a group's expenses and settlements.
 *
 * One row per expense or settlement, oldest first. Each member gets a share column holding
 * what that row costs them. A settlement "from → to" is written like an expense paid by
 * `from` and owed entirely by `to`, which is exactly how it moves balances, so
 * paid − shares summed over all rows reproduces everyone's net balance.
 */

/** RFC 4180 field escaping, plus a guard against spreadsheet formula injection for text. */
export function csvField(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return ''
  let s = String(v)
  // A cell starting with = + - @ (or tab/CR) is run as a formula by Excel/Sheets.
  // Plain numbers like "-5.00" are safe and stay numeric.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Array<Array<string | number | undefined>>): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}

/** Minor units → "12.34" / "-0.05" ("1200" for JPY). Exact, no float formatting. */
export function centsToDecimal(c: number, currency?: string): string {
  const d = minorDigits(currency)
  const sign = c < 0 ? '-' : ''
  const a = Math.abs(Math.round(c))
  if (d === 0) return `${sign}${a}`
  const f = 10 ** d
  return `${sign}${Math.floor(a / f)}.${String(a % f).padStart(d, '0')}`
}

export function groupCsv(group: Pick<Group, 'members' | 'currency'>, expenses: Expense[], settlements: Settlement[]): string {
  // Columns for current members (by name) plus anyone still referenced who has left.
  const ids: MemberId[] = Object.keys(group.members).sort((a, b) => group.members[a].name.localeCompare(group.members[b].name) || a.localeCompare(b))
  const extra = new Set<MemberId>()
  for (const e of expenses) for (const id of [...Object.keys(e.paidBy), ...Object.keys(e.splits)]) if (!group.members[id]) extra.add(id)
  for (const s of settlements) for (const id of [s.from, s.to]) if (!group.members[id]) extra.add(id)
  ids.push(...[...extra].sort())

  const names = new Map<MemberId, string>()
  const seen = new Map<string, number>()
  for (const id of ids) {
    const base = group.members[id]?.name ?? `Former member (${id})`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    names.set(id, n > 1 ? `${base} (${n})` : base)
  }
  const name = (id: MemberId) => names.get(id) ?? id

  type Row = { date: string; createdAt: number; cells: Array<string | number | undefined> }
  const rows: Row[] = []
  const dec = (c: number) => centsToDecimal(c, group.currency)
  const amount = (c: number | undefined) => (c ? dec(c) : undefined)
  const paidBy = (p: Record<MemberId, number>) => {
    const entries = Object.entries(p).filter(([, v]) => v)
    return entries.length === 1 ? name(entries[0][0]) : entries.map(([id, v]) => `${name(id)} ${dec(v)}`).join('; ')
  }

  for (const e of expenses) {
    rows.push({
      date: e.date, createdAt: e.createdAt,
      cells: [e.date, 'Expense', e.description, CATEGORIES[e.category]?.label ?? e.category, dec(e.amount), group.currency,
        paidBy(e.paidBy), ...ids.map((id) => amount(e.splits[id])), e.notes],
    })
  }
  for (const s of settlements) {
    rows.push({
      date: s.date, createdAt: s.createdAt,
      cells: [s.date, 'Payment', `${name(s.from)} paid ${name(s.to)}`, s.method || 'Payment', dec(s.amount), group.currency,
        name(s.from), ...ids.map((id) => (id === s.to ? dec(s.amount) : undefined)), s.note],
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)

  const header = ['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Paid by', ...ids.map(name), 'Notes']
  return toCsv([header, ...rows.map((r) => r.cells)])
}

export function csvFilename(groupName: string, today: string): string {
  const slug = groupName.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase() || 'group'
  return `split-now-${slug}-${today}.csv`
}

/**
 * Hand the CSV to the user: the native share sheet with a file on touch devices that
 * support it (so it can go straight to Files, Drive, Mail…), otherwise a download.
 */
export async function deliverCsv(filename: string, csv: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  // BOM so Excel opens UTF-8 (emoji, accents) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (touch && typeof File === 'function' && navigator.canShare) {
    const file = new File([blob], filename, { type: 'text/csv' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
        return 'shared'
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return 'cancelled'
        // Fall through to a plain download.
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
