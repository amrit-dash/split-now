/**
 * The Read with AI button in the corner of each Scan card (Bill, Payment, Statement). It moves the
 * same setting as Settings → AI features (the bills switch, `aiImages`), never the master switch.
 */

export type ScanCardKind = 'receipt' | 'payment' | 'statement'

/** Why AI can't read here right now: the button stays, and a tap says why instead of toggling. */
export type ScanAiWhy = 'demo' | 'admin' | 'account' | 'master'

export type ScanAiButton = { show: false } | { show: true; state: 'on' | 'off' } | { show: true; state: 'unavailable'; why: ScanAiWhy }

export interface ScanAiInput {
  kind: ScanCardKind
  /** Simple mode: the Settings choice applies and the card has no AI button */
  /** demo mode (localRepo): nothing is read with AI */
  demo: boolean
  /** the admin's switch for reading pictures with AI (flags.aiImages) */
  adminOn: boolean
  /** can AI read pictures for this account (aiAvailability(...).images); undefined while checking */
  available: boolean | undefined
  /** the master AI switch from the account's prefs; undefined until they arrive */
  masterOn: boolean | undefined
  /** the bills switch as this phone knows it */
  on: boolean
}

/**
 * What the corner button shows. Payment screenshots are read on the phone only (there is no AI
 * reader for them), so that card never has it; Simple hides it on every card.
 */
export function scanAiButton(o: ScanAiInput): ScanAiButton {
  // Shown in Simple too (owner, 24 Oct 2026): whether AI reads a bill is everyone's choice.
  if (o.kind === 'payment') return { show: false }
  if (o.demo) return { show: true, state: 'unavailable', why: 'demo' }
  if (!o.adminOn) return { show: true, state: 'unavailable', why: 'admin' }
  if (o.available === false) return { show: true, state: 'unavailable', why: 'account' }
  if (o.masterOn === false) return { show: true, state: 'unavailable', why: 'master' }
  return { show: true, state: o.on ? 'on' : 'off' }
}

/** The line a tap on an unavailable button shows. */
export function scanAiWhyText(why: ScanAiWhy, kind: ScanCardKind): string {
  const fallback = kind === 'statement' ? 'Statements are read on this phone.' : 'Bills are read on this phone.'
  switch (why) {
    case 'demo':
      return kind === 'statement'
        ? 'AI reading isn’t part of the demo. Statements show a sample here.'
        : 'AI reading isn’t part of the demo. Bills are read on this phone.'
    case 'admin':
      return `Reading with AI is off for everyone right now. ${fallback}`
    case 'account':
      return `AI reading isn’t set up for your account. ${fallback}`
    case 'master':
      return `AI is off in Settings → AI features. ${fallback}`
  }
}

/** Where the tap's toast links to, if anywhere. */
export function scanAiWhyLink(why: ScanAiWhy, admin: boolean): { label: string; to: string } | undefined {
  if (why === 'account') return admin ? { label: 'Set up', to: '/settings/admin' } : { label: 'AI settings', to: '/settings/ai' }
  if (why === 'master') return { label: 'AI settings', to: '/settings/ai' }
  return undefined
}

/** The toast after switching: where the photo goes is a privacy line, so it is always said. */
export function scanAiToggledText(on: boolean): string {
  if (on) return 'Read with AI on: the photo is sent to Google Gemini'
  return 'Read with AI off: read on this phone, nothing is sent'
}

/** The button's tooltip, which also says where the photo goes. */
export function scanAiTitle(b: ScanAiButton): string {
  if (!b.show) return ''
  if (b.state === 'on') return 'Read with AI is on: the photo is sent to Google Gemini'
  if (b.state === 'off') return 'Read with AI is off: read on this phone'
  return 'Read with AI isn’t available here'
}

/**
 * Who reads what is picked on a Scan card, for the line under its buttons:
 *   ai         Google Gemini (the Read with AI button would show 'on')
 *   phone      this phone only, nothing is sent
 *   phoneFirst a bill read on the phone first because the person has private groups; it goes to
 *              Gemini only once a group that isn't private is picked (src/lib/vault-api.ts)
 *   demo       a statement in demo mode, which shows a sample instead of reading anything
 */
export type ScanReader = 'ai' | 'phone' | 'phoneFirst' | 'demo'

/**
 * The same inputs as the corner button minus Simple: Simple only hides the button, the Settings
 * choice still decides who reads. AI reads only when the button would be 'on', so anything that
 * makes it unavailable or off (demo, the admin's switch, the account, the master switch, the bills
 * switch) means the phone reads it. Payment screenshots are always read on the phone.
 */
export function scanReader(o: ScanAiInput & { deviceFirst?: boolean }): ScanReader {
  if (o.kind === 'payment') return 'phone'
  // Demo bills really are read on this phone; a demo statement shows a sample.
  if (o.demo) return o.kind === 'statement' ? 'demo' : 'phone'
  const b = scanAiButton(o)
  if (!b.show || b.state !== 'on') return 'phone'
  return o.deviceFirst && o.kind === 'receipt' ? 'phoneFirst' : 'ai'
}

/** How many screenshots one statement read takes (the server's MAX_IMAGES). */
export const STATEMENT_MAX_FILES = 6

/** A subtext as src/lib/look.ts draws it, in plain strings. */
export interface ScanHint {
  full: string
  short?: string
  tier: 'key' | 'help'
}

/**
 * The line under a Scan card's buttons: an icon and where the picture goes. Key in every case: it
 * says whether a photo leaves the phone, so it stays in Simple and in Titles only.
 */
export function scanReaderLine(kind: ScanCardKind, reader: ScanReader): { icon: 'ai' | 'phone'; hint: ScanHint } {
  if (reader === 'demo') return { icon: 'phone', hint: { full: 'Demo: shows a sample statement.', tier: 'key' } }
  if (kind === 'statement') {
    return reader === 'ai'
      ? {
          icon: 'ai',
          hint: {
            full: `Up to ${STATEMENT_MAX_FILES} screenshots. Read by Google Gemini, usually in under a minute.`,
            short: 'Read by Google Gemini',
            tier: 'key',
          },
        }
      : {
          icon: 'phone',
          hint: {
            full: `Up to ${STATEMENT_MAX_FILES} screenshots, read on this phone: nothing leaves it. Less exact than AI, so check each payment before adding.`,
            short: 'Read on this phone, check each payment',
            tier: 'key',
          },
        }
  }
  if (kind === 'payment') {
    return {
      icon: 'phone',
      hint: {
        full: 'Read on this phone: nothing leaves it. Check the amount and who you paid.',
        short: 'Read on this phone, check the amount',
        tier: 'key',
      },
    }
  }
  if (reader === 'ai') {
    return {
      icon: 'ai',
      hint: { full: 'Read by Google Gemini: the photo is sent to read the total, date and items.', short: 'Read by Google Gemini', tier: 'key' },
    }
  }
  if (reader === 'phoneFirst') {
    return {
      icon: 'phone',
      hint: {
        full: 'Read on this phone first. It goes to Google Gemini only if you pick a group that isn’t private.',
        short: 'Read on this phone first, then Google Gemini',
        tier: 'key',
      },
    }
  }
  return {
    icon: 'phone',
    hint: {
      full: 'Read on this phone: nothing leaves it. Less exact than AI, so check the total before adding.',
      short: 'Read on this phone, check the total',
      tier: 'key',
    },
  }
}

/**
 * The line at the foot of every Scan tab. Key, so it shows in Simple too (the owner wants it on all
 * three): nothing reaches a group by itself, and recent scans stay on this device. A statement adds
 * nothing until payments are ticked and added (or sent to the Inbox), not when a group is picked.
 */
export function scanFootHint(kind: ScanCardKind): ScanHint {
  if (kind === 'statement') {
    return {
      full: 'Nothing is added until you tick payments and tap Add. Recent scans stay on this device.',
      short: 'Nothing is added until you tick payments',
      tier: 'key',
    }
  }
  return { full: 'Nothing is added until you pick a group. Recent scans stay on this device.', short: 'Nothing is added until you pick a group', tier: 'key' }
}
