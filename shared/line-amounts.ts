/*
 * The amounts a Quick add line actually says, so an AI's answer is checked against the words
 * (functions/src/lib/quick-ai.ts): a small model (Gemma) dropped or changed plain amounts ("groceries
 * 640" came back as 420, "dinner 1200 with Rahul" with none; eval, 24 Oct 2026). Digits with commas
 * or decimals, "2k" / "1.2k", "1 lakh". Not a date ("3rd", "2 Oct"), a time ("10:30"), a percent,
 * a ratio ("60/40", "2x3") or a count of shares or ways. Pure; no Firebase, no DOM.
 */

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december'

/** Each amount in the line, as a plain number in the currency ("1,200.50" → 1200.5, "2k" → 2000). */
export function lineAmounts(text: string): number[] {
  const t = text.toLowerCase()
  const out: number[] = []
  const re = /(?<![\w.:/x])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?\s*(k\b|lakh\b|lakhs\b|lac\b)?/g
  for (const m of t.matchAll(re)) {
    const at = m.index ?? 0
    const after = t.slice(at + m[0].length)
    const before = t.slice(Math.max(0, at - 12), at)
    // a date, a time, a percent, a ratio, a count
    if (/^(?:st|nd|rd|th)\b/.test(after)) continue
    if (/^\s*(?:%|percent|shares?\b|ways?\b|people\b|persons?\b|x\s*\d|:\d|\/\d|-\d{1,2}\b|to\s+\d{1,2}\b)/.test(after)) continue
    if (new RegExp(`^\\s*(?:${MONTHS})\\b`).test(after) || new RegExp(`(?:${MONTHS})\\s*$`).test(before)) continue
    if (/(?:\d\s*(?:x|:|\/|to)\s*)$/.test(before)) continue
    let v = Number(m[1].replace(/,/g, ''))
    if (m[2]) v += Number(m[2].padEnd(2, '0')) / 100
    if (m[3] === 'k') v *= 1000
    else if (m[3]) v *= 100_000
    if (v > 0) out.push(v)
  }
  return out
}

/**
 * The amount to keep from an AI's answer: its own when the line says it (or when the line says
 * none, or several and it may have added them up, "500 each" for three); the line's single amount
 * when the AI dropped it or changed it.
 */
export function groundedAmount(aiAmount: number | undefined, text: string): number | undefined {
  const said = lineAmounts(text)
  if (aiAmount !== undefined && said.some((v) => Math.abs(v - aiAmount) < 0.005)) return aiAmount
  if (said.length === 1 && !/\beach\b|\bper\s+(?:head|person)\b/i.test(text)) return said[0]
  return aiAmount
}
