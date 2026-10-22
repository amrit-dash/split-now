/*
 * Help: the in-app guide's shape and the decisions its screen makes (search, the step player,
 * which chapter a section opens under). The words live in src/lib/help-content.ts; the animated
 * scenes in src/features/help/. Pure: no React, no storage.
 */

import type { UiIconName } from './ui-icons'

export type ChapterId = 'start' | 'groups' | 'expenses' | 'receipts' | 'settle' | 'capture' | 'private' | 'account'

export interface Chapter {
  id: ChapterId
  title: string
}

export interface HelpStep {
  /** one instruction, starting with the verb ("Tap **Add expense**"); **bold** marks the words on screen */
  text: string
  /**
   * What the scene points at for this step (src/features/help/scenes.tsx): a name the scene gives
   * one of its parts. Absent: the scene shows the step's screen without a pointer.
   */
  mark?: string
}

/**
 * The explainers' pictures (src/features/help/Story.tsx): an everyday picture of how a part of
 * Split Now thinks, not a list of taps. Each draws a fixed number of beats (STORY_BEATS), and
 * the section's `story.beats` are the captions, one per beat.
 */
export type StoryKind = 'pot' | 'seesaw' | 'untangle' | 'remainder' | 'vault' | 'filter'

export const STORY_BEATS: Record<StoryKind, number> = { pot: 4, seesaw: 3, untangle: 3, remainder: 3, vault: 3, filter: 3 }

export interface HelpSection {
  id: string
  chapter: ChapterId
  title: string
  /** one line: what it is for */
  summary: string
  /** one of the main features: listed first and given a playable scene */
  core?: boolean
  /** not listed on the guide's front page (it is reached from links: What's new, Related); search still finds it */
  unlisted?: boolean
  /** the icon on its card and row (src/lib/ui-icons.ts) */
  icon?: UiIconName
  steps?: HelpStep[]
  /** an explainer: an animated picture and a caption per beat, in place of steps */
  story?: { kind: StoryKind; beats: string[] }
  /** what to know: rules, limits and edge cases, one sentence each */
  points: string[]
  /** where to try it: a button to that place in the app */
  open?: { label: string; to: string }
  /** other sections it leads to (ids) */
  related?: string[]
  /** extra words people may search with ("refund", "UPI") */
  keywords?: string[]
}

/** Each step of a played scene stays this long before the next one (a tap on a step jumps to it). */
export const STEP_MS = 2800

/** The next step while playing: round to the start after the last, so the scene loops. */
export const nextStep = (i: number, count: number): number => (count <= 0 ? 0 : (i + 1) % count)

/** A step index kept within the steps (a stale index after a section change starts over). */
export const clampStep = (i: number, count: number): number => (i >= 0 && i < count ? i : 0)

/** **bold** spans in a step's text, as parts to render: the words on screen stand out. */
export function boldParts(text: string): Array<{ text: string; bold: boolean }> {
  const out: Array<{ text: string; bold: boolean }> = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false })
    out.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false })
  return out
}

/** Plain text (no ** marks), for search and for screen readers' labels. */
export const plain = (text: string): string => text.replace(/\*\*/g, '')

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '')

/**
 * The guide's search: sections whose words start with every word typed, best first. A word in
 * the title counts most, then the summary and keywords, then the steps and points. Empty finds
 * nothing (the screen shows the chapters instead).
 */
export function searchHelp(query: string, sections: HelpSection[]): HelpSection[] {
  const words = fold(query)
    .split(/[^a-z0-9₹$]+/)
    .filter((w) => w.length >= 2)
  if (!words.length) return []
  const scored: Array<{ s: HelpSection; score: number; i: number }> = []
  sections.forEach((s, i) => {
    const fields: Array<[string, number]> = [
      [s.title, 6],
      [`${s.summary} ${(s.keywords ?? []).join(' ')}`, 3],
      [[...(s.steps ?? []).map((x) => plain(x.text)), ...(s.story?.beats ?? []).map(plain), ...s.points].join(' '), 1],
    ]
    const tokens = fields.map(([t, w]) => [fold(t).split(/[^a-z0-9₹$]+/), w] as const)
    let score = 0
    for (const w of words) {
      let best = 0
      for (const [ts, weight] of tokens) if (ts.some((t) => t.startsWith(w))) best = Math.max(best, weight)
      if (!best) return
      score += best
    }
    scored.push({ s, score: score + (s.core ? 0.5 : 0), i })
  })
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.s)
}

/**
 * The guide's front page: the explainers first (how it works), then the main features, then each
 * chapter with the rest, in order. A section is listed once.
 */
export function guideLayout(
  chapters: Chapter[],
  sections: HelpSection[],
): { stories: HelpSection[]; core: HelpSection[]; chapters: Array<{ chapter: Chapter; sections: HelpSection[] }> } {
  const listed = sections.filter((s) => !s.unlisted)
  return {
    stories: listed.filter((s) => s.story),
    core: listed.filter((s) => s.core && !s.story),
    chapters: chapters
      .map((chapter) => ({ chapter, sections: listed.filter((s) => s.chapter === chapter.id && !s.core && !s.story) }))
      .filter((c) => c.sections.length),
  }
}

/** Related sections that exist, in the order given (a link to one not written yet is left out). */
export function relatedOf(s: HelpSection, sections: HelpSection[]): HelpSection[] {
  return (s.related ?? []).map((id) => sections.find((x) => x.id === id)).filter((x): x is HelpSection => !!x)
}

/** Help's screenshots come in every theme and accent the app has (scripts/help-media.mjs). */
export const SHOT_ACCENTS = ['violet', 'ocean', 'neon', 'berry', 'koi', 'gold', 'graphite'] as const

/**
 * Which picture of a section's screen to show: the one in the person's own theme and accent, so
 * the screenshot looks like their app. An accent the pictures don't have falls back to violet.
 */
export function shotSrc(id: string, o: { dark: boolean; accent: string | null | undefined }): string {
  // The name comes from the page (<html data-accent>); the URL only ever gets one of our own constants.
  const accent = SHOT_ACCENTS.find((a) => a === o.accent) ?? 'violet'
  return `/help/${o.dark ? 'dark' : 'light'}/${accent}/${id}.webp`
}

/** One screenshot in Help (scripts/help-media.mjs writes them): its size and a marker per step. */
export interface HelpShot {
  w: number
  h: number
  /** the marked part's centre and size, as fractions of the picture */
  marks: Array<{ step: number; x: number; y: number; w: number; h: number }>
}

/**
 * Where a marker's outline goes, in % of the picture: the part's box with a little room around
 * it, kept inside the picture. The numbered badge sits on its top-left corner.
 */
export function markBox(m: HelpShot['marks'][number], pad = 0.012): { left: number; top: number; width: number; height: number } {
  const pct = (n: number) => Math.round(n * 1000) / 10
  const l = Math.max(0, m.x - m.w / 2 - pad)
  const t = Math.max(0, m.y - m.h / 2 - pad * 1.5)
  const r = Math.min(1, m.x + m.w / 2 + pad)
  const b = Math.min(1, m.y + m.h / 2 + pad * 1.5)
  return { left: pct(l), top: pct(t), width: pct(r - l), height: pct(b - t) }
}
