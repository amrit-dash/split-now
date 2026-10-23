import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react'
import { AlertCircle, ArrowRight, ChevronDown, Lightbulb, Loader2, Mic, Plus, Square, X } from 'lucide-react'
import { useFlag } from '@/hooks/useAppConfig'
import { loadParser, useQuickRun, type QuickLine } from '@/hooks/useQuickRun'
import { useVoice, useVoiceSetup } from '@/hooks/useVoice'
import type { Group } from '@/types'
import { errText } from '@/lib/errors'
import { marqueeFor } from '@/lib/fit'
import { primeAudio } from '@/lib/mic'
import { groupInText, lineFor } from '@/lib/quick-group'
import { micRelease } from '@/lib/voice'
import { GroupIcon } from '@/components/GroupIcon'
import { Select } from '@/components/Select'
import { activeMembers } from '@/lib/members'

const HINT = 'Dinner 1200 with Rahul, I paid'
const HINT_FIRST = 'Goa trip with Rahul and Priya'
/** The picker's "New group…" entry (never a real group id: those are Firestore ids). */
const NEW_GROUP = '__new'

/**
 * Quick add, in the Create sheet: one line ("dinner 1200 with Rahul and Priya, I paid"), typed or
 * spoken, opens the expense form prefilled. Nothing is saved from here. The work (the phone's
 * grammar, Quick add with AI, a new group, an open item, a plain answer for a line it can't act on)
 * is src/hooks/useQuickRun.ts, which holding + to talk uses too. The line can name its group ("in
 * Goa trip", "@flat") or ask for a new one ("in a new group Bali trip"); src/lib/quick-group.ts reads
 * that as you type and the composer's group chip follows it.
 *
 * Voice (src/hooks/useVoice.ts): the mic shows only where someone can be heard (the phone's own
 * recognition, or AI transcription they chose). Tap it to start and tap again to stop, or hold it
 * while talking and let go. The words land in the box and wait for send; while AI writes a
 * recording down, a spinner sits in the box.
 *
 * Layout: one outlined composer (the field, then a row with where the line goes on the left and
 * the mic and send buttons on the right), and a status line under it while AI works.
 */
export function QuickAdd({
  groups,
  defaultGroupId,
  onLeave,
  initialText = '',
  testId = 'quick-add',
  onStatus,
}: {
  /**
   * the groups the line can go into (shared ones; the personal wallet has nobody to split with).
   * None yet: every line starts a group (noGroupsPrefill), or with AI one is set up from it.
   */
  groups: Group[]
  defaultGroupId?: string
  /** called just before it navigates away (the Create sheet closes) */
  onLeave?: () => void
  /** a line already said (holding + when it needs a choice made here, such as which group) */
  initialText?: string
  testId?: string
  /**
   * What it is doing right now ("Working it out…"), for the card to show in its top-right corner
   * (owner, 23 Oct 2026). Without it the line shows under the box.
   */
  onStatus?: (status: string | null) => void
}) {
  const enabled = useFlag('quickAdd')
  const [text, setText] = useState(initialText)
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id)
  /** 'ai': Quick add with AI is working the line out; 'read': the gap-filling reader */
  const [busy, setBusy] = useState<'ai' | 'read' | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  /** something went wrong (the microphone, transcription): under the box, in red, with an icon */
  const [problem, setProblem] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  /** the group words the user tapped away ("→ Goa trip" undone): the line goes to the picked group as typed */
  const [undone, setUndone] = useState<string | null>(null)
  /** the ambiguous group words the user answered by picking a group */
  const [answered, setAnswered] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLDivElement>(null)
  const voiced = useRef(false)
  /** when the finger went down on the mic (null: not a press that started listening) */
  const pressed = useRef<number | null>(null)
  const { engine, offer } = useVoiceSetup()
  const voice = useVoice({
    engine,
    onText: (t) => {
      voiced.current = true
      setText(t)
    },
    onError: (m) => setProblem(errText(m)),
    // Allowed after the press ended to answer the prompt: ready for the real one.
    onReady: () => setAnswer('Microphone on. Tap the mic and speak.'),
    aiFallback: offer.ai,
  })
  const listening = voice.state === 'listening'
  const transcribing = voice.state === 'transcribing'
  const run = useQuickRun({ groups, onLeave, onBusy: setBusy })
  const status = busy === 'ai' ? 'Working it out…' : busy === 'read' ? 'Reading your line…' : transcribing ? 'Writing it down…' : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the status changes
  useEffect(() => onStatus?.(status), [status])

  const picked: Group | undefined = groups.find((g) => g.id === groupId) ?? groups[0]
  const people = useMemo(() => (picked ? Object.values(activeMembers(picked.members)).map((m) => m.name) : []), [picked])
  const named = useMemo(() => groupInText(text, groups, people), [text, groups, people])
  // What the line says about its group, after the user's answers: where it goes, and the words left to read.
  const { match, which, fresh, target, line } = lineFor({ text, named, groups, picked, undone, answered })

  // After voice: caret and scroll at the end, so the whole sentence can be read back before sending.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the heard text changes
  useLayoutEffect(() => {
    const el = input.current
    if (!el || !voiced.current) return
    el.setSelectionRange(el.value.length, el.value.length)
    el.scrollLeft = el.scrollWidth
  }, [text])
  // A line handed over (holding + when it needs a choice here): ready to check and send.
  useEffect(() => {
    if (initialText) void loadParser()
  }, [initialText])

  if (!enabled) return null
  const hint = picked ? HINT : HINT_FIRST

  const q = (): QuickLine => ({ text, line, target, picked, fresh, named })
  const done = (o: Awaited<ReturnType<typeof run.send>>) => {
    if (o.kind === 'left') setText('')
    else if (o.kind === 'answer') setAnswer(o.text)
  }
  const createGroup = async (name: string) => done(await run.createGroup(name, q()))

  /** Two groups fit the words: the picker reads "Which group?"; sending opens it so the user says which. */
  const askWhich = () => {
    const btn = picker.current?.querySelector<HTMLButtonElement>('button[role="combobox"]')
    btn?.focus()
    btn?.click()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || transcribing || !text.trim()) return
    setProblem(null)
    if (listening) void stopMic()
    if (which) askWhich()
    else void run.send(q()).then(done)
  }

  const pick = (v: string) => {
    if (v === NEW_GROUP) {
      void createGroup(fresh?.name ?? '')
      return
    }
    setGroupId(v)
    if (named.kind === 'ambiguous') setAnswered(named.phrase)
  }

  const startMic = async () => {
    setAnswer(null)
    setProblem(null)
    voiced.current = true
    await voice.start()
  }
  const stopMic = async () => {
    const r = await voice.stop()
    // The browser's prompt took the press: say what to do, not an error ("Microphone on" follows).
    if (r.asking) return setAnswer('Allow the microphone when asked. Then tap the mic and speak.')
    if (r.first && !r.text) return setAnswer('Microphone on. Tap the mic and speak.')
    if (r.error) setProblem(errText(r.error))
    else if (r.text) {
      voiced.current = true
      setText(r.text)
    }
    // Not sent straight away: the field keeps the sentence, caret at the end, for a read-through.
    if (!r.error) input.current?.focus()
    requestAnimationFrame(() => {
      voiced.current = false
    })
  }
  // The mic: a tap starts and the next tap stops; held while talking, letting go stops (src/lib/voice.ts micRelease).
  const micDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    primeAudio()
    if (voice.state === 'listening') {
      pressed.current = null
      void stopMic()
      return
    }
    if (voice.state !== 'idle') return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pressed.current = e.timeStamp
    void startMic()
  }
  const micUp = (e: PointerEvent<HTMLButtonElement>) => {
    const at = pressed.current
    pressed.current = null
    if (at !== null && micRelease(e.timeStamp - at) === 'stop') void stopMic()
  }

  const showHint = !text && !focused && !listening && !transcribing
  const chip = 'flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full py-1.5 text-sm font-semibold'

  return (
    <form onSubmit={submit} data-testid={testId} aria-busy={busy || transcribing ? true : undefined}>
      {/* One outlined composer: the field on top, where it goes and the buttons underneath. */}
      <div
        className={`rounded-2xl bg-white ring-1 ring-slate-200 transition-shadow has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand-500 dark:bg-ink-900 dark:ring-white/10 dark:has-[input:focus-visible]:ring-brand-400 ${busy ? 'opacity-90' : ''}`}
      >
        <div className="relative">
          <input
            ref={input}
            id={`${testId}-input`}
            aria-label="Quick add"
            className={`block w-full rounded-t-2xl bg-transparent px-4 pb-1.5 pt-3.5 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-100 ${showHint ? 'placeholder:text-transparent' : ''} ${transcribing ? 'pr-11' : ''}`}
            placeholder={transcribing ? 'Writing it down…' : listening ? 'Listening…' : hint}
            value={text}
            onChange={(e) => {
              voiced.current = false
              setAnswer(null)
              setText(e.target.value)
            }}
            onFocus={() => {
              setFocused(true)
              void loadParser()
            }}
            onBlur={() => setFocused(false)}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="go"
            disabled={!!busy || transcribing}
            data-testid={`${testId}-input`}
          />
          {showHint && <Hint text={hint} />}
          {/* AI is writing the recording down: a spinner in the box, where the words will land. */}
          {transcribing && (
            <span className="absolute bottom-1.5 right-3 top-3.5 flex items-center text-brand-600 dark:text-brand-300" data-testid={`${testId}-transcribing`}>
              <Loader2 size={18} className="animate-spin" aria-hidden />
              <span className="sr-only">Writing down what you said</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
          <div ref={picker} className="flex min-w-0 flex-1 items-center">
            {fresh ? (
              <button
                type="button"
                onClick={() => void createGroup(fresh.name)}
                disabled={!!busy}
                aria-label={fresh.name ? `Create a group called ${fresh.name}, then open the expense form` : 'Create a new group, then open the expense form'}
                className={`${chip} bg-brand-50 px-3 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200`}
                data-testid={`${testId}-new-group`}
              >
                <Plus size={16} className="shrink-0" aria-hidden />
                <span className="truncate">{fresh.name ? `Create “${fresh.name}”` : 'Create a new group'}</span>
              </button>
            ) : !picked ? (
              <span className={`${chip} text-muted px-2 font-medium`} data-testid={`${testId}-first-group`}>
                <Plus size={16} className="shrink-0" aria-hidden />
                <span className="truncate">Starts your first group</span>
              </span>
            ) : match && match.id !== picked.id ? (
              <button
                type="button"
                onClick={() => setUndone(named.kind === 'match' ? named.phrase : null)}
                disabled={!!busy}
                aria-label={`Going into ${match.name}, named in your line. Use ${picked.name} instead`}
                className={`${chip} bg-brand-50 pl-1.5 pr-2.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200`}
                data-testid={`${testId}-group-chip`}
              >
                <span className="mr-1 flex shrink-0">
                  <GroupIcon emoji={match.emoji} group={match} size={24} />
                </span>
                <span className="truncate">{match.name}</span>
                <X size={15} className="shrink-0 opacity-70" aria-hidden />
              </button>
            ) : (
              <Select
                aria-label="Group for the quick add"
                value={which ? '' : picked.id}
                placeholder="Which group?"
                onChange={pick}
                disabled={!!busy}
                triggerClassName={`${chip} !w-auto bg-slate-100 pl-1.5 pr-2.5 text-slate-700 hover:bg-slate-200/70 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 ${which ? 'ring-2 ring-amber-400' : ''}`}
                renderTrigger={(sel, open) => (
                  <>
                    {/* a little more room after the group's picture than between the words */}
                    {sel?.icon ? <span className="mr-1 flex shrink-0">{sel.icon}</span> : <span className="w-1" aria-hidden />}
                    <span className="text-muted shrink-0 font-medium">Into</span>
                    <span className="truncate">{sel ? sel.text : 'Which group?'}</span>
                    <ChevronDown size={16} className={`shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                  </>
                )}
                options={[
                  ...groups.map((g) => ({
                    value: g.id,
                    label: g.name,
                    text: g.name,
                    icon: <GroupIcon emoji={g.emoji} group={g} size={24} />,
                    // Every option has a line (New group… explains itself below), so the list never shows some lines and not others.
                    hint: which && named.kind === 'ambiguous' && named.ids.includes(g.id) ? `Fits your line · ${g.currency}` : g.currency,
                  })),
                  {
                    value: NEW_GROUP,
                    label: 'New group…',
                    text: 'New group',
                    hint: 'Adds the people you named',
                    icon: (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                        <Plus size={14} strokeWidth={2.6} />
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </div>
          {engine && (
            <button
              type="button"
              onPointerDown={micDown}
              onPointerUp={micUp}
              onPointerCancel={micUp}
              // Enter and Space (a click with no pointer): the same toggle as a tap.
              onClick={(e) => {
                if (e.detail !== 0) return
                if (listening) void stopMic()
                else if (voice.state === 'idle') void startMic()
              }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!!busy || transcribing}
              aria-pressed={listening}
              aria-label={listening ? 'Stop listening' : 'Speak the expense (tap, or hold while you talk)'}
              className={`flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center rounded-full transition disabled:opacity-40 ${listening ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400' : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/5'}`}
              style={{ WebkitTouchCallout: 'none' }}
              data-testid={`${testId}-mic`}
            >
              {listening ? <Square size={16} aria-hidden /> : <Mic size={20} aria-hidden />}
            </button>
          )}
          <button
            type="submit"
            disabled={!!busy || transcribing || !text.trim()}
            aria-label={fresh || !picked ? 'Set up the group, then open the expense form' : 'Open the expense form with this'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-on-fill shadow-sm transition active:scale-95 disabled:opacity-40 disabled:shadow-none"
            data-testid={`${testId}-go`}
          >
            {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ArrowRight size={20} aria-hidden />}
          </button>
        </div>
      </div>
      <div role="status" aria-live="polite" className="empty:hidden" data-testid={`${testId}-status`}>
        {status && !onStatus ? (
          <span className="text-muted mt-2 flex items-center gap-1.5 px-1 text-xs">
            <Loader2 size={14} className="animate-spin" aria-hidden /> {status}
          </span>
        ) : problem ? (
          <span
            className="mt-2 flex items-center gap-2.5 rounded-2xl bg-rose-50 px-3 py-2 text-xs leading-snug text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"
            data-testid={`${testId}-problem`}
          >
            <AlertCircle size={16} className="shrink-0" aria-hidden />
            {problem}
          </span>
        ) : answer ? (
          <span
            className="mt-2 flex items-center gap-2.5 rounded-2xl bg-brand-50 px-3 py-2 text-xs leading-snug text-brand-900 dark:bg-brand-500/10 dark:text-brand-100"
            data-testid={`${testId}-answer`}
          >
            <Lightbulb size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
            {answer}
          </span>
        ) : null}
      </div>
    </form>
  )
}

/**
 * The empty field's hint, drawn over the input (whose own placeholder is made transparent, so
 * screen readers still get it): when wider than the field it drifts to its end and back
 * (`hint-marquee` in index.css); with reduced motion it stays put, cut off with an ellipsis.
 */
function Hint({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null)
  const line = useRef<HTMLSpanElement>(null)
  const [run, setRun] = useState<{ shift: number; seconds: number } | null>(null)
  useLayoutEffect(() => {
    const b = box.current
    const l = line.current
    if (!b || !l) return
    const measure = () => setRun(marqueeFor(l.scrollWidth, b.clientWidth))
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(b)
    return () => ro?.disconnect()
  }, [])
  // Same colour as the input's placeholder, which this stands in for.
  return (
    <span
      ref={box}
      aria-hidden
      className="pointer-events-none absolute inset-x-4 bottom-1.5 top-3.5 flex items-center overflow-hidden whitespace-nowrap text-slate-400"
    >
      <span
        ref={line}
        className={run ? 'hint-marquee block shrink-0' : 'block min-w-0 truncate'}
        style={run ? ({ '--mq-shift': `-${run.shift}px`, '--mq-dur': `${run.seconds}s` } as CSSProperties) : undefined}
      >
        {text}
      </span>
    </span>
  )
}
