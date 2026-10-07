export function uid(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return prefix + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)
}

/** Human-friendly invite code, no ambiguous characters. 8 chars (~8.5e11 codes) so guessing or colliding is impractical. */
export function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
