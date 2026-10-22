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
  simple: boolean
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
  if (o.kind === 'payment' || o.simple) return { show: false }
  if (o.demo) return { show: true, state: 'unavailable', why: 'demo' }
  if (!o.adminOn) return { show: true, state: 'unavailable', why: 'admin' }
  if (o.available === false) return { show: true, state: 'unavailable', why: 'account' }
  if (o.masterOn === false) return { show: true, state: 'unavailable', why: 'master' }
  return { show: true, state: o.on ? 'on' : 'off' }
}

/** The line a tap on an unavailable button shows. */
export function scanAiWhyText(why: ScanAiWhy, kind: ScanCardKind): string {
  const fallback = kind === 'statement' ? 'Statements need it to be read.' : 'Bills are read on this phone.'
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
export function scanAiToggledText(on: boolean, kind: ScanCardKind): string {
  if (on) return 'Read with AI on: the photo is sent to Google Gemini'
  return kind === 'statement' ? 'Read with AI off: statements can’t be read without it' : 'Read with AI off: photos are read on this phone'
}

/** The button's tooltip, which also says where the photo goes. */
export function scanAiTitle(b: ScanAiButton, kind: ScanCardKind): string {
  if (!b.show) return ''
  if (b.state === 'on') return 'Read with AI is on: the photo is sent to Google Gemini'
  if (b.state === 'off') return kind === 'statement' ? 'Read with AI is off: statements can’t be read without it' : 'Read with AI is off: read on this phone'
  return 'Read with AI isn’t available here'
}
