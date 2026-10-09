export function uid(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return (
    prefix +
    Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 16)
  )
}

/** Human-friendly invite code, no ambiguous characters. 8 chars (~8.5e11 codes) so guessing or colliding is impractical. */
export function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/**
 * The calendar day of `d` on this device (yyyy-mm-dd). Dates in the app are *local* calendar
 * days (an expense dated "today" is today where the user is), so every "today" goes through
 * here rather than toISOString(), which gives the UTC day and is off by one in the evening
 * west of UTC / the small hours east of it.
 */
export function localISODate(d: Date | number): string {
  const t = typeof d === 'number' ? new Date(d) : d
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(t.getFullYear()).padStart(4, '0')}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

/** Today as a local calendar day. The one "today" for the whole app (expense dates, recurrence, FX, trip windows). */
export function todayISO(now: Date | number = new Date()) {
  return localISODate(now)
}
