/** Every function runs here (Mumbai). Firestore triggers must be in the database's region. */
export const REGION = 'asia-south1'

/** Dates in captures, trip windows and the reminder schedule are Indian Standard Time. */
export const TIME_ZONE = 'Asia/Kolkata'

/** Browser origins allowed to call the capture webhook (automations send no Origin, so CORS doesn't apply to them). */
export const APP_ORIGINS = [
  'https://split-it-prod.web.app',
  'https://split-it-prod.firebaseapp.com',
  'https://split-now.web.app',
  'https://split-now.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:4173',
]

/** Per capture token. */
export const RATE_LIMIT = { perHour: 60, perDay: 300 }

/** Gentle settle-up reminders. Thresholds are minor units of the group currency. */
export const REMINDER = {
  /** a debt must have been above the threshold at least this long */
  minAgeDays: 7,
  /** at most one reminder per person per group in this many days */
  cooldownDays: 7,
  threshold: { INR: 500_00 } as Record<string, number>,
  /** other currencies: this many major units */
  defaultThresholdMajor: 10,
}

/** Max size of the stored (masked) SMS text. */
export const RAW_MAX = 500
