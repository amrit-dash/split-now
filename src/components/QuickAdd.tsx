import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Mic, Plus, Square, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { useMerchantMemory } from '@/hooks/useMerchants'
import type { Group } from '@/types'
import { aiScanEnabled, aiScanPossible } from '@/lib/ai'
import { errText } from '@/lib/errors'
import { marqueeFor } from '@/lib/fit'
import { guessGroup } from '@/lib/groupTypes'
import { todayISO } from '@/lib/id'
import { suggestCategory } from '@/lib/merchants'
import type { NlContext } from '@/lib/nl-expense'
import { pending } from '@/lib/pending'
import { groupInText } from '@/lib/quick-group'
import { listenOnce, speechSupported, type SpeechSession } from '@/lib/speech'
import { GroupIcon } from '@/components/GroupIcon'
import { Select } from '@/components/Select'
import { useToast } from '@/components/Toast'

// The parser loads on first focus or submit, not with the Create sheet (it is only needed once someone types).
const loadParser = () => import('@/lib/nl-expense')

const HINT = 'Dinner 1200 with Rahul, I paid'
/** The picker's "New group…" entry (never a real group id: those are Firestore ids). */
const NEW_GROUP = '__new'

/**
 * Quick add, in the Create sheet: one line ("dinner 1200 with Rahul and Priya, I paid"), typed or
 * spoken, opens the expense form prefilled. Nothing is saved from here. The local grammar
 * (src/lib/nl-expense.ts) does the reading; when it is unsure and AI reading is on, Gemini's
 * text reader fills the gaps, and the form still opens for a look either way. The line can name
 * its group ("in Goa trip", "@flat") or ask for a new one ("in a new group Bali trip"); that part
 * is read by src/lib/quick-group.ts as you type and shown as a chip next to the picker.
 */
export function QuickAdd({
  groups,
  defaultGroupId,
  onLeave,
  testId = 'quick-add',
}: {
  /** the groups the line can go into (shared ones; the personal wallet has nobody to split with) */
  groups: Group[]
  defaultGroupId?: string
  /** called just before it navigates away (the Create sheet closes) */
  onLeave?: () => void
  testId?: string
}) {
  const enabled = useFlag('quickAdd')
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const memory = useMerchantMemory()
  const [text, setText] = useState('')
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [focused, setFocused] = useState(false)
  /** the group words the user tapped away ("→ Goa trip" undone): the line goes to the picked group as typed */
  const [undone, setUndone] = useState<string | null>(null)
  /** the ambiguous group words the user answered by picking a group */
  const [answered, setAnswered] = useState<string | null>(null)
  const session = useRef<SpeechSession | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLDivElement>(null)
  const voiced = useRef(false)
  const mic = useMemo(() => speechSupported(), [])
  useEffect(() => () => session.current?.stop(), [])

  const picked = groups.find((g) => g.id === groupId) ?? groups[0]
  const people = useMemo(() => (picked ? Object.values(picked.members).map((m) => m.name) : []), [picked])
  const named = useMemo(() => groupInText(text, groups, people), [text, groups, people])

  // What the line says about its group, after the user's answers: where it goes, and the words left to read.
  const match = named.kind === 'match' && named.phrase !== undone ? groups.find((g) => g.id === named.id) : undefined
  const which = named.kind === 'ambiguous' && named.phrase !== answered
  const fresh = named.kind === 'new' ? named : null
  const target = match ?? picked
  const line = match || (named.kind === 'ambiguous' && !which) ? (named as { text: string }).text : text

  // After voice: caret and scroll at the end, so the whole sentence can be read back before sending.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the heard text changes
  useLayoutEffect(() => {
    const el = input.current
    if (!el || !voiced.current) return
    el.setSelectionRange(el.value.length, el.value.length)
    el.scrollLeft = el.scrollWidth
  }, [text])

  if (!enabled || !picked) return null

  const go = async () => {
    const t = text.trim()
    if (!t) return
    const order = memberOrder(target)
    const me = myMemberId(target, user.uid) ?? order[0]
    const ctx: NlContext = { members: order.map((id) => ({ id, name: target.members[id].name })), me, currency: target.currency, today: todayISO() }
    const { mergeAiParse, parseNlExpense, toQuickPrefill } = await loadParser()
    let parse = parseNlExpense(line, ctx)
    let category = parse.description ? suggestCategory(parse.description, { memory }) : null
    // Unsure (no amount, or a name nobody matched): let Gemini have a go when the user allows AI reading.
    if (parse.confidence !== 'high' && aiScanPossible() && aiScanEnabled()) {
      setBusy(true)
      try {
        const r = await repo.parseTextAi(line, { members: ctx.members.map((m) => m.name), currency: target.currency, today: ctx.today! })
        if (r && !r.unavailable && r.expense) {
          const merged = mergeAiParse(parse, r.expense, ctx)
          parse = merged
          category = merged.category ?? (merged.description ? suggestCategory(merged.description, { memory }) : null)
        }
      } catch (e) {
        console.warn('Quick add AI read failed', e)
      } finally {
        setBusy(false)
      }
    }
    pending.quick = { groupId: target.id, prefill: toQuickPrefill(parse, t, category) }
    if (parse.amount === undefined) toast('Couldn’t find an amount in that. Add it in the form.')
    else if (parse.unmatched.length) toast(`Didn’t recognise ${parse.unmatched.join(', ')}. Check who’s in the split.`)
    setText('')
    onLeave?.()
    nav(`/add?group=${encodeURIComponent(target.id)}&quick=1`)
  }

  /**
   * A new group first: GroupForm opens with the name filled in, and once it is made the expense
   * form opens with the line (amount, words and date now; the people once the group has members,
   * read again by ExpenseForm). Read locally only: the AI reader needs the group's names.
   */
  const createGroup = async (name: string) => {
    const t = text.trim()
    const qs = new URLSearchParams({ next: 'add' })
    if (t) {
      const rest = fresh ? fresh.text : line
      const { parseNlExpense, toQuickPrefill } = await loadParser()
      const parse = parseNlExpense(rest, {
        members: [{ id: user.uid, name: profile.displayName }],
        me: user.uid,
        currency: profile.currency,
        today: todayISO(),
      })
      const category = parse.description ? suggestCategory(parse.description, { memory }) : null
      pending.quick = { prefill: toQuickPrefill(parse, t, category), line: rest }
      qs.set('quick', '1')
    }
    if (name) {
      qs.set('name', name)
      const type = guessGroup(name)?.type
      if (type) qs.set('type', type)
    }
    setText('')
    onLeave?.()
    nav(`/groups/new?${qs}`)
  }

  /** Two groups fit the words: the picker reads "Which group?"; sending opens it so the user says which. */
  const askWhich = () => {
    const btn = picker.current?.querySelector<HTMLButtonElement>('button[role="combobox"]')
    btn?.focus()
    btn?.click()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || !text.trim()) return
    if (fresh) void createGroup(fresh.name)
    else if (which) askWhich()
    else void go()
  }

  const pick = (v: string) => {
    if (v === NEW_GROUP) {
      void createGroup(fresh?.name ?? '')
      return
    }
    setGroupId(v)
    if (named.kind === 'ambiguous') setAnswered(named.phrase)
  }

  const toggleMic = () => {
    if (listening) {
      session.current?.stop()
      return
    }
    voiced.current = true
    const s = listenOnce({
      onText: (t) => setText(t),
      onEnd: (err) => {
        setListening(false)
        session.current = null
        if (err) toast(errText(err), 'err')
        // Not sent straight away: the field keeps the sentence, caret at the end, for a read-through.
        else input.current?.focus()
        requestAnimationFrame(() => {
          voiced.current = false
        })
      },
    })
    if (!s) {
      voiced.current = false
      return
    }
    session.current = s
    setListening(true)
  }

  const showHint = !text && !focused && !listening

  return (
    <form onSubmit={submit} data-testid={testId} aria-busy={busy || undefined}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            ref={input}
            id={`${testId}-input`}
            aria-label="Quick add"
            className={`input !py-2.5 ${showHint ? 'placeholder:text-transparent' : ''}`}
            placeholder={listening ? 'Listening…' : HINT}
            value={text}
            onChange={(e) => {
              voiced.current = false
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
            disabled={busy}
            data-testid={`${testId}-input`}
          />
          {showHint && <Hint text={HINT} />}
        </div>
        {mic && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={busy}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Speak the expense'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${listening ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200'}`}
          >
            {listening ? <Square size={18} aria-hidden /> : <Mic size={20} aria-hidden />}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label={fresh ? 'Create the group, then open the expense form' : 'Open the expense form with this'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
          data-testid={`${testId}-go`}
        >
          {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ArrowRight size={20} aria-hidden />}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>Into</span>
        <div ref={picker} className="min-w-0">
          <Select
            aria-label="Group for the quick add"
            size="sm"
            value={which ? '' : picked.id}
            placeholder="Which group?"
            onChange={pick}
            options={[
              ...groups.map((g) => ({
                value: g.id,
                label: g.name,
                text: g.name,
                icon: <GroupIcon emoji={g.emoji} size={22} />,
                hint: which && named.kind === 'ambiguous' && named.ids.includes(g.id) ? 'Fits your line' : undefined,
              })),
              {
                value: NEW_GROUP,
                label: 'New group…',
                text: 'New group',
                icon: (
                  <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    <Plus size={14} strokeWidth={2.6} />
                  </span>
                ),
              },
            ]}
          />
        </div>
        {match && match.id !== picked.id && (
          <button
            type="button"
            onClick={() => setUndone(named.kind === 'match' ? named.phrase : null)}
            aria-label={`Going into ${match.name}, named in your line. Use ${picked.name} instead`}
            className="flex min-h-9 min-w-0 items-center gap-1 rounded-full bg-brand-50 py-1.5 pl-3 pr-2 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
            data-testid={`${testId}-group-chip`}
          >
            <span className="truncate">→ {match.name}</span>
            <X size={14} className="shrink-0 opacity-70" aria-hidden />
          </button>
        )}
        {fresh && (
          <button
            type="button"
            onClick={() => void createGroup(fresh.name)}
            aria-label={fresh.name ? `Create a group called ${fresh.name}, then open the expense form` : 'Create a new group, then open the expense form'}
            className="flex min-h-9 min-w-0 items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
            data-testid={`${testId}-new-group`}
          >
            <Plus size={14} className="shrink-0" aria-hidden />
            <span className="truncate">{fresh.name ? `Create “${fresh.name}”` : 'Create a new group'}</span>
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Opens the form filled in; nothing is saved until you check it.</p>
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
  // Same colour as the input's placeholder (the `input` utility), which this stands in for.
  return (
    <span
      ref={box}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-4 right-4 flex items-center overflow-hidden whitespace-nowrap text-slate-400"
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
