/*
 * What's new in the app: every release of the current major version, newest first, in a few
 * plain lines each, and each line linked to the Help section that explains it (src/lib/help-content.ts).
 * CHANGELOG.md stays the full record in the repository; this is the in-app entry point, and a
 * test keeps the two in step (every CHANGELOG version of this major has an entry here, and every
 * link points to a section that exists). A new major starts an empty list.
 */

import { compareSemver, semverOf } from './flags'

export interface WhatsNewItem {
  /** one short line, in the app's words */
  text: string
  /** the Help section it opens */
  section: string
}

export interface Release {
  version: string
  /** as CHANGELOG.md writes it: "October 2026" */
  date: string
  items: WhatsNewItem[]
}

export const RELEASES: Release[] = [
  {
    version: '8.3.12',
    date: 'October 2026',
    items: [
      { text: 'How it works: what Split Now does, as a shared pot that keeps count', section: 'how-it-works' },
      { text: 'Balances, simplified payments and rounding, each as a moving picture', section: 'balances-explained' },
      { text: 'What a private group hides, and how auto-capture picks payments', section: 'private-groups-explained' },
    ],
  },
  {
    version: '8.3.11',
    date: 'October 2026',
    items: [{ text: 'AI features in titled sections: bills and screenshots, bank SMS, Quick add, icons, your key', section: 'ai-features' }],
  },
  {
    version: '8.3.10',
    date: 'October 2026',
    items: [
      { text: 'Draw a picture says why Google refused: credit run out, no billing, or a short limit', section: 'ai-features' },
      { text: 'Test pictures checks the chosen image model on your key, or Split Now’s for admins', section: 'ai-features' },
    ],
  },
  {
    version: '8.3.9',
    date: 'October 2026',
    items: [{ text: 'Lock an open private group from its row in Groups', section: 'private-groups-auto-lock' }],
  },
  {
    version: '8.3.8',
    date: 'October 2026',
    items: [
      { text: 'Receipt photos in one row: the scanned receipt first, with a badge, then up to four attached', section: 'receipt-photos' },
      { text: 'Tap a photo to see it full screen; scanning again asks before it replaces the receipt', section: 'receipt-photos' },
      { text: 'The same picture isn’t added twice', section: 'receipt-photos' },
    ],
  },
  {
    version: '8.3.7',
    date: 'October 2026',
    items: [
      { text: 'Every Help section plays its steps, and ticks each one off as it goes', section: 'help-guide' },
      { text: 'See a screenshot of the real screen, with the step you’re on lit', section: 'help-guide' },
    ],
  },
  {
    version: '8.3.6',
    date: 'October 2026',
    items: [
      { text: 'Choose the model for Draw a picture, with what each costs, in Settings → AI features', section: 'ai-features' },
      { text: 'A drawn picture says which model drew it, and the cost note follows the model', section: 'icons-and-ai' },
    ],
  },
  {
    version: '8.3.5',
    date: 'October 2026',
    items: [
      { text: 'Help: a guide to every main feature, with steps you can play, under Profile → Help', section: 'help-guide' },
      { text: 'What’s new: every release of this version in one list, each line linked to its guide', section: 'help-guide' },
    ],
  },
  {
    version: '8.3.4',
    date: 'October 2026',
    items: [{ text: 'Icons with AI work on Split Now’s free AI: suggestions in about 10 seconds, the automatic pick in under one', section: 'icons-and-ai' }],
  },
  {
    version: '8.3.3',
    date: 'October 2026',
    items: [
      { text: 'Tap a group’s icon to see every icon; Enter in the search never saves the form', section: 'icons-and-ai' },
      { text: 'Suggest with AI shows up once you search, for the words you typed', section: 'icons-and-ai' },
      { text: 'When the app can’t tell the icon from a title, AI picks one of its own icons', section: 'icons-and-ai' },
      { text: 'New setting: Settings → AI features → AI picks icons', section: 'ai-features' },
    ],
  },
  {
    version: '8.3.2',
    date: 'October 2026',
    items: [
      { text: 'Suggest with AI works on the free AI for many more titles', section: 'icons-and-ai' },
      { text: 'Draw a picture says when a Gemini key has no billing', section: 'icons-and-ai' },
    ],
  },
  {
    version: '8.3.1',
    date: 'October 2026',
    items: [
      { text: 'Lock buttons open faster after a right pattern, and fill from within as you press', section: 'private-groups-unlock' },
      { text: 'Clearer notes on who pays for Draw a picture', section: 'icons-and-ai' },
    ],
  },
  {
    version: '8.3.0',
    date: 'October 2026',
    items: [
      { text: 'An expense keeps its scanned receipt plus up to four attached photos', section: 'receipt-photos' },
      { text: 'A new scan replaces the scanned receipt; Attach adds several photos at once', section: 'scan-receipt' },
      { text: 'Photos open full screen, with arrows and swipes between them', section: 'receipt-photos' },
    ],
  },
  {
    version: '8.2.0',
    date: 'October 2026',
    items: [{ text: 'Draw a picture: an icon from Google’s image model, billed to your own key', section: 'icons-and-ai' }],
  },
  {
    version: '8.1.4',
    date: 'October 2026',
    items: [{ text: 'Setting a pattern shows · for each tap and – for each long press', section: 'private-groups-setup' }],
  },
  {
    version: '8.1.3',
    date: 'October 2026',
    items: [
      { text: 'Icons with AI: three emoji and a few drawn icons for an expense or group', section: 'icons-and-ai' },
      { text: 'Turn it off for yourself in Settings → AI features → AI icons', section: 'ai-features' },
    ],
  },
  {
    version: '8.1.2',
    date: 'October 2026',
    items: [{ text: 'After a wrong pattern, draw the right one straight away', section: 'private-groups-unlock' }],
  },
  {
    version: '8.1.1',
    date: 'October 2026',
    items: [
      { text: 'Expense or Money received now sits above the amount', section: 'money-received' },
      { text: 'Scan is the icon at the end of the description; Attach keeps a photo without reading it', section: 'add-expense' },
      { text: 'Expenses and groups get an icon for what they’re for, and any icon is a search away', section: 'icons-and-ai' },
    ],
  },
  {
    version: '8.1.0',
    date: 'October 2026',
    items: [
      { text: 'Changing a pattern asks for the current one first', section: 'private-groups-setup' },
      { text: 'Stop using private groups, at the bottom of Encrypted groups', section: 'private-groups-stop' },
      { text: 'A new private group can get its own pattern as it’s made', section: 'private-groups-own-pattern' },
      { text: 'Choose how long private groups stay open', section: 'private-groups-auto-lock' },
      { text: 'The sign-in screen’s glow looks right in Safari and on a Mac', section: 'sign-in' },
      { text: 'Admin → Logs: long lines wrap when an entry is opened', section: 'admin-console' },
    ],
  },
  {
    version: '8.0.0',
    date: 'October 2026',
    items: [
      { text: 'Private groups open with your universal pattern on a lock button, then Face ID', section: 'private-groups-unlock' },
      { text: 'Set the pattern and a passkey once, in Settings → Encrypted groups', section: 'private-groups-setup' },
      { text: 'Locked private groups look scrambled, and nothing outside them names them', section: 'private-groups' },
      { text: 'Turn a group you made private, or back, from Group ⋯ → Make private', section: 'private-groups-make' },
      { text: 'Photos in private groups are encrypted on your phone', section: 'receipt-photos' },
      { text: 'Joining a private group takes its creator’s OK', section: 'private-groups-join' },
    ],
  },
]

/** The major part of a version ("8.3.4" or "8.3.4+c94f47f" → 8); NaN for anything else. */
export const majorOf = (v: string): number => (/^\s*v?\d/.test(v) ? Number(semverOf(v).split('.')[0]) : Number.NaN)

/** Semver order, as the minimum-version check uses (src/lib/flags.ts). */
export const compareVersions = compareSemver

/** The releases What's new lists: the current major's, newest first, none newer than the app itself. */
export function releasesFor(current: string, all: Release[] = RELEASES): Release[] {
  const major = majorOf(current)
  return all.filter((r) => majorOf(r.version) === major && compareVersions(r.version, current) <= 0).sort((a, b) => compareVersions(b.version, a.version))
}

/** Releases newer than what this device last looked at; none when it never looked (a first visit marks everything read). */
export function unseenReleases(o: { current: string; lastSeen: string | null }, all: Release[] = RELEASES): Release[] {
  if (!o.lastSeen) return []
  return releasesFor(o.current, all).filter((r) => compareVersions(r.version, o.lastSeen as string) > 0)
}

/**
 * The "Updated to 8.3.4 · See what's new" banner: shown once after an update on this device,
 * while the admin's switch (flags.whatsNew) is on and the new version has something listed.
 * A first visit (nothing stored yet) shows nothing and just remembers the version.
 */
export function updateBanner(o: { current: string; lastSeen: string | null; flag: boolean }, all: Release[] = RELEASES): { version: string } | null {
  if (!o.flag || !o.lastSeen) return null
  if (compareVersions(o.current, o.lastSeen) <= 0) return null
  return unseenReleases(o, all).length ? { version: o.current } : null
}
