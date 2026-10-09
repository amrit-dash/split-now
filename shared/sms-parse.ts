/*
 * Indian bank / UPI / card transaction SMS parser.
 *
 * Pure and dependency-free: it is bundled into Cloud Functions (functions/, via esbuild) and
 * re-exported for the client from src/lib/sms-parse.ts. Do not import anything here.
 *
 * parseBankSms() classifies a message (debit, credit, OTP, balance alert, promo, failed /
 * declined / reversed transaction, collect request, due-date reminder, self transfer such as a
 * UPI Lite top-up) and, for debits, pulls out the amount (minor units), currency, merchant, bank
 * reference, date and account suffix.
 */

export type SmsKind = 'debit' | 'credit' | 'otp' | 'balance' | 'promo' | 'failed' | 'request' | 'reminder' | 'transfer' | 'unknown'
export type SmsMethod = 'upi' | 'card' | 'imps' | 'neft' | 'atm' | 'other'

export interface ParsedSms {
  kind: SmsKind
  /** minor units of `currency` (paise for INR) */
  amount?: number
  /** ISO 4217, INR unless the message names another currency */
  currency: string
  /** cleaned, title-cased payee */
  merchant?: string
  /** the payee's UPI id, when the message has one */
  vpa?: string
  /** bank / UPI reference number (digits and letters only) */
  ref?: string
  /** transaction date from the message, yyyy-mm-dd */
  date?: string
  /** last digits of the account or card (never more than 4-6 digits) */
  account?: string
  bank?: string
  method?: SmsMethod
}

// ---- Amounts -----------------------------------------------------------

const FOREIGN = 'USD|EUR|GBP|AED|SGD|THB|AUD|JPY|MYR|LKR|NPR|CAD|CHF|HKD|QAR|SAR|NZD|IDR|VND|KRW|CNY|BDT|OMR|KWD|BHD'
const NUM = '[0-9][0-9,]*(?:\\.[0-9]{1,2})?'
const AMOUNT_RE = new RegExp(`(₹|\\bINR|\\bRs(?![a-z])\\.?|\\b(?:${FOREIGN})\\b)\\s*\\.?\\s*(${NUM})`, 'gi')
/** Amount written before the currency: "25.00 USD", "250.00 INR". */
const AMOUNT_AFTER_RE = new RegExp(`(?<![\\d.,])(${NUM})\\s*(INR|Rs\\.?|${FOREIGN})\\b`, 'gi')
/** SBI-style "debited by 250.0" with no currency marker. */
const BARE_AMOUNT_RE = new RegExp(`\\b(?:debited|deducted|spent|withdrawn|sent|paid|charged)\\s+(?:by|for|with|of|amount)?\\s*(${NUM})\\b`, 'i')
/** Amounts that are a balance / limit / due figure rather than the transaction. */
const NOT_TXN_BEFORE = /(?:bal(?:ance)?|lmt|limit|avl|available|outstanding|due|min(?:imum)?|cashback|reward|o\/s|credit limit)\b[^0-9]{0,12}$/i

const digitsCache = new Map<string, number>()
/** Decimal places of a currency's minor unit (from Intl, like src/lib/money.ts). */
export function minorDigitsOf(currency: string): number {
  let d = digitsCache.get(currency)
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      d = 2
    }
    digitsCache.set(currency, d)
  }
  return d
}

/** "1,00,000.00" / "1,999" / "250.0" → minor units of `currency`, or NaN. Indian (lakh) grouping is fine. */
export function parseAmountMinor(raw: string, currency = 'INR'): number {
  const t = raw.replace(/[^\d.,]/g, '').replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN
  const v = Math.round(Number(t) * 10 ** minorDigitsOf(currency))
  return Number.isFinite(v) && v > 0 ? v : NaN
}

function currencyOf(marker: string): string {
  const m = marker.replace(/[.\s]/g, '').toUpperCase()
  return m === '₹' || m === 'RS' || m === 'INR' ? 'INR' : m
}

/** The transaction amount: the first currency-tagged amount that isn't a balance or limit. */
function findAmount(text: string): { amount: number; currency: string } | undefined {
  for (const m of text.matchAll(AMOUNT_RE)) {
    const before = text.slice(Math.max(0, m.index - 30), m.index)
    if (NOT_TXN_BEFORE.test(before)) continue
    const currency = currencyOf(m[1])
    const amount = parseAmountMinor(m[2], currency)
    if (Number.isFinite(amount)) return { amount, currency }
  }
  for (const m of text.matchAll(AMOUNT_AFTER_RE)) {
    const before = text.slice(Math.max(0, m.index - 30), m.index)
    if (NOT_TXN_BEFORE.test(before)) continue
    const currency = currencyOf(m[2])
    const amount = parseAmountMinor(m[1], currency)
    if (Number.isFinite(amount)) return { amount, currency }
  }
  const bare = text.match(BARE_AMOUNT_RE)
  if (bare) {
    const amount = parseAmountMinor(bare[1], 'INR')
    if (Number.isFinite(amount)) return { amount, currency: 'INR' }
  }
  return undefined
}

// ---- Dates -------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*'

function ymd(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return undefined
  return dt.toISOString().slice(0, 10)
}

const DATE_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string | undefined]> = [
  [/\b(20\d{2})-(\d{2})-(\d{2})\b/, (m) => ymd(+m[1], +m[2], +m[3])],
  // dd-mm-yy, dd/mm/yyyy, dd.mm.yy (Indian order). Not part of an amount or a longer number.
  [/(?<![\d,.₹])\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b(?![.,]?\d)/, (m) => ymd(+m[3], +m[2], +m[1])],
  // 07Oct26, 07-Oct-26, 07 Oct 2026, 07-OCT-2026
  [new RegExp(`\\b(\\d{1,2})[- ]?${MON}[-, ]*(\\d{4}|\\d{2})\\b`, 'i'), (m) => ymd(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1])],
  // Oct 07, 2026
  [new RegExp(`\\b${MON} (\\d{1,2}),? (\\d{4})\\b`, 'i'), (m) => ymd(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2])],
]

/** First valid transaction date in the message, yyyy-mm-dd. */
export function findSmsDate(text: string): string | undefined {
  let best: { at: number; date: string } | undefined
  for (const [re, toDate] of DATE_PATTERNS) {
    const m = text.match(re)
    const date = m && toDate(m)
    if (m && date && (!best || m.index! < best.at)) best = { at: m.index!, date }
  }
  return best?.date
}

// ---- Reference, account, bank -----------------------------------------

const REF_RE =
  /\b(?:UPI\s*Ref(?:erence)?(?:\s*No\.?|\s*number|\s*ID)?|UPI\s*txn\s*(?:id|no\.?)?|IMPS\s*Ref(?:\s*No\.?)?|Ref(?:erence)?\s*(?:No\.?|Number|ID|#)?|Refno|RRN|UTR(?:\s*No\.?)?|Txn\s*(?:ID|No\.?|#)|Transaction\s*(?:ID|No\.?)|UPI)\s*[:.#-]?\s*(?:is\s*)?([A-Z0-9]{6,22})\b/gi

export function findRef(text: string): string | undefined {
  const p2m = text.match(/\bUPI\/(?:P2[AM]\/|CR\/|DR\/)?(\d{9,16})\//i)
  if (p2m) return p2m[1]
  for (const m of text.matchAll(REF_RE)) {
    if ((m[1].match(/\d/g) ?? []).length >= 6) return m[1].toUpperCase()
  }
  return undefined
}

const ACCOUNT_RE = /\b(?:a\/c|ac|acct|account|card|cc)\b\.?(?:\s*no\.?)?(?:\s*ending\s*(?:with|in)?)?\s*(?:[x*]+\s?)?(\d{3,6})\b|\b[x*]{1,}(\d{3,6})\b/i
const ACCOUNT_REF_RE =
  /\b(?:a\/c|ac|acct|account|card|cc)\b\.?(?:\s*no\.?)?(?:\s*ending\s*(?:with|in)?)?\s*[x*]+\s?\d{3,6}\b|\b(?:xx|\*{2,}|x\*)\d{3,6}\b|\b(?:a\/c|acct)\b/i

function findAccount(text: string): string | undefined {
  const m = text.match(ACCOUNT_RE)
  const d = m?.[1] ?? m?.[2]
  return d ? d.slice(-4) : undefined
}

const BANK_SENDERS: Array<[RegExp, string]> = [
  [/SBICRD|SBICARD/i, 'SBI Card'],
  [/AMEX/i, 'American Express'],
  [/CANBNK|CANARA/i, 'Canara Bank'],
  [/UNIONB|UBOI/i, 'Union Bank'],
  [/INDBNK/i, 'Indian Bank'],
  [/BOIIND/i, 'Bank of India'],
  [/IOBCHN|IOBNET/i, 'Indian Overseas Bank'],
  [/CENTBK/i, 'Central Bank of India'],
  [/UCOBNK|UCOBK/i, 'UCO Bank'],
  [/IDBI/i, 'IDBI Bank'],
  [/RBL/i, 'RBL Bank'],
  [/DBSBNK|DBS\b/i, 'DBS Bank'],
  [/HSBC/i, 'HSBC'],
  [/SCBANK|STANC/i, 'Standard Chartered'],
  [/CITI/i, 'Citi'],
  [/BNDHNB|BANDHN/i, 'Bandhan Bank'],
  [/JUPITR|JUPITER/i, 'Jupiter'],
  [/EPIFI|FIMNEY/i, 'Fi'],
  [/NIYO/i, 'Niyo'],
  [/SLICE/i, 'slice'],
  [/ONECRD|ONECARD/i, 'OneCard'],
  [/JIOPBL|JIOPAY/i, 'Jio Payments Bank'],
  [/FINOPB/i, 'Fino Payments Bank'],
  [/EQUITS|EQUITAS/i, 'Equitas'],
  [/UJJIVN|UJJIVAN/i, 'Ujjivan'],
  [/SIBLTD/i, 'South Indian Bank'],
  [/KTKBNK/i, 'Karnataka Bank'],
  [/KVBANK|KVBLTD/i, 'KVB'],
  [/CSBBNK/i, 'CSB Bank'],
  [/DCBBNK/i, 'DCB Bank'],
  [/JKBANK/i, 'J&K Bank'],
  [/HDFC/i, 'HDFC Bank'],
  [/ICICI/i, 'ICICI Bank'],
  [/SBI|SBIINB|SBIUPI|CBSSBI|ATMSBI/i, 'SBI'],
  [/AXIS/i, 'Axis Bank'],
  [/KOTAK/i, 'Kotak Bank'],
  [/YESB/i, 'Yes Bank'],
  [/IDFC/i, 'IDFC First Bank'],
  [/INDUS/i, 'IndusInd Bank'],
  [/PNB/i, 'PNB'],
  [/BOB|BARODA/i, 'Bank of Baroda'],
  [/AUBANK|AUBNK|AUSFB/i, 'AU Bank'],
  [/FEDBNK|FEDBK|FEDERAL/i, 'Federal Bank'],
  [/PAYTM|PYTMBK/i, 'Paytm Payments Bank'],
  [/AIRBNK|AIRTEL/i, 'Airtel Payments Bank'],
]
const BANK_NAMES: Array<[RegExp, string]> = [
  [/American Express|\bAmex\b/i, 'American Express'],
  [/\bSBI (?:Credit )?Card\b/i, 'SBI Card'],
  [/\bCanara\b/i, 'Canara Bank'],
  [/Union Bank/i, 'Union Bank'],
  [/Central Bank/i, 'Central Bank of India'],
  [/\bIndian Bank\b/i, 'Indian Bank'],
  [/Indian Overseas|\bIOB\b/i, 'Indian Overseas Bank'],
  [/Bank of India|\bBOI\b/i, 'Bank of India'],
  [/\bUCO Bank\b/i, 'UCO Bank'],
  [/\bIDBI\b/i, 'IDBI Bank'],
  [/\bRBL\b/i, 'RBL Bank'],
  [/\bDBS\b/i, 'DBS Bank'],
  [/\bHSBC\b/i, 'HSBC'],
  [/Standard Chartered/i, 'Standard Chartered'],
  [/\bCiti(?:bank)?\b/i, 'Citi'],
  [/\bBandhan\b/i, 'Bandhan Bank'],
  [/\bJupiter\b/i, 'Jupiter'],
  [/\bFi Money\b/i, 'Fi'],
  [/\bNiyo\b/i, 'Niyo'],
  [/\bOneCard\b/i, 'OneCard'],
  [/Jio Payments Bank/i, 'Jio Payments Bank'],
  [/Fino Payments Bank/i, 'Fino Payments Bank'],
  [/\bEquitas\b/i, 'Equitas'],
  [/\bUjjivan\b/i, 'Ujjivan'],
  [/South Indian Bank/i, 'South Indian Bank'],
  [/Karnataka Bank/i, 'Karnataka Bank'],
  [/Karur Vysya|\bKVB\b/i, 'KVB'],
  [/\bCSB Bank\b/i, 'CSB Bank'],
  [/\bDCB Bank\b/i, 'DCB Bank'],
  [/J&K Bank/i, 'J&K Bank'],
  [/\bHDFC\b/i, 'HDFC Bank'],
  [/\bICICI\b/i, 'ICICI Bank'],
  [/\bSBI\b|State Bank of India/i, 'SBI'],
  [/\bAxis\b/i, 'Axis Bank'],
  [/\bKotak\b/i, 'Kotak Bank'],
  [/\bYes Bank\b/i, 'Yes Bank'],
  [/\bIDFC\b/i, 'IDFC First Bank'],
  [/\bIndusInd\b/i, 'IndusInd Bank'],
  [/\bPNB\b|Punjab National/i, 'PNB'],
  [/Bank of Baroda|\bBoB\b/i, 'Bank of Baroda'],
  [/\bAU (?:Small Finance )?Bank\b/i, 'AU Bank'],
  [/\bFederal Bank\b/i, 'Federal Bank'],
  [/Paytm Payments Bank|Paytm Bank/i, 'Paytm Payments Bank'],
  [/Airtel Payments Bank/i, 'Airtel Payments Bank'],
]

export function findBank(text: string, sender?: string): string | undefined {
  // Sender ids look like "VM-HDFCBK", "AX-ICICIT-S", "JD-SBIUPI".
  const code = sender?.toUpperCase().replace(/^[A-Z]{2}-/, '')
  if (code) for (const [re, name] of BANK_SENDERS) if (re.test(code)) return name
  // the payee's UPI handle (swiggy@icici) says nothing about the sender's bank
  const plain = text.replace(/\S+@\S+/g, ' ')
  for (const [re, name] of BANK_NAMES) if (re.test(plain)) return name
  return undefined
}

/**
 * Does this look like a message from a bank or payment app at all (an account / card reference,
 * a known bank, or UPI / IMPS / NEFT / ATM wording)? The Gemini fallback only ever sees such
 * messages; a personal text that happens to mention "Rs 500" never leaves the project.
 */
export function isBankLikeSms(text: string, sender?: string): boolean {
  const t = (text ?? '').replace(/\s+/g, ' ')
  if (!t) return false
  return (
    ACCOUNT_REF_RE.test(t) ||
    !!findBank(t, sender) ||
    /\b(?:UPI|VPA|IMPS|NEFT|RTGS|ATM|NACH|debit card|credit card)\b/i.test(t) ||
    /\b(?:a\/c|acct|account)\b/i.test(t)
  )
}

// ---- Merchants ---------------------------------------------------------

/** Known merchants: compact lowercase key → display name. Keys of 4+ letters also match as a prefix. */
const BRANDS: Record<string, string> = {
  swiggy: 'Swiggy',
  instamart: 'Swiggy Instamart',
  zomato: 'Zomato',
  blinkit: 'Blinkit',
  zepto: 'Zepto',
  bigbasket: 'BigBasket',
  dunzo: 'Dunzo',
  amazon: 'Amazon',
  amzn: 'Amazon',
  flipkart: 'Flipkart',
  myntra: 'Myntra',
  nykaa: 'Nykaa',
  ajio: 'AJIO',
  meesho: 'Meesho',
  uber: 'Uber',
  ola: 'Ola',
  olacabs: 'Ola',
  rapido: 'Rapido',
  irctc: 'IRCTC',
  redbus: 'redBus',
  makemytrip: 'MakeMyTrip',
  mmt: 'MakeMyTrip',
  goibibo: 'Goibibo',
  cleartrip: 'Cleartrip',
  ixigo: 'ixigo',
  indigo: 'IndiGo',
  airindia: 'Air India',
  akasa: 'Akasa Air',
  vistara: 'Vistara',
  oyo: 'OYO',
  airbnb: 'Airbnb',
  bookmyshow: 'BookMyShow',
  district: 'District',
  pvr: 'PVR',
  inox: 'INOX',
  netflix: 'Netflix',
  spotify: 'Spotify',
  hotstar: 'Disney+ Hotstar',
  jiohotstar: 'JioHotstar',
  jio: 'Jio',
  airtel: 'Airtel',
  vodafone: 'Vi',
  dominos: "Domino's",
  mcdonalds: "McDonald's",
  starbucks: 'Starbucks',
  kfc: 'KFC',
  burgerking: 'Burger King',
  haldirams: "Haldiram's",
  dmart: 'DMart',
  reliance: 'Reliance',
  tatacliq: 'Tata CLiQ',
  croma: 'Croma',
  decathlon: 'Decathlon',
  ikea: 'IKEA',
  fastag: 'FASTag',
  bpcl: 'BPCL',
  hpcl: 'HPCL',
  iocl: 'IndianOil',
  indianoil: 'IndianOil',
  apollo: 'Apollo',
  pharmeasy: 'PharmEasy',
  netmeds: 'Netmeds',
  urbancompany: 'Urban Company',
  zoomcar: 'Zoomcar',
  yulu: 'Yulu',
  cred: 'CRED',
}

/** Handle/aggregator words that are never the merchant. */
const GENERIC = new Set([
  'paytm',
  'paytmqr',
  'pay',
  'payment',
  'payments',
  'upi',
  'order',
  'orders',
  'online',
  'rzp',
  'razorpay',
  'qr',
  'pos',
  'merchant',
  'mer',
  'store',
  'india',
  'in',
  'digital',
  'bharatpe',
  'gpay',
  'phonepe',
  'payu',
  'cf',
  'cashfree',
  'billdesk',
  'ccavenue',
  'juspay',
  'mid',
  'pinelabs',
  'ezetap',
  'mswipe',
  'instant',
  'collect',
  'api',
  'mandate',
  'autopay',
  'rides',
  'ride',
  'food',
  'pvt',
  'ltd',
  'www',
  'com',
])

function brandFor(s: string): string | undefined {
  const key = s.toLowerCase().replace(/[^a-z]/g, '')
  if (!key) return undefined
  if (BRANDS[key]) return BRANDS[key]
  for (const [k, v] of Object.entries(BRANDS)) if (k.length >= 5 && key.startsWith(k)) return v
  return undefined
}

/** "RAHUL SHARMA" → "Rahul Sharma"; consonant-only short words (KFC, BPCL) stay upper case. */
export function titleCase(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      if (/\d/.test(w)) return w.toUpperCase()
      if (w.length <= 5 && !/[aeiouy]/i.test(w) && /^[a-z&]+$/i.test(w)) return w.toUpperCase()
      return w
        .split(/(?=[-'])/)
        .map((p) => (p.charAt(0) === "'" ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
        .join('')
    })
    .join(' ')
}

/**
 * Merchant name from a UPI id: swiggy@icici → Swiggy, paytm-zomato@paytm → Zomato,
 * rahul.sharma@okhdfcbank → Rahul Sharma. Phone numbers and QR ids (q123456@ybl) → undefined.
 */
export function merchantFromVpa(vpa: string): string | undefined {
  const local = vpa.split('@')[0]?.toLowerCase() ?? ''
  if (!local || /^\+?\d+$/.test(local)) return undefined
  if (/^(?:q|m|mab|mpos|pay|upi|gpay|phonepe|bharatpe|paytmqr|paytm)?[.-]?\d{5,}[a-z0-9]*$/.test(local)) return undefined
  const tokens = local
    .split(/[.\-_]+/)
    .map((t) =>
      t
        .replace(/^(?:upi|paytm|bharatpe|rzp|phonepe|gpay)(?=[a-z]{3,})/, '')
        .replace(/(?<=[a-z]{3,})(?:upi|pay)$/, '')
        .replace(/\d+$/, ''),
    )
    .filter((t) => t.length >= 2 && !GENERIC.has(t) && (!/\d/.test(t) || brandFor(t)))
  if (!tokens.length) return undefined
  const brand = brandFor(tokens[0])
  if (brand) return brand
  if (tokens[0].length < 3) return undefined
  return titleCase(tokens.slice(0, 3).join(' '))
}

const VPA_RE = /\b([a-z0-9][a-z0-9.\-_]{1,255}@[a-z][a-z0-9]{1,63})\b(?!\.[a-z])/i
const STOP = '(?:on|dt\\.?|dated|via|using|ref|refno|txn|avl|bal|for|with|from|at|upi|imps|neft|by|not you|if not|call|sms|info|is|has|was|thru|through)'
const NOT_MERCHANT =
  /^(?:you|your|u|the|a\/c|ac|acct|account|card|block|report|dispute|raise|register|visit|approve|decline|unsubscribe|stop|know|check|avoid|mobile|bank|beneficiary|self|us|customer|date|behalf|ur|hold|rs\.?|inr)\b/i
/** Words that describe the payment rather than name the payee ("UPI AutoPay mandate"). */
const DESCRIPTIVE = new Set([...GENERIC, 'autopay', 'mandate', 'emandate', 'charges', 'bill', 'transfer', 'txn', 'self', 'via', 'using', 'thru'])
/** Everything from the bank's safety trailer onwards ("Not you? Call 1800… to raise a dispute") never names the payee. */
const TRAILER_RE = /\b(?:Not you|Not u\b|If not|Call\s*\d|SMS\s+BLOCK|To block|Report (?:fraud|at)|Dispute\?)/i

/** Tidy a raw payee segment into a display name, or undefined if it isn't one. */
export function cleanMerchant(raw: string | undefined): string | undefined {
  let s = raw?.replace(/\s+/g, ' ').trim()
  if (!s) return undefined
  if (s.includes('@')) return merchantFromVpa(s.match(VPA_RE)?.[1] ?? s)
  s = s.replace(/^(?:VPA|UPI|POS|ECOM|M\/S\.?|MS\.?|the)[\s:/-]+/i, '').replace(/^\d[\d\s*#-]*\s+(?=[A-Za-z])/, '')
  if (s.includes('*')) {
    const head = s.split('*')[0].trim()
    if (head.length >= 3) s = head
  }
  s = s
    .replace(/\s+(?:india\s+)?(?:pvt\.?|priva\w*|private)\b.*$/i, '')
    .replace(/\s+(?:ltd\.?|limited|llp)$/i, '')
    .replace(/[\s.,;:/-]+$/, '')
    .replace(/^[\s.,;:/-]+/, '')
  if (!s || s.length < 2 || !/[a-z]/i.test(s) || /^\d/.test(s) || NOT_MERCHANT.test(s) || ACCOUNT_REF_RE.test(s)) return undefined
  if (
    s
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean)
      .every((w) => DESCRIPTIVE.has(w))
  )
    return undefined
  return (brandFor(s.split(' ')[0]) ?? brandFor(s) ?? titleCase(s)).slice(0, 60)
}

/** The best token of a slash/dash-separated narration ("UPI/P2M/628112345678/SWIGGY/Pay"). */
function bestToken(seg: string): string | undefined {
  const parts = seg.split(/[/|]|\s-\s|-(?=[A-Z])/).map((p) => p.replace(/^[\s-]+|[\s-]+$/g, ''))
  return parts.find(
    (p) => /[a-z]{3,}/i.test(p) && !/^(?:UPI|P2[AM]|IMPS|NEFT|RTGS|POS|ECOM|DR|CR|MMT|NA|Pay(?:ment)?|Sent using Paytm U?P?I?)$/i.test(p) && !/^\d/.test(p),
  )
}

function findMerchant(input: string): { merchant?: string; vpa?: string } {
  const text = input.split(TRAILER_RE)[0].replace(/\b(?:Mr|Mrs|Ms|Miss|Shri|Smt)\.?\s+(?=[A-Z])/g, '')
  const vpa = text.match(VPA_RE)?.[1]
  const fromVpa = vpa ? merchantFromVpa(vpa) : undefined
  const candidates: Array<string | undefined> = []

  // Axis / Federal narration: "UPI/P2M/628112345678/SWIGGY ..." ; "Info: UPI/...".
  const narr = text.match(/\bUPI\/(?:P2[AM]|CR|DR)\/\d+\/([^\s].*?)(?:\s+(?:Not you|Avl|Bal|If|Call|SMS|-)\b|$)/i)
  if (narr) candidates.push(bestToken(narr[1]))
  const info = text.match(/\bInfo\s*[:-]\s*(.+?)(?:[.;]\s|\s+(?:Avl|Bal|Not you|Call)\b|$)/i)
  if (info) candidates.push(bestToken(info[1].replace(/\b\d{6,}\b/g, '')))
  // ICICI: "...debited for Rs 250.00 on 07-Oct-26; SWIGGY credited."
  candidates.push(text.match(/;\s*([A-Za-z0-9 .&'@_-]+?)\s+credited\b/i)?.[1])
  // Axis cards: "... 07-10-26 20:15:02 IST BLUE TOKAI COFFEE Avl Limit ..."
  candidates.push(text.match(/\d{1,2}:\d{2}(?::\d{2})?(?:\s*IST\b)?\.?\s+(?!IST\b|Avl\b|Bal\b)([A-Za-z][A-Za-z0-9 &'.-]+?)\s+(?:Avl|Not you|Bal)\b/i)?.[1])

  if (fromVpa) return { merchant: fromVpa, vpa }

  const atRe = new RegExp(`\\bat\\s+(.+?)(?=\\s+${STOP}\\b|\\s*[.,;(]\\s|\\s*[(]|\\.$|$)`, 'gi')
  for (const m of text.matchAll(atRe)) candidates.push(m[1])
  const to = new RegExp(`\\b(?:trf|transfer(?:red)?|paid|sent|payment)?\\s*to\\s+(?:VPA\\s+)?(.+?)(?=\\s+${STOP}\\b|\\s*[.,;(]|$)`, 'gi')
  for (const m of text.matchAll(to)) candidates.push(m[1])
  const towards = new RegExp(`\\btowards\\s+(.+?)(?=\\s+${STOP}\\b|\\s*[.,;(]|$)`, 'gi')
  for (const m of text.matchAll(towards)) candidates.push(m[1].replace(/\s*e-?mandate$/i, ''))
  // ICICI cards: "spent using ICICI Bank Card XX4321 on 07-Oct-26 on MAKEMYTRIP INDIA PVT LTD."
  const on = new RegExp(`\\bon\\s+(?!\\d)(.+?)(?=\\s+${STOP}\\b|\\s*[.,;(]|$)`, 'gi')
  for (const m of text.matchAll(on)) candidates.push(m[1])
  // "towards UPI AutoPay mandate for SPOTIFY", "for your Jio recharge"
  const forRe = new RegExp(
    `\\bfor\\s+(?!rs\\b|inr\\b|₹|a\\s|an\\s|the\\s|your\\s|upi\\b|txn|transaction|payment|dispute|security)(.+?)(?=\\s+${STOP}\\b|\\s*[.,;(]|$)`,
    'gi',
  )
  for (const m of text.matchAll(forRe)) candidates.push(m[1])

  for (const c of candidates) {
    if (c && vpa && c.includes(vpa)) continue
    const name = cleanMerchant(c)
    if (name) return { merchant: name, vpa }
  }
  return { vpa }
}

// ---- Classification ----------------------------------------------------

const OTP_RE =
  /(?<!share\s(?:your\s|the\s)?|sharing\s(?:your\s)?)(?:\bOTP\b|one[- ]time password|verification code)[^.]{0,60}?\b\d{4,8}\b|\b\d{4,8}\b\s*is\s*(?:your|the)\s*(?:OTP|one[- ]time password|verification code)|(?<!share\s(?:your\s)?)\bOTP\b.{0,30}\b(?:for|to)\b.{0,40}\b(?:txn|transaction|payment)/i
const REQUEST_RE =
  /\b(?:requested (?:money|payment|rs|inr|₹)|has requested|is requesting|requesting (?:money|payment|rs|inr|₹)|requested by|requests? (?:rs|inr|₹)|collect request|payment request|request(?:ed)? (?:for|of) (?:rs|inr|₹)|sent you a (?:payment )?request)/i
/** Money moved between the user's own places (UPI Lite top-up, own account, wallet load): not an expense. */
const TRANSFER_RE =
  /\b(?:(?:to|added to|loaded (?:to|in)|top[- ]?up(?: of| to)?)\s+(?:your\s+)?UPI Lite\b|UPI Lite\s+top[- ]?up|own (?:account|a\/c)|self[- ]transfer|added to (?:your )?wallet)\b/i
/** Notices about an earlier debit (EMI conversion), not a new one. */
const NOTICE_RE = /\bconverted (?:to|into) (?:an? )?EMI\b|\bEMI conversion\b/i
const FAILED_RE =
  /\b(?:declined|failed|failure|unsuccessful|could not be (?:processed|completed)|not been processed|reversed|reversal|has been cancelled|was cancelled|rejected|insufficient (?:funds|balance)|not successful)\b/i
const FUTURE_RE = /\b(?:will be|would be|shall be|to be|is scheduled to be|getting)\s+(?:auto[- ]?)?(?:debited|deducted|charged|paid|presented)\b/gi
const REMINDER_RE =
  /\b(?:is due|are due|due (?:on|by|date|for)|payment due|minimum (?:amount )?due|total (?:amount )?due|bill (?:of|for|is) .{0,40}\b(?:generated|due)|upcoming|scheduled (?:for|on)|remind(?:er)?|overdue|ensure (?:sufficient|adequate) (?:balance|funds)|maintain (?:sufficient|adequate) balance|mandate (?:is |has been )?(?:created|registered|set up))\b|\bZZFUTUREZZ\b/i
const DEBIT_RE =
  /\b(?:debited|debit(?:ed)? (?:of|for|by)|spent|withdrawn|withdrawal|deducted|sent|paid|charged|purchase(?:d)?|txn of|transaction of|used (?:at|for|on)|done at|made at|made to)\b|\btxn(?: of)?(?=\s*(?:₹|inr\b|rs\b))|\bdebit(?=\s*(?:₹|inr\b|rs\b))|\bdr\.?(?=\s*(?:from|to|of|for|₹|inr\b|rs\b))|\b(?:debit|credit|atm) card\b(?:(?!due|statement|bill|limit|[.;])[\s\S])*?(?:₹|inr\b|rs(?![a-z])\.?)\s*\.?\s*\d/i
const CREDIT_RE =
  /\b(?:credited|received|deposited|refund(?:ed)?|cashback (?:of|credited)|added to (?:your )?(?:wallet|a\/c|account)|sent to you|paid you|transferred to you)\b/i
const BALANCE_RE =
  /\b(?:avl\.? ?bal|available bal(?:ance)?|a\/c bal(?:ance)?|account balance|balance (?:is|in|as on|of)|bal(?:ance)? enquiry|closing balance|clr bal|avl lmt|available limit)\b/i
const PROMO_RE =
  /\b(?:offer|cashback (?:up ?to|of up to|on)|pre[- ]?approved|apply now|click here|limited period|hurry|exclusive|congratulations|you(?:'ve| have) won|win\b|eligible for|get up ?to|loan (?:of|up ?to)|upgrade|T&C|voucher|coupon|discount|reward points? (?:worth|expir)|shop now|book now|download)/i

/** First index of `re` in `s`, or Infinity. */
const at = (re: RegExp, s: string) => {
  const m = s.match(re)
  return m ? m.index! : Infinity
}

function classify(text: string): SmsKind {
  if (OTP_RE.test(text)) return 'otp'
  if (REQUEST_RE.test(text)) return 'request'
  if (FAILED_RE.test(text)) return 'failed'
  if (TRANSFER_RE.test(text)) return 'transfer'
  if (NOTICE_RE.test(text)) return 'reminder'
  const present = text.replace(FUTURE_RE, ' ZZFUTUREZZ ')
  const d = at(DEBIT_RE, present)
  const c = at(CREDIT_RE, present)
  if (d === Infinity && REMINDER_RE.test(present)) return 'reminder'
  if (PROMO_RE.test(text) && !ACCOUNT_REF_RE.test(text)) return 'promo'
  if (d < c) return 'debit'
  if (c < Infinity) return 'credit'
  if (BALANCE_RE.test(text)) return 'balance'
  return 'unknown'
}

function methodOf(text: string): SmsMethod | undefined {
  if (/\bUPI\b|\bVPA\b/i.test(text) || VPA_RE.test(text)) return 'upi'
  if (/\bATM\b|withdrawn/i.test(text)) return 'atm'
  if (/\bcard\b|\bcc\b/i.test(text)) return 'card'
  if (/\bIMPS\b/i.test(text)) return 'imps'
  if (/\bNEFT\b|\bRTGS\b/i.test(text)) return 'neft'
  return undefined
}

/** Parse one bank / UPI / card SMS. `sender` is the SMS sender id (e.g. "VM-HDFCBK"), if known. */
export function parseBankSms(input: string, opts: { sender?: string } = {}): ParsedSms {
  const text = (input ?? '').replace(/\s+/g, ' ').trim()
  const kind = text ? classify(text) : 'unknown'
  const found = findAmount(text)
  const out: ParsedSms = { kind, currency: found?.currency ?? 'INR' }
  if (found) out.amount = found.amount
  const bank = findBank(text, opts.sender)
  if (bank) out.bank = bank
  if (kind !== 'debit') return out

  const { merchant, vpa } = findMerchant(text)
  const method = methodOf(text)
  if (method === 'atm') out.merchant = 'ATM withdrawal'
  else if (merchant) out.merchant = merchant
  if (vpa) out.vpa = vpa.toLowerCase()
  const ref = findRef(text)
  if (ref) out.ref = ref
  const date = findSmsDate(text)
  if (date) out.date = date
  const account = findAccount(text)
  if (account) out.account = account
  if (method) out.method = method
  return out
}

// ---- Privacy -------------------------------------------------------------

/**
 * Mask what shouldn't be stored from an SMS: full account / card numbers become "XX1234",
 * balances and limits become "Rs ***", and OTP-looking codes are removed. References stay.
 */
export function maskSms(input: string, max = 500): string {
  let s = (input ?? '').replace(/\s+/g, ' ').trim()
  // card numbers written in groups: 4111 1111 1111 1234
  s = s.replace(/\b(?:\d{4}[ -]){2,4}(\d{4})\b/g, 'XX$1')
  // account / card numbers after a keyword: "A/c 50100123456789" → "A/c XX6789" (7+ digits: older
  // and co-operative bank accounts can be that short)
  s = s.replace(
    /\b((?:a\/c|ac|acct|account|card)\b\.?(?:\s*no\.?)?\s*[:-]?\s*)[x*]*(\d{3,})(\d{4})\b/gi,
    (_m, k: string, _a: string, last: string) => `${k}XX${last}`,
  )
  // the user's own phone number: "your mobile 9876543210" → "your mobile XX3210"
  s = s.replace(
    /\b((?:mobile|mob|phone|ph)\b\.?(?:\s*no\.?|\s*number)?\s*[:-]?\s*)\+?(\d{6,8})(\d{4})\b/gi,
    (_m, k: string, _a: string, last: string) => `${k}XX${last}`,
  )
  // any other long digit run not introduced by a reference keyword: keep last 4
  s = s.replace(/(?<!(?:ref|refno|rrn|utr|upi|imps|txn|id|no|number|#)[\s.:#-]{0,3})\b\d{13,19}\b/gi, (m) => `XX${m.slice(-4)}`)
  // balances and limits
  s = s.replace(
    /\b((?:avl\.? ?bal(?:ance)?|available bal(?:ance)?|bal(?:ance)?|avl\.? ?lmt|available limit|limit)\b[^0-9₹]{0,12}?)(?:₹|INR|Rs\.?)?\s*[0-9][0-9,]*(?:\.\d{1,2})?/gi,
    '$1Rs ***',
  )
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
