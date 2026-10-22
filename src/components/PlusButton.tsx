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
import { barHeights } from '@/lib/voice'
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
 * with a buzz and a soft blip, accent bars above it follow the voice and a ripple spreads from it.
 * Letting go: the bars fade, a spinner sits on + (it takes no taps until done), then Quick add's
 * result: the screen it opened, or a plain answer in a bubble. A line that needs a choice (two
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
  const voice = useVoice({
    engine,
    meter: true,
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
    go('listening')
    if (!(await voice.start())) go('idle')
  }

  const endVoice = async () => {
    if (phaseRef.current !== 'listening') return
    go('working')
    try {
      const r = await voice.stop()
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
      const o = await run.send({ text, line: l.line, target: l.target, picked, fresh: l.fresh, named })
      if (o.kind === 'answer') setAnswer({ kind: 'answer', text: o.text })
    } finally {
      go('idle')
    }
  }

  const press = useLongPress({
    onDown: primeAudio,
    onTap: () => {
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
  })

  const listening = phase === 'listening'
  const working = phase === 'working'
  return (
    <>
      {/* While held: a soft ring spreads from + (still with reduced motion), under the button. */}
      {listening && (
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%]">
          <span className="voice-ripple absolute inset-0 rounded-full border-2 border-brand-400/70 dark:border-brand-300/60" />
          <span className="voice-ripple voice-ripple-late absolute inset-0 rounded-full border-2 border-fill-to-400/60" />
        </span>
      )}
      <VoiceBars on={listening} level={level} />
      <button
        type="button"
        {...press}
        data-testid="nav-create"
        data-voice={phase}
        className="fab-ring absolute left-1/2 top-0 flex h-[3.75rem] w-[3.75rem] -translate-x-1/2 -translate-y-[45%] touch-none select-none items-center justify-center overflow-hidden rounded-full text-on-fill transition active:scale-95"
        style={{ WebkitTouchCallout: 'none' }}
        aria-label={
          listening
            ? 'Listening. Let go when you’re done'
            : working
              ? 'Working it out'
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

/** Four or five accent bars above + that follow the voice (heights written every frame, no re-render); they fade when it ends. */
function VoiceBars({ on, level }: { on: boolean; level: { current: number } }) {
  const bars = useRef<Array<HTMLSpanElement | null>>([])
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (on) {
      setShown(true)
      let raf = 0
      const tick = (t: number) => {
        const h = barHeights(level.current, t)
        bars.current.forEach((b, i) => {
          if (b) b.style.transform = `scaleY(${h[i]})`
        })
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }
    // Let go: they settle and fade, then leave.
    for (const b of bars.current) if (b) b.style.transform = 'scaleY(0.15)'
    const t = setTimeout(() => setShown(false), 260)
    return () => clearTimeout(t)
  }, [on, level])
  if (!shown && !on) return null
  return (
    <span
      aria-hidden
      data-testid="voice-bars"
      className={`pointer-events-none absolute bottom-[calc(100%+2.25rem)] left-1/2 flex h-10 -translate-x-1/2 items-end gap-[3px] rounded-full bg-white/95 px-3 py-1.5 shadow-lg shadow-slate-900/15 ring-1 ring-slate-900/5 backdrop-blur dark:bg-ink-800/95 dark:shadow-black/40 dark:ring-white/10 transition-opacity duration-200 ${on ? 'opacity-100' : 'opacity-0'}`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el
          }}
          className="voice-bar block h-full w-[5px] origin-bottom rounded-full bg-gradient-to-t from-fill to-fill-to-400 shadow-sm"
          style={{ transform: 'scaleY(0.15)' }}
        />
      ))}
    </span>
  )
}

/** A speech bubble rising from +: the teaching tip, or Quick add's answer. ✕ or a sideways swipe closes it. */
function PlusBubble({ bubble, onClose }: { bubble: Bubble; onClose: () => void }) {
  const swipe = useSwipeDismiss(onClose)
  return (
    <div
      className="voice-bubble fixed inset-x-4 bottom-[calc(var(--nav-h)+1.9rem)] z-40 mx-auto w-fit max-w-[18rem]"
      role="status"
      data-testid={bubble.kind === 'teach' ? 'voice-teach' : 'voice-answer'}
    >
      <div
        {...swipe.bind}
        className="relative flex items-start gap-1 rounded-2xl bg-white py-2.5 pl-3.5 pr-1 text-sm shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5 dark:bg-ink-800 dark:shadow-black/40 dark:ring-white/10"
      >
        <span className="min-w-0 flex-1 py-0.5">
          {bubble.title && <span className="block text-xs font-bold text-brand-700 dark:text-brand-300">{bubble.title}</span>}
          <span className="block font-semibold leading-snug text-slate-800 dark:text-slate-100">{bubble.text}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
          aria-label="Close"
          data-testid="voice-bubble-close"
        >
          <X size={16} aria-hidden />
        </button>
        {/* the tail, pointing down at + */}
        <span
          aria-hidden
          className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[3px] bg-white ring-1 ring-slate-900/5 [clip-path:polygon(100%_0,100%_100%,0_100%)] dark:bg-ink-800 dark:ring-white/10"
        />
      </div>
    </div>
  )
}
