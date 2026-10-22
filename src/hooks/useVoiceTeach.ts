import { useEffect, useState } from 'react'
import { resolveTeach, TEACH_START, teachNow, teachShown, teachVisit, type TeachBubble, type TeachState } from '@/lib/voice-teach'

const KEY = 'splitnow-voice-teach'
/** The screen shows itself first; the bubble rises a moment later, so it reads as a tip, not as part of the page. */
const RISE_DELAY_MS = 1400

function load(): TeachState {
  try {
    return resolveTeach(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return TEACH_START
  }
}
function save(s: TeachState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode: it may show again next time */
  }
}

/** One visit per start of the app, however often the tab bar remounts. */
let counted = false

/**
 * The bubble from + that teaches hold to talk (src/lib/voice-teach.ts), once it is due: on a
 * screen with the tab bar, never over a form, never while another banner holds the spot, and never
 * once the account has tried it. Shown once per due visit: it counts as shown as soon as it rises.
 */
export function useVoiceTeach(o: { voice: boolean; tried: boolean; blocked: boolean }): { bubble: TeachBubble | null; close: () => void } {
  const [bubble, setBubble] = useState<TeachBubble | null>(null)
  useEffect(() => {
    if (counted) return
    counted = true
    save(teachVisit(load()))
  }, [])
  const { voice, tried, blocked } = o
  useEffect(() => {
    if (!voice || tried || blocked) return
    const t = setTimeout(() => {
      const s = load()
      const b = teachNow({ state: s, tried, voice })
      if (!b) return
      save(teachShown(s, b.kind, Math.random()))
      setBubble(b)
    }, RISE_DELAY_MS)
    return () => clearTimeout(t)
  }, [voice, tried, blocked])
  // Tried it (on this device or another): the bubble goes.
  useEffect(() => {
    if (tried) setBubble(null)
  }, [tried])
  return { bubble, close: () => setBubble(null) }
}
