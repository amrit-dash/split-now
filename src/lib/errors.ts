/** A readable message from an Error: drops "FirebaseError:" prefixes and "(auth/…)" / "[400]" codes. */
export function errText(e: unknown, fallback = 'Something went wrong'): string {
  const m = (e instanceof Error ? e.message : typeof e === 'string' ? e : '')
    .replace(/^(Firebase(Error)?|Error):\s*/i, '')
    .replace(/\s*[([](?:[a-z-]+\/[a-z-]+|\d{3})[)\]]\.?\s*$/i, '')
    .trim()
  return m || fallback
}
