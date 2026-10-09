/*
 * Tiny text helpers with no dependencies, so screens on the first paint (Quick add on Home) can
 * use them without pulling in the expense form's state machine.
 */

/** "TOIT brewpub" → "Toit Brewpub"; works for accented and non-Latin letters too (unlike \b\w). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(\-/&])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
}
