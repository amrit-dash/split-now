/*
 * Numbers said in words, as speech-to-text writes them ("twelve hundred", "two thousand five
 * hundred", "a thousand", "three lakh", "fifteen hundred and fifty"), turned into digits so the
 * Quick add reader (src/lib/nl-expense.ts) finds the amount. Only runs of number words that make a
 * whole number; "one" or "a" on their own stay words ("one coffee", "a cab"). Pure.
 */

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, lakh: 100_000, lakhs: 100_000, lac: 100_000, crore: 10_000_000, crores: 10_000_000 }

const isNumWord = (w: string) => w in UNITS || w in TENS || w in SCALES || w === 'a' || w === 'and'

/** The value of a run of number words, or null when it isn't one whole number ("a" alone, "and" alone). */
function numberOf(words: string[]): number | null {
  let total = 0
  let current = 0
  let any = false
  let scaled = false
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w === 'and') continue
    if (w === 'a') {
      // "a thousand", "a hundred": only before a scale
      if (!(words[i + 1] in SCALES)) return null
      current = 1
      continue
    }
    if (w in UNITS) {
      current += UNITS[w]
      any = true
    } else if (w in TENS) {
      current += TENS[w]
      any = true
    } else if (w in SCALES) {
      // "1 lakh", "lakh" alone: a scale needs a number word (or "a") before it here
      if (!current && !total) return null
      const s = SCALES[w]
      if (s === 100) current = (current || 1) * 100
      else {
        total += (current || 1) * s
        current = 0
      }
      any = true
      scaled = true
    }
  }
  const n = total + current
  // A bare small number ("one", "two") is usually a count of things, not money: left as words.
  if (!any || (!scaled && n < 20)) return null
  return n
}

/** The line with each spoken amount written in digits ("twelve hundred for dinner" → "1200 for dinner"). */
export function spokenNumbers(text: string): string {
  const parts = text.split(/(\s+|[,.;!?])/)
  const out: string[] = []
  let i = 0
  while (i < parts.length) {
    const w = parts[i].toLowerCase()
    if (!isNumWord(w) || w === 'and') {
      out.push(parts[i])
      i++
      continue
    }
    // the longest run of number words (spaces between, "and" inside)
    const run: string[] = []
    let j = i
    let lastWord = i
    while (j < parts.length) {
      const p = parts[j]
      if (/^\s+$/.test(p) || p === '') {
        j++
        continue
      }
      const lw = p.toLowerCase()
      if (!isNumWord(lw)) break
      run.push(lw)
      lastWord = j
      j++
    }
    // a trailing "and" belongs to the sentence ("two thousand and Rahul paid")
    while (run.at(-1) === 'and') {
      run.pop()
      lastWord--
      while (lastWord > i && (/^\s+$/.test(parts[lastWord]) || parts[lastWord] === '')) lastWord--
    }
    const v = run.length ? numberOf(run) : null
    if (v === null) {
      out.push(parts[i])
      i++
      continue
    }
    out.push(String(v))
    i = lastWord + 1
  }
  return out.join('')
}
