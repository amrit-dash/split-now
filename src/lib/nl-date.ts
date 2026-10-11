import { addDaysISO } from './recents'

/*
 * Dates in a typed line: "lunch Oct 2 Cafe Blue", "cab 290 2nd Oct", "dinner on the 2nd", "chai 40
 * last fri", "02/10/2026". Shared by Quick add (src/lib/nl-expense.ts) and anything else that reads
 * a free-text line. Expenses are in the past, so a date without a year is its most recent
 * occurrence on or before today, "on the 2nd" is this month's 2nd (or last month's when that is
 * still ahead), and a weekday ("monday", "last fri", "on sat") is the most recent such day
 * strictly before today: someone who means today says "today". An explicit year is taken as
 * given, even when it is in the future. Numeric dates are day first (India, Australia) unless
 * `dayFirst` is false; "2/10" and "2-10" read as dates on their own, "2.10" only after "on"
 * (otherwise it is money), and "2-10 people" is a range, not a date. Impossible days (31 Feb,
 * 32 Oct) never match.
 */

export interface NlDateHit {
  /** local ISO YYYY-MM-DD */
  date: string
  /** the text without the date words, spaces tidied */
  rest: string
  /** where the date words were in the text, so a caller can cut them itself */
  index: number
  length: number
}

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const MONTH_INDEX = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** A month name as a whole word, for callers that need to know a number sits next to one. */
export const MONTH_WORD_RE = new RegExp(String.raw`^${MONTH}\.?$`, 'i')
const YEAR = String.raw`(199\d|20\d\d)`
const ORD = '(?:st|nd|rd|th)'
const ON = String.raw`(?:(?:on|dated)\s+)?`
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`
/** A real calendar day (no 31 Feb, no 32 Oct). */
export function isValidYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** The most recent day `m`/`d` on or before `today` (looking back far enough to find a 29 Feb). */
function lastOccurrence(m: number, d: number, today: string): string | undefined {
  const ty = Number(today.slice(0, 4))
  for (let y = ty; y >= ty - 8; y--) {
    if (!isValidYMD(y, m, d)) continue
    const s = iso(y, m, d)
    if (s <= today) return s
  }
  return undefined
}

function withYear(y: number | undefined, m: number, d: number, today: string): string | undefined {
  if (y === undefined) return lastOccurrence(m, d, today)
  return isValidYMD(y, m, d) ? iso(y, m, d) : undefined
}

const year2 = (s: string | undefined) => (s === undefined ? undefined : s.length === 2 ? 2000 + Number(s) : Number(s))
const monthOf = (s: string) => MONTH_INDEX.indexOf(s.slice(0, 3).toLowerCase()) + 1
const weekday = (isoDay: string) => {
  const [y, m, d] = isoDay.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

interface Rule {
  /** lower runs first; equal priorities go by position in the text */
  priority: number
  re: RegExp
  read: (m: RegExpExecArray, today: string, dayFirst: boolean) => string | undefined
}

const RULES: Rule[] = [
  // 2026-10-02, 2026/10/02
  {
    priority: 0,
    re: /(?<![\d./:-])(?:(?:on|dated)\s+)?(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?![\d]|[/.-]\d)/giu,
    read: (m) => withYear(Number(m[1]), Number(m[3]), Number(m[4]), ''),
  },
  // 02/10/2026, 2-10-26, 2.10.2026
  {
    priority: 1,
    re: /(?<![\p{L}\d./:,-])(?:(?:on|dated)\s+)?(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\d]|[/.-]\d)/giu,
    read: (m, today, dayFirst) => {
      const a = Number(m[1])
      const b = Number(m[3])
      return withYear(year2(m[4]), dayFirst ? b : a, dayFirst ? a : b, today)
    },
  },
  // 2 Oct, 2nd Oct, 2nd of October, the 2nd of Oct 2026, 2-Oct
  {
    priority: 2,
    re: new RegExp(
      String.raw`(?<![\p{L}\d.,:/₹$€£])${ON}(?:the\s+)?(\d{1,2})${ORD}?(?:\s*-\s*|\s+of\s+|\s*)${MONTH}(?![\p{L}])\.?(?:,?\s*${YEAR}(?!\d))?`,
      'giu',
    ),
    read: (m, today) => withYear(m[3] ? Number(m[3]) : undefined, monthOf(m[2]), Number(m[1]), today),
  },
  // Oct 2, October 2nd, Oct the 2nd, Oct 2, 2026
  {
    priority: 2,
    re: new RegExp(String.raw`(?<![\p{L}])${ON}${MONTH}(?![\p{L}])\.?\s*(?:the\s+)?(\d{1,2})${ORD}?(?![\p{L}\d:]|\.\d)(?:,?\s*${YEAR}(?!\d))?`, 'giu'),
    read: (m, today) => withYear(m[3] ? Number(m[3]) : undefined, monthOf(m[1]), Number(m[2]), today),
  },
  // the day before yesterday
  { priority: 3, re: /(?<![\p{L}])(?:the\s+)?day before yesterday(?![\p{L}])/giu, read: (_m, today) => addDaysISO(today, -2) },
  // 3 days ago, a week ago
  {
    priority: 3,
    re: /(?<![\p{L}\d])(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?)\s+ago(?![\p{L}])/giu,
    read: (m, today) => {
      const n = NUM_WORDS[m[1].toLowerCase()] ?? Number(m[1])
      return addDaysISO(today, -n * (/^w/i.test(m[2]) ? 7 : 1))
    },
  },
  // yesterday, kal (Hindi: yesterday here; the line is about money already spent), last night
  { priority: 4, re: /(?<![\p{L}])(?:yesterday|kal|last night)(?![\p{L}])/giu, read: (_m, today) => addDaysISO(today, -1) },
  { priority: 5, re: /(?<![\p{L}])(?:today|aaj|tonight|this morning)(?![\p{L}])/giu, read: (_m, today) => today },
  // monday, last fri, on sat (short forms only after a word, so "sat" and "sun" stay words)
  {
    priority: 6,
    re: /(?<![\p{L}])(?:(last|on|this|past|previous)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)(?![\p{L}])/giu,
    read: (m, today) => {
      const word = m[2].toLowerCase()
      if (!m[1] && word.length <= 4) return undefined
      const target = WEEKDAYS.indexOf(word.slice(0, 3))
      const back = (weekday(today) - target + 7) % 7 || 7
      return addDaysISO(today, -back)
    },
  },
  // 2/10, 2-10, on 2.10 (no year)
  {
    priority: 7,
    re: /(?<![\p{L}\d./:,₹$€£-])(?:(on|dated)\s+)?(\d{1,2})([/.-])(\d{1,2})(?![\d]|[/.-]\d)(?!\s*(?:-?\s*ways?|people|persons?|ppl|pax|of us|days?|hrs?|hours?|mins?|minutes?|times|x)(?![\p{L}]))/giu,
    read: (m, today, dayFirst) => {
      if (m[3] === '.' && !m[1]) return undefined
      const a = Number(m[2])
      const b = Number(m[4])
      return withYear(undefined, dayFirst ? b : a, dayFirst ? a : b, today)
    },
  },
  // on 2nd, on the 2nd, the 2nd
  {
    priority: 8,
    re: new RegExp(String.raw`(?<![\p{L}])(?:on\s+(?:the\s+)?|the\s+)(\d{1,2})${ORD}(?![\p{L}\d])`, 'giu'),
    read: (m, today) => {
      const d = Number(m[1])
      let [y, mo] = today.split('-').map(Number)
      for (let i = 0; i < 13; i++) {
        if (isValidYMD(y, mo, d) && iso(y, mo, d) <= today) return iso(y, mo, d)
        mo -= 1
        if (mo === 0) {
          mo = 12
          y -= 1
        }
      }
      return undefined
    },
  },
]

/**
 * The first date in `text` (by the order above), with its words cut out. `today` is a local ISO
 * day (todayISO()); null when the text names no date.
 */
export function parseNlDate(text: string, today: string, dayFirst = true): NlDateHit | null {
  let best: { priority: number; index: number; length: number; date: string } | undefined
  for (const rule of RULES) {
    if (best && rule.priority > best.priority) break
    for (const m of text.matchAll(rule.re)) {
      const date = rule.read(m, today, dayFirst)
      if (!date) continue
      if (!best || m.index < best.index) best = { priority: rule.priority, index: m.index, length: m[0].length, date }
      break
    }
  }
  if (!best) return null
  const rest = `${text.slice(0, best.index)} ${text.slice(best.index + best.length)}`.replace(/\s+/g, ' ').trim()
  return { date: best.date, rest, index: best.index, length: best.length }
}
