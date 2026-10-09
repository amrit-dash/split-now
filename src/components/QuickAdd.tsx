import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Mic, Square } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { memberOrder, myMemberId } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { useMerchantMemory } from '@/hooks/useMerchants'
import type { Group } from '@/types'
import { aiScanEnabled, aiScanPossible } from '@/lib/ai'
import { errText } from '@/lib/errors'
import { todayISO } from '@/lib/id'
import { suggestCategory } from '@/lib/merchants'
import type { NlContext } from '@/lib/nl-expense'
import { pending } from '@/lib/pending'
import { listenOnce, speechSupported, type SpeechSession } from '@/lib/speech'
import { GroupIcon } from '@/components/GroupIcon'
import { Select } from '@/components/Select'
import { useToast } from '@/components/Toast'

// The parser loads on first focus or submit, not with Home (it is only needed once someone types).
const loadParser = () => import('@/lib/nl-expense')

/**
 * Quick add: one line ("dinner 1200 with Rahul and Priya, I paid"), typed or spoken, opens
 * the expense form prefilled. Nothing is saved from here. The local grammar
 * (src/lib/nl-expense.ts) does the reading; when it is unsure and AI reading is on, Gemini's
 * text reader fills the gaps, and the form still opens for a look either way.
 */
export function QuickAdd({
  groups,
  defaultGroupId,
  lockGroup,
  testId = 'quick-add',
}: {
  /** the groups the line can go into (shared ones; the personal wallet has nobody to split with) */
  groups: Group[]
  defaultGroupId?: string
  /** on a group screen: no picker */
  lockGroup?: boolean
  testId?: string
}) {
  const enabled = useFlag('quickAdd')
  const { user } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const memory = useMerchantMemory()
  const [text, setText] = useState('')
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const session = useRef<SpeechSession | null>(null)
  const mic = useMemo(() => speechSupported(), [])
  useEffect(() => () => session.current?.stop(), [])

  const group = groups.find((g) => g.id === groupId) ?? groups[0]
  if (!enabled || !group) return null

  const go = async (line: string) => {
    const t = line.trim()
    if (!t) return
    const order = memberOrder(group)
    const me = myMemberId(group, user.uid) ?? order[0]
    const ctx: NlContext = { members: order.map((id) => ({ id, name: group.members[id].name })), me, currency: group.currency, today: todayISO() }
    const { mergeAiParse, parseNlExpense, toQuickPrefill } = await loadParser()
    let parse = parseNlExpense(t, ctx)
    let category = parse.description ? suggestCategory(parse.description, { memory }) : null
    // Unsure (no amount, or a name nobody matched): let Gemini have a go when the user allows AI reading.
    if (parse.confidence !== 'high' && aiScanPossible() && aiScanEnabled()) {
      setBusy(true)
      try {
        const r = await repo.parseTextAi(t, { members: ctx.members.map((m) => m.name), currency: group.currency, today: ctx.today! })
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
    pending.quick = { groupId: group.id, prefill: toQuickPrefill(parse, t, category) }
    if (parse.amount === undefined) toast('Couldn’t find an amount in that. Add it in the form.')
    else if (parse.unmatched.length) toast(`Didn’t recognise ${parse.unmatched.join(', ')}. Check who’s in the split.`)
    setText('')
    nav(`/add?group=${encodeURIComponent(group.id)}&quick=1`)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void go(text)
  }

  const toggleMic = () => {
    if (listening) {
      session.current?.stop()
      return
    }
    let heard = ''
    const s = listenOnce({
      onText: (t) => {
        heard = t
        setText(t)
      },
      onEnd: (err) => {
        setListening(false)
        session.current = null
        if (err) toast(errText(err), 'err')
        else if (heard.trim()) void go(heard)
      },
    })
    if (!s) return
    session.current = s
    setListening(true)
  }

  return (
    <form onSubmit={submit} className="card mt-4 p-3" data-testid={testId} aria-busy={busy || undefined}>
      <div className="flex items-center gap-2">
        <label htmlFor={`${testId}-input`} className="sr-only">
          Quick add an expense
        </label>
        <input
          id={`${testId}-input`}
          className="input min-w-0 flex-1 !py-2.5"
          placeholder={listening ? 'Listening…' : 'Quick add: dinner 1200 with Rahul, I paid'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => void loadParser()}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="go"
          disabled={busy}
          data-testid={`${testId}-input`}
        />
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
          aria-label="Open the expense form with this"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
          data-testid={`${testId}-go`}
        >
          {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ArrowRight size={20} aria-hidden />}
        </button>
      </div>
      {!lockGroup && groups.length > 1 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span id={`${testId}-into`}>Into</span>
          <Select
            aria-label="Group for the quick add"
            size="sm"
            value={group.id}
            onChange={setGroupId}
            options={groups.map((g) => ({ value: g.id, label: g.name, text: g.name, icon: <GroupIcon emoji={g.emoji} size={22} /> }))}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Opens the form filled in; nothing is saved until you check it.</p>
    </form>
  )
}
