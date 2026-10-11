/**
 * The link a group's invite shares. With the sharer's first name as ?by=, the link preview
 * (functions/src/preview.ts) can say "Priya invited you to Goa trip"; the Join screen ignores it.
 */
export function inviteLink(origin: string, code: string, sharer?: string): string {
  const first = (sharer ?? '').trim().split(/\s+/)[0] ?? ''
  const url = `${origin}/join/${encodeURIComponent(code)}`
  return /^[\p{L}][\p{L}'’.-]{0,29}$/u.test(first) ? `${url}?by=${encodeURIComponent(first)}` : url
}
