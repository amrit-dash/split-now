import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronDown, Loader2, Mic, Plus, Square, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { createGroup as saveGroup, memberOrder, myMemberId, useAiState } from '@/hooks/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useMerchantMemory } from '@/hooks/useMerchants'
import { useOnline } from '@/hooks/useOnline'
import type { Group } from '@/types'
import { aiScanEnabled, aiScanPossible, isQuietReason, unavailableText } from '@/lib/ai'
import { errText } from '@/lib/errors'
import { marqueeFor } from '@/lib/fit'
import { guessGroup } from '@/lib/groupTypes'
import { todayISO, uid } from '@/lib/id'
import { suggestCategory } from '@/lib/merchants'
import type { NlContext } from '@/lib/nl-expense'
import { pending } from '@/lib/pending'
import { knownPeople } from '@/lib/people'
import { buildQuickRequest, listNames, newGroupPrefill, planQuickAi } from '@/lib/quick-ai'
import { groupInText } from '@/lib/quick-group'
import { quickAiAllowed, quickRoute } from '@/lib/quick-route'
import { listenOnce, speechSupported, type SpeechSession } from '@/lib/speech'
import { useConfirm } from '@/components/ConfirmSheet'
import { GroupIcon } from '@/components/GroupIcon'
import { Select } from '@/components/Select'
import { useToast } from '@/components/Toast'
import { activeMembers } from '@/lib/members'

// The parser loads on first focus or submit, not with the Create sheet (it is only needed once someone types).
const loadParser = () => import('@/lib/nl-expense')

const HINT = 'Dinner 1200 with Rahul, I paid'
/** The picker's "New group…" entry (never a real group id: those are Firestore ids). */
const NEW_GROUP = '__new'

/**
 * Quick add, in the Create sheet: one line ("dinner 1200 with Rahul and Priya, I paid"), typed or
 * spoken, opens the expense form prefilled. Nothing is saved from here. The local grammar
 * (src/lib/nl-expense.ts) does the reading; a line it can't handle ("create a group Goa trip with
 * Rahul and Priya and add dinner 2400", src/lib/quick-route.ts) goes to Quick add with AI when the
 * person turned it on (callable quickAddAi), which can also propose a new group (confirmed first).
 * Otherwise, when the grammar is unsure and AI reading is on, Gemini's text reader fills the gaps.
 * The line can name its group ("in Goa trip", "@flat") or ask for a new one ("in a new group Bali
 * trip"); src/lib/quick-group.ts reads that as you type and the composer's group chip follows it.
 *
 * Layout: one outlined composer (the field, then a row with where the line goes on the left and
 * the mic and send buttons on the right), and a status line under it while AI works.
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
  const aiFlag = useFlag('aiQuickAdd')
  const { user, profile } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const memory = useMerchantMemory()
  const online = useOnline()
  const firebase = repo.mode === 'firebase'
  const prefs = useCapturePrefs()
  const aiState = useAiState(firebase)
  const aiStatus = useAiStatus()
  const [text, setText] = useState('')
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id)
  /** 'ai': Quick add with AI is working the line out; 'read': the gap-filling reader */
  const [busy, setBusy] = useState<'ai' | 'read' | null>(null)
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
  const people = useMemo(() => (picked ? Object.values(activeMembers(picked.members)).map((m) => m.name) : []), [picked])
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

  const aiAllowed = quickAiAllowed({
    mode: firebase ? 'firebase' : 'demo',
    flag: aiFlag,
    online,
    prefs,
    status: aiStatus,
    hasOwnKey: !!aiState?.hint,
  })

  const leave = (to: string) => {
    setText('')
    onLeave?.()
    // When it lives in the Create sheet, let the sheet close first (CreateSheet explains why).
    if (onLeave) requestAnimationFrame(() => requestAnimationFrame(() => nav(to)))
    else nav(to)
  }

  /** The line read on the phone (and, when unsure with AI reading on, gaps filled by Gemini's text reader). */
  const go = async () => {
    const t = text.trim()
    const order = memberOrder(target)
    const me = myMemberId(target, user.uid) ?? order[0]
    const ctx: NlContext = { members: order.map((id) => ({ id, name: target.members[id].name })), me, currency: target.currency, today: todayISO() }
    const { mergeAiParse, parseNlExpense, toQuickPrefill } = await loadParser()
    let parse = parseNlExpense(line, ctx)
    let category = parse.description ? suggestCategory(parse.description, { memory }) : null
    // Unsure (no amount, or a name nobody matched): let Gemini have a go when the user allows AI reading.
    if (parse.confidence !== 'high' && aiScanPossible() && aiScanEnabled()) {
      setBusy('read')
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
        setBusy(null)
      }
    }
    pending.quick = { groupId: target.id, prefill: toQuickPrefill(parse, t, category) }
    if (parse.amount === undefined) toast('Couldn’t find an amount in that. Add it in the form.')
    else if (parse.unmatched.length) toast(`Didn’t recognise ${parse.unmatched.join(', ')}. Check who’s in the split.`)
    leave(`/add?group=${encodeURIComponent(target.id)}&quick=1`)
  }

  /**
   * A new group first: GroupForm opens with the name and the people the line names filled in
   * (matched to people you already know), and once it is made the expense form opens with the line
   * (amount, words and date now; the people read again against the new members by ExpenseForm).
   * Read locally only: the AI reader needs the group's names.
   */
  const createGroup = async (name: string) => {
    const t = text.trim()
    const qs = new URLSearchParams({ next: 'add' })
    let prefill: ReturnType<typeof newGroupPrefill> = { name, people: [] }
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
      prefill = newGroupPrefill({ text: t, freshName: name, unmatched: parse.unmatched, known: knownPeople(groups, user.uid) })
    }
    if (prefill.name) {
      qs.set('name', prefill.name)
      const type = prefill.type ?? guessGroup(prefill.name)?.type
      if (type) qs.set('type', type)
    }
    if (prefill.people.length) qs.set('people', prefill.people.join(','))
    leave(`/groups/new?${qs}`)
  }

  /**
   * Quick add with AI. true when it took the line (opened the form, or the person cancelled the
   * new group and stays here); false sends the line down the phone's own path.
   */
  const askAi = async (): Promise<boolean> => {
    setBusy('ai')
    try {
      const today = todayISO()
      const r = await repo.quickAddAi(buildQuickRequest({ text, groups, uid: user.uid, me: profile.displayName, target, today }))
      if (!r) {
        toast('Couldn’t work that out right now, so it was read on this phone. Check the form.')
        return false
      }
      if (r.unavailable) {
        if (!isQuietReason(r.reason)) toast(unavailableText(r.reason))
        return false
      }
      const plan = planQuickAi(r.result, {
        line: text.trim(),
        groups,
        uid: user.uid,
        me: { name: profile.displayName, email: user.email ?? undefined },
        currency: profile.currency,
        today,
        known: knownPeople(groups, user.uid),
        makeId: () => uid('p_'),
      })
      if (plan.kind === 'fallback') return false
      if (plan.kind === 'expense') {
        pending.quick = { groupId: plan.groupId, prefill: plan.prefill }
        leave(`/add?group=${encodeURIComponent(plan.groupId)}&quick=1`)
        return true
      }
      const ok = await confirm({
        title: `Create “${plan.group.name}”?`,
        message: `A new group with ${listNames(['you', ...plan.people])}. Then the expense opens for you to check.`,
        confirmLabel: 'Create group',
      })
      if (!ok) return true
      const id = await saveGroup(plan.group)
      pending.quick = { groupId: id, prefill: plan.prefill }
      toast('Group created')
      leave(`/add?group=${encodeURIComponent(id)}&quick=1`)
      return true
    } catch (e) {
      toast(errText(e), 'err')
      return true
    } finally {
      setBusy(null)
    }
  }

  /** Two groups fit the words: the picker reads "Which group?"; sending opens it so the user says which. */
  const askWhich = () => {
    const btn = picker.current?.querySelector<HTMLButtonElement>('button[role="combobox"]')
    btn?.focus()
    btn?.click()
  }

  const send = async () => {
    // Too much for the phone's grammar, and AI is allowed: try it first.
    if (aiAllowed) {
      const { parseNlExpense } = await loadParser()
      const order = memberOrder(target)
      const parse = fresh
        ? parseNlExpense(fresh.text, { members: [{ id: user.uid, name: profile.displayName }], me: user.uid, currency: profile.currency })
        : parseNlExpense(line, {
            members: order.map((id) => ({ id, name: target.members[id].name })),
            me: myMemberId(target, user.uid) ?? order[0],
            currency: target.currency,
          })
      if (quickRoute(text, parse, named).route === 'ai' && (await askAi())) return
    }
    if (fresh) await createGroup(fresh.name)
    else await go()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || !text.trim()) return
    if (which) askWhich()
    else void send()
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
  const chip = 'flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full py-1.5 text-sm font-semibold'

  return (
    <form onSubmit={submit} data-testid={testId} aria-busy={busy ? true : undefined}>
      {/* One outlined composer: the field on top, where it goes and the buttons underneath. */}
      <div
        className={`rounded-2xl bg-white ring-1 ring-slate-200 transition-shadow has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand-500 dark:bg-ink-900 dark:ring-white/10 dark:has-[input:focus-visible]:ring-brand-400 ${busy ? 'opacity-90' : ''}`}
      >
        <div className="relative">
          <input
            ref={input}
            id={`${testId}-input`}
            aria-label="Quick add"
            className={`block w-full rounded-t-2xl bg-transparent px-4 pb-1.5 pt-3.5 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-100 ${showHint ? 'placeholder:text-transparent' : ''}`}
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
            disabled={!!busy}
            data-testid={`${testId}-input`}
          />
          {showHint && <Hint text={HINT} />}
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
            ) : match && match.id !== picked.id ? (
              <button
                type="button"
                onClick={() => setUndone(named.kind === 'match' ? named.phrase : null)}
                disabled={!!busy}
                aria-label={`Going into ${match.name}, named in your line. Use ${picked.name} instead`}
                className={`${chip} bg-brand-50 pl-1.5 pr-2.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200`}
                data-testid={`${testId}-group-chip`}
              >
                <GroupIcon emoji={match.emoji} size={24} />
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
                    {sel?.icon ?? <span className="w-1" aria-hidden />}
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
                    icon: <GroupIcon emoji={g.emoji} size={24} />,
                    hint: which && named.kind === 'ambiguous' && named.ids.includes(g.id) ? 'Fits your line' : undefined,
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
          {mic && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={!!busy}
              aria-pressed={listening}
              aria-label={listening ? 'Stop listening' : 'Speak the expense'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${listening ? 'bg-rose-600 text-white' : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/5'}`}
              data-testid={`${testId}-mic`}
            >
              {listening ? <Square size={16} aria-hidden /> : <Mic size={20} aria-hidden />}
            </button>
          )}
          <button
            type="submit"
            disabled={!!busy || !text.trim()}
            aria-label={fresh ? 'Create the group, then open the expense form' : 'Open the expense form with this'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-on-fill shadow-sm transition active:scale-95 disabled:opacity-40 disabled:shadow-none"
            data-testid={`${testId}-go`}
          >
            {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ArrowRight size={20} aria-hidden />}
          </button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="text-muted min-h-0 px-1 text-xs empty:hidden" data-testid={`${testId}-status`}>
        {busy === 'ai' ? (
          <span className="mt-2 flex items-center gap-1.5">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Working it out…
          </span>
        ) : busy === 'read' ? (
          <span className="mt-2 flex items-center gap-1.5">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Reading your line…
          </span>
        ) : null}
      </p>
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
