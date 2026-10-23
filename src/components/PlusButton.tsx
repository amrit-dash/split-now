import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Plus, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useLongPress } from '@/hooks/useLongPress'
import { useQuickRun } from '@/hooks/useQuickRun'
import { usePickableGroups } from '@/hooks/useVault'
import { useVoice, useVoiceSetup } from '@/hooks/useVoice'
import { useVoiceTeach } from '@/hooks/useVoiceTeach'
import { useWhatsNew } from '@/hooks/useWhatsNew'
import { useSwipeDismiss } from '@/hooks/useSwipeDismiss'
import { liveTripFor } from '@/lib/capture'
import { todayISO } from '@/lib/id'
import { activeMembers } from '@/lib/members'
import { primeAudio } from '@/lib/mic'
import { plusTap } from '@/lib/plus-target'
import { groupInText, lineFor } from '@/lib/quick-group'
import { lastGroup } from '@/lib/recents'
import { barHeights, holdDrag, isDoubleTap, liveTail } from '@/lib/voice'
import { whatsNewMayShow } from '@/lib/whats-new-spot'
import { Aurora } from './Aurora'
import { MicIcon } from './icons'
import { useToast } from './Toast'

type Phase = 'idle' | 'listening' | 'working'
type Bubble = { title?: string; text: string; kind: 'teach' | 'answer' }

const NOT_HEARD = 'Didn’t catch that. Hold + again and talk, a little closer to the phone.'

/**
 * The tab bar's + (src/lib/plus-target.ts): a tap does what it always did (Add expense inside a
 * group, the Create sheet elsewhere). Press and hold talks to Quick add, wherever voice works
 * (src/hooks/useVoice.ts; without it a hold opens the Create sheet, as before): + turns into a mic
 * with a buzz and a soft blip, and a pill rises above it: five bars, centred, that grow up and down
 * with the voice; once words are heard (the phone's recognition) it widens and they run beside the
 * bars. Sliding the finger away turns the pill to "Let go to cancel". Letting go: the pill fades, a
 * spinner sits on + (a double tap stops it), then Quick add's result: the screen it opened, or a
 * plain answer in a bubble. A line that needs a choice (two
 * groups fit) opens the Create sheet with the line in Quick add. Bubbles from + also teach hold to
 * talk (src/lib/voice-teach.ts) until the account has tried it.
 */
export function PlusButton({ groupId, onSheet }: { groupId?: string; onSheet: (initialText?: string) => void }) {
  const loc = useLocation()
  const nav = useNavigate()
  const toast = useToast()
  const { user, profile } = useMe()
  const { engine } = useVoiceSetup()
  const allGroups = usePickableGroups()
  // Shared, open groups only, as in the Create sheet: the personal wallet has nobody to split with.
  const groups = useMemo(() => (allGroups ?? []).filter((g) => !g.archived && g.type !== 'personal'), [allGroups])
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const go = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }
  const [answer, setAnswer] = useState<Bubble | null>(null)
  const level = useRef(0)
  /** the words heard so far (the phone's recognition; AI has none until it's done) */
  const [words, setWords] = useState('')
  /** the held finger slid away: letting go cancels */
  const [cancel, setCancel] = useState(false)
  const cancelRef = useRef(false)
  const arm = (v: boolean) => {
    if (cancelRef.current === v) return
    cancelRef.current = v
    setCancel(v)
    try {
      navigator.vibrate?.(8)
    } catch {
      /* not offered */
    }
  }
  /** stopped with a double tap while it worked: nothing opens */
  const stopped = useRef(false)
  const lastTap = useRef<number | null>(null)
  const voice = useVoice({
    engine,
    meter: true,
    onText: setWords,
    onLevel: (l) => {
      level.current = l
    },
    onError: (m) => {
      go('idle')
      toast(m, 'err')
    },
  })
  const run = useQuickRun({ groups, onBusy: () => {} })
  const { banner } = useWhatsNew()
  const teach = useVoiceTeach({
    voice: !!engine,
    tried: !!profile.voiceTried,
    blocked: phase !== 'idle' || !!banner || !whatsNewMayShow({ pathname: loc.pathname, hasNav: true }),
  })
  const bubble: Bubble | null = answer ?? (teach.bubble ? { kind: 'teach', title: teach.bubble.title, text: teach.bubble.text } : null)
  const closeBubble = () => {
    setAnswer(null)
    teach.close()
  }
  // A new screen: an answer about the last line no longer applies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every route change by design
  useEffect(() => setAnswer(null), [loc.pathname])

  const startVoice = async () => {
    closeBubble()
    // The first hold for voice, on any device: the teaching stops everywhere (no need to finish).
    if (!profile.voiceTried) void repo.markVoiceTried(user.uid)
    setWords('')
    arm(false)
    stopped.current = false
    go('listening')
    if (!(await voice.start())) go('idle')
  }

  const endVoice = async () => {
    if (phaseRef.current !== 'listening') return
    // Slid away before letting go: nothing was meant.
    if (cancelRef.current) {
      voice.cancel()
      arm(false)
      go('idle')
      return toast('Cancelled')
    }
    go('working')
    try {
      const r = await voice.stop()
      if (stopped.current) return
      if (r.error) return toast(r.error, 'err')
      const text = r.text.trim()
      if (!text) return setAnswer({ kind: 'answer', text: NOT_HEARD })
      // Still loading the groups: Quick add in the sheet takes it from here.
      if (!allGroups) return onSheet(text)
      const defaultGroupId = (groupId && groups.some((g) => g.id === groupId) ? groupId : undefined) ?? liveTripFor(groups, todayISO()) ?? lastGroup()
      const picked = groups.find((g) => g.id === defaultGroupId) ?? groups[0]
      const people = picked ? Object.values(activeMembers(picked.members)).map((m) => m.name) : []
      const named = groupInText(text, groups, people)
      const l = lineFor({ text, named, groups, picked })
      // Two groups fit the words: the person says which, in Quick add, with the line in it.
      if (l.which) return onSheet(text)
      const o = await run.send({ text, line: l.line, target: l.target, picked, fresh: l.fresh, named, stopped: () => stopped.current })
      if (o.kind === 'answer' && !stopped.current) setAnswer({ kind: 'answer', text: o.text })
    } finally {
      go('idle')
    }
  }

  const press = useLongPress({
    onDown: primeAudio,
    onTap: () => {
      // Working it out: a double tap stops it (the first tap only arms it).
      if (phaseRef.current === 'working') {
        const now = Date.now()
        if (isDoubleTap(lastTap.current, now)) {
          lastTap.current = null
          stopped.current = true
          voice.cancel()
          go('idle')
          toast('Stopped')
        } else lastTap.current = now
        return
      }
      if (phaseRef.current !== 'idle') return
      closeBubble()
      const a = plusTap(loc.pathname)
      if (a.kind === 'add') nav(a.to)
      else onSheet()
    },
    // Without voice here, a hold opens the Create sheet as it always did.
    onHold: () => {
      if (phaseRef.current !== 'idle') return
      if (engine) void startVoice()
      else onSheet()
    },
    onHoldEnd: engine ? () => void endVoice() : undefined,
    onHoldMove: (dx, dy) => {
      if (phaseRef.current === 'listening') arm(holdDrag(dx, dy) === 'cancel')
    },
  })

  const listening = phase === 'listening'
  const working = phase === 'working'
  return (
    <>
      <TalkPill on={listening} level={level} words={words} cancel={cancel} />
      <button
        type="button"
        {...press}
        data-testid="nav-create"
        data-voice={phase}
        className="fab-ring absolute left-1/2 top-0 flex h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%] touch-none select-none items-center justify-center overflow-hidden rounded-full text-on-fill transition active:scale-95"
        style={{ WebkitTouchCallout: 'none' }}
        aria-label={
          listening
            ? 'Listening. Let go when you’re done, or slide away to cancel'
            : working
              ? 'Working it out. Double tap to stop'
              : groupId
                ? engine
                  ? 'Add expense to this group (press and hold to talk)'
                  : 'Add expense to this group (press and hold for more)'
                : engine
                  ? 'Create (press and hold to talk)'
                  : 'Create'
        }
        aria-haspopup={groupId ? undefined : 'dialog'}
        aria-busy={working || undefined}
        aria-disabled={working || undefined}
      >
        <Aurora size="fab" />
        {/* white outline round the lower half, fading out towards the top */}
        <span aria-hidden className="fab-rim pointer-events-none absolute inset-0 rounded-full border border-white/55" />
        {working ? (
          <Loader2 size={26} strokeWidth={2.4} className="relative animate-spin" aria-hidden />
        ) : listening ? (
          <MicIcon size={28} solid className="relative animate-pop" aria-hidden />
        ) : (
          <Plus size={28} strokeWidth={2.6} className="relative" aria-hidden />
        )}
      </button>
      {bubble && <PlusBubble key={bubble.text} bubble={bubble} onClose={closeBubble} />}
    </>
  )
}

/** A bar at rest is a dot as wide as it is tall; at full voice it fills the 28 px row. */
const BAR_MIN = 5
const barPx = (h: number) => Math.round(BAR_MIN + Math.max(0, (h - 0.15) / 0.85) * (28 - BAR_MIN))

/**
 * The talk pill above +: five bars, centred, that grow up and down with the voice. Words heard so far
 * widen it and run on the right, wrapping to a few lines (the bars stay centred); a finger slid away turns it to "Let go to cancel". Heights are
 * written every frame (no re-render); it fades when the hold ends.
 */
function TalkPill({ on, level, words, cancel }: { on: boolean; level: { current: number }; words: string; cancel: boolean }) {
  const bars = useRef<Array<HTMLSpanElement | null>>([])
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (on) {
      setShown(true)
      let raf = 0
      const tick = (t: number) => {
        const h = barHeights(level.current, t)
        bars.current.forEach((b, i) => {
          // Real heights, not scaleY: a scaled bar squashes its round ends into corners.
          if (b) b.style.height = `${barPx(h[i])}px`
        })
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }
    // Let go: they settle to dots and fade, then leave.
    for (const b of bars.current) if (b) b.style.height = `${BAR_MIN}px`
    const t = setTimeout(() => setShown(false), 260)
    return () => clearTimeout(t)
  }, [on, level])
  if (!shown && !on) return null
  // Up to about three lines of the latest words; the pill grows to hold them, the bars stay centred.
  const text = cancel ? 'Let go to cancel' : liveTail(words, 90)
  return (
    <span
      aria-hidden
      data-testid="voice-bars"
      data-cancel={cancel || undefined}
      className={`voice-pill voice-surface pointer-events-none absolute bottom-[calc(100%+3.25rem)] left-1/2 flex min-h-12 -translate-x-1/2 items-center gap-3 overflow-hidden px-4 py-2.5 transition-opacity duration-200 ${text ? 'rounded-3xl' : 'rounded-full'} ${cancel ? 'voice-cancel' : ''} ${on ? 'opacity-100' : 'opacity-0'}`}
      style={text ? { width: 'min(20rem, calc(100vw - 2rem))' } : { maxWidth: '6rem' }}
    >
      <span className="relative flex h-7 shrink-0 items-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            ref={(el) => {
              bars.current[i] = el
            }}
            className={`voice-bar block w-[5px] rounded-full bg-gradient-to-b from-fill to-fill-to-400 ${cancel ? 'opacity-0' : ''}`}
            style={{ height: BAR_MIN }}
          />
        ))}
        {cancel && <X size={20} strokeWidth={2.6} className="absolute inset-0 m-auto text-rose-600 dark:text-rose-300" />}
      </span>
      {text && (
        <span
          className={`line-clamp-3 min-w-0 flex-1 text-sm font-semibold leading-snug ${cancel ? 'text-rose-700 dark:text-rose-200' : 'text-slate-800 dark:text-slate-100'}`}
        >
          {text}
        </span>
      )}
    </span>
  )
}

/** A speech bubble rising from +, with a gap above it: the teaching tip, or Quick add's answer. ✕ or a sideways swipe closes it. */
function PlusBubble({ bubble, onClose }: { bubble: Bubble; onClose: () => void }) {
  const swipe = useSwipeDismiss(onClose)
  return (
    <div
      className="voice-bubble fixed inset-x-3 bottom-[calc(var(--nav-h)+2.6rem)] z-40 mx-auto max-w-md"
      role="status"
      data-testid={bubble.kind === 'teach' ? 'voice-teach' : 'voice-answer'}
    >
      <div {...swipe.bind} className="voice-surface relative flex items-center gap-2 rounded-2xl py-2 pl-4 pr-1.5 text-sm">
        <span className="min-w-0 flex-1 py-1">
          {bubble.title && <span className="block text-xs font-bold text-brand-700 dark:text-brand-300">{bubble.title}</span>}
          <span className="block font-semibold leading-snug text-slate-800 dark:text-slate-100">{bubble.text}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
          aria-label="Close"
          data-testid="voice-bubble-close"
        >
          <X size={18} aria-hidden />
        </button>
        {/* the tail, pointing down at +: the same surface, clipped to its lower half */}
        <span
          aria-hidden
          className="voice-surface absolute -bottom-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[3px] !shadow-none [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        />
      </div>
    </div>
  )
}
