/*
 * Help: the in-app guide's shape and the decisions its screen makes (search, the step player,
 * which chapter a section opens under). The words live in src/lib/help-content.ts; the animated
 * scenes in src/features/help/. Pure: no React, no storage.
 */

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

export interface HelpSection {
  id: string
  chapter: ChapterId
  title: string
  /** one line: what it is for */
  summary: string
  /** one of the main features: listed first and given a playable scene */
  core?: boolean
  /** the emoji on its card */
  icon?: string
  steps?: HelpStep[]
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
      [[...(s.steps ?? []).map((x) => plain(x.text)), ...s.points].join(' '), 1],
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

/** The guide's front page: the main features first, then each chapter with the rest, in order. */
export function guideLayout(
  chapters: Chapter[],
  sections: HelpSection[],
): { core: HelpSection[]; chapters: Array<{ chapter: Chapter; sections: HelpSection[] }> } {
  return {
    core: sections.filter((s) => s.core),
    chapters: chapters.map((chapter) => ({ chapter, sections: sections.filter((s) => s.chapter === chapter.id && !s.core) })).filter((c) => c.sections.length),
  }
}

/** Related sections that exist, in the order given (a link to one not written yet is left out). */
export function relatedOf(s: HelpSection, sections: HelpSection[]): HelpSection[] {
  return (s.related ?? []).map((id) => sections.find((x) => x.id === id)).filter((x): x is HelpSection => !!x)
}
