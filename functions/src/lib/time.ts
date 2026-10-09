import { TIME_ZONE } from '../config'

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** yyyy-mm-dd of an instant in India (Asia/Kolkata). */
export function istDate(d: Date): string {
  return fmt.format(d)
}

/** An ISO-ish timestamp from an automation, or undefined if it isn't one. */
export function parseInstant(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Add days to a yyyy-mm-dd date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The transaction date: the one in the SMS if it's plausible (within 60 days before and a year
 * after the day it was received — the setup wizard's test SMS for an upcoming trip is dated
 * inside the trip), else the received date, else today, all in IST.
 */
export function transactionDate(smsDate: string | undefined, receivedAt: Date | undefined, now: Date): string {
  const received = istDate(receivedAt && receivedAt.getTime() <= now.getTime() + 86_400_000 ? receivedAt : now)
  if (smsDate && smsDate <= addDays(received, 366) && smsDate >= addDays(received, -60)) return smsDate
  return received
}
