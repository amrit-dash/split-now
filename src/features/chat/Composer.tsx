import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AtSign, ClipboardList, HandCoins, Handshake, Pencil, Plus, Receipt, Scale, SendHorizontal, Share2, Sparkles, X } from 'lucide-react'
import type { Cents, ChatMessage, ChatReplyRef, Debt, Expense, Group, MemberId, OpenItem } from '@/types'
import { guessCategory } from '@/lib/categories'
import { expenseEmoji } from '@/lib/icons'
import { IconFace } from '@/components/IconFace'
import { CHAT_MAX, cleanMessage, owedBetween } from '@/lib/chat'
import {
  applyMention,
  type ChatTool,
  EVERYONE,
  listNames,
  matchCommands,
  matchMentions,
  type Mentionable,
  mentionQuery,
  mentionsIn,
  parseSlash,
  slashQuery,
  suggestionLabel,
  suggestTool,
  type ToolInfo,
  type ToolSuggestion,
  toolsFor,
  AI_PAUSE_MS,
  shouldAskAi,
  suggestionFromAi,
} from '@/lib/chat-tools'
import { formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { parseNlExpense, toQuickPrefill } from '@/lib/nl-expense'
import { pending } from '@/lib/pending'
import { labelOf } from '@/lib/shortNames'
import { MoneyInput } from '@/components/MoneyInput'
import { Sheet } from '@/components/Sheet'
import { OpenItemSheet } from '@/features/open-items/OpenItemSheet'
import { repo } from '@/data'
import type { AiUnavailableReason } from '@/lib/ai'
import { HintText } from '@/components/Hint'

export type Draft = Omit<ChatMessage, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'pending'>

/** Phones get a newline from Enter (Send is the button); a keyboard and mouse send with Enter. */
const enterSends = () => typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches

const TOOL_ICON: Record<ChatTool, React.ReactNode> = {
  settle: <Handshake size={20} />,
  pay: <HandCoins size={20} />,
  expense: <Receipt size={20} />,
  open: <ClipboardList size={20} />,
  balances: <Scale size={20} />,
  share: <Share2 size={20} />,
}

type Panel = 'menu' | 'open' | 'pay' | 'settle' | 'share' | null

export interface ComposerProps {
  group: Group
  expenses: Expense[]
  openItemsOn: boolean
  /** the viewer's member id */
  me?: MemberId
  mentionList: Mentionable[]
  /** what each pair owes each other (the Settle up sheet shows what each person owes you) */
  pairDebts: Debt[]
  /** suggest a tool while typing (chat info, per device) */
  suggest: boolean
  /** also ask the AI when the rules find nothing (chat info; shown only under the admin flag chatAi) */
  ai: boolean
  /** the AI said it can't serve this person (off in their settings, no key, over the allowance) */
  onAiUnavailable: (reason?: AiUnavailableReason) => void
  onSend: (m: Draft) => void
  /** the message being answered (swipe or Reply), shown above the box */
  replyTo: ChatReplyRef | null
  onCancelReply: () => void
  /** your own message being edited: the box holds its words, Send saves them */
  editing: ChatMessage | null
  onCancelEdit: () => void
  onEdit: (m: ChatMessage, text: string, mentions: string[]) => void
}

/**
 * The message box, Slack-like: "/" lists the tools (narrowed as you type, Enter or tap picks),
 * "@" tags someone, and a line that reads like a tool offers it in one tap above the box. ＋ opens
 * every tool: Settle up and Pay me (to everyone or chosen people), Add expense (its card lands back
 * here), Open item, Balances and Share an expense. Replying and editing show a bar above the box.
 */
export function Composer(p: ComposerProps) {
  const { group, openItemsOn, me, mentionList, onSend } = p
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [sheet, setSheet] = useState<Panel>(null)
  /** what the Pay me / Settle up / Open item sheets start from (a suggestion or a command line) */
  const [seed, setSeed] = useState<{ amount?: Cents; to?: MemberId[]; title?: string }>({})
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [pick, setPick] = useState(0)
  const area = useRef<HTMLTextAreaElement>(null)
  // Where the caret goes once the box shows new words (a picked @name). Placed right after React
  // writes them, before the next key is handled: a frame later, a letter typed in between landed
  // at the end and the caret then jumped back in front of it ("@Rohan or the cabf").
  const caretTo = useRef<number | null>(null)
  useLayoutEffect(() => {
    const at = caretTo.current
    const el = area.current
    if (at === null || !el) return
    caretTo.current = null
    el.focus()
    el.setSelectionRange(at, at)
  })
  const clean = cleanMessage(text)
  const tools = useMemo(() => toolsFor({ openItemsOn }), [openItemsOn])
  const name = (id: MemberId) => (id === me ? 'you' : labelOf(group.members, id, 'someone', me))
  const money = (c: Cents) => formatMoney(c, group.currency)

  // Editing: the box takes the message's words.
  useEffect(() => {
    if (!p.editing) return
    setText(p.editing.text)
    requestAnimationFrame(() => {
      const el = area.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
      setCaret(el.value.length)
    })
  }, [p.editing])
  // Replying: straight to the box.
  useEffect(() => {
    if (p.replyTo) area.current?.focus()
  }, [p.replyTo])

  // Grow with the text, up to about five lines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on every change of the text
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])

  // What shows above the box: the command list, the people to tag, or a suggestion.
  const slash = p.editing ? null : slashQuery(text)
  const commands = slash === null ? [] : matchCommands(slash, tools)
  const mq = mentionQuery(text, caret)
  const people = mq ? matchMentions(mq.query, mentionList) : []
  const tagged = mentionsIn(text, mentionList)
  const members = useMemo(() => Object.entries(group.members).map(([id, m]) => ({ id, name: m.name })), [group.members])
  const canSuggest = p.suggest && !p.editing && slash === null && !mq && clean !== dismissed && !!me
  const local: ToolSuggestion | null = canSuggest && me ? suggestTool(clean, { tools, members, me, currency: group.currency, tagged }) : null

  // AI (optional, src/lib/chat-tools.ts shouldAskAi): once typing pauses, only for a line the rules
  // above found nothing in. Its answer is kept for that exact line, so it goes as soon as you type on.
  const asked = useRef(new Set<string>())
  const [aiHit, setAiHit] = useState<{ text: string; s: ToolSuggestion } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: asks about the line as typed; the rest is read when it's sent
  useEffect(() => {
    if (!me || !canSuggest || !shouldAskAi(clean, { on: p.ai, local, asked: asked.current, count: asked.current.size })) return
    const line = clean
    const t = setTimeout(async () => {
      asked.current.add(line)
      setAiBusy(true)
      const people = mentionList.filter((x) => x.id !== EVERYONE)
      const r = await repo.chatIntentAi(line, { names: people.map((x) => x.label), tools: tools.map((x) => x.id), currency: group.currency })
      setAiBusy(false)
      if (!r) return
      if (r.unavailable) {
        p.onAiUnavailable(r.reason)
        return
      }
      const s = suggestionFromAi(r.intent, line, { tools, members, me, currency: group.currency, people })
      if (s) setAiHit({ text: line, s })
    }, AI_PAUSE_MS)
    return () => clearTimeout(t)
  }, [clean, canSuggest, p.ai, local === null])
  const viaAi = !local && canSuggest && aiHit?.text === clean
  const suggestion: ToolSuggestion | null = local ?? (viaAi && aiHit ? aiHit.s : null)
  const listLen = slash !== null ? commands.length : mq ? people.length : 0
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new list (or a new query) starts at its first row
  useEffect(() => setPick(0), [listLen, slash, mq?.query])

  const reset = () => {
    setText('')
    setCaret(0)
    setDismissed(null)
  }
  const extra = (): Pick<Draft, 'replyTo'> => (p.replyTo ? { replyTo: p.replyTo } : {})

  const send = () => {
    if (!clean) return
    if (p.editing) {
      p.onEdit(p.editing, clean, tagged)
      reset()
      return
    }
    const cmd = parseSlash(clean, tools)
    if (cmd) {
      runTool(cmd.tool, cmd.rest)
      return
    }
    onSend({ kind: 'text', text: clean, ...(tagged.length ? { mentions: tagged } : {}), ...extra() })
    reset()
    area.current?.focus()
  }

  /** Open a tool, from ＋, a command ("/pay 500 @Priya") or a suggestion. `line` is what the command or the box said. */
  const runTool = (tool: ChatTool, line = '', s?: ToolSuggestion) => {
    const tags = mentionsIn(line, mentionList).filter((t) => t !== EVERYONE)
    const fromLine = () => {
      if (!me) return {}
      const r = parseNlExpense(line, { members, me, currency: group.currency })
      return r.amount && r.currency === group.currency ? { amount: r.amount } : {}
    }
    switch (tool) {
      case 'balances':
        onSend({ kind: 'balances', text: '', ...extra() })
        reset()
        setSheet(null)
        return
      case 'expense': {
        const read = s?.expense ?? (me && line ? parseNlExpense(line, { members, me, currency: group.currency }) : undefined)
        if (read && me) pending.quick = { groupId: group.id, prefill: toQuickPrefill(read, line, guessCategory(read.description)) }
        reset()
        setSheet(null)
        nav(`/add?group=${encodeURIComponent(group.id)}&chat=1${read && me ? '&quick=1' : ''}`)
        return
      }
      case 'pay':
        setSeed({ ...(s ? { amount: s.amount, to: s.to } : { ...fromLine(), to: tags.length ? tags : undefined }) })
        break
      case 'settle':
        setSeed({ to: s ? s.to : tags.length ? tags : undefined })
        break
      case 'open':
        setSeed({ title: line })
        break
      default:
        setSeed({})
    }
    // The words were the command: they don't go along as the card's note.
    if (!s) reset()
    setSheet(tool)
  }

  const pickCommand = (t: ToolInfo) => runTool(t.id)
  const pickPerson = (m: Mentionable) => {
    if (!mq) return
    const next = applyMention(text, mq.start, caret, m.label)
    setText(next.text)
    setCaret(next.caret)
    caretTo.current = next.caret
  }

  /** A card's note: what was typed (unless it was the command), else a line that tags who it asks. */
  const noteFor = (tool: 'pay' | 'settle', to: MemberId[] | undefined, amount?: Cents) => {
    const typed = slashQuery(clean) === null && !parseSlash(clean, tools) ? clean : ''
    const who = to?.length ? to.map((id) => `@${mentionList.find((x) => x.id === id)?.label ?? name(id)}`).join(' ') : '@everyone'
    const words =
      typed || (tool === 'settle' ? `${who} can you settle up with me when you get a chance?` : `${who} please pay me ${amount ? money(amount) : ''}`.trim())
    const tags = mentionsIn(words, mentionList)
    return { text: words.slice(0, CHAT_MAX), ...(tags.length ? { mentions: tags } : {}) }
  }

  const sendAsk = (tool: 'pay' | 'settle', to: MemberId[] | undefined, amount?: Cents) => {
    const note = noteFor(tool, to, amount)
    onSend({ kind: tool, ...(tool === 'pay' ? { amount } : {}), ...(to?.length ? { to } : {}), ...note, ...extra() })
    reset()
    setSheet(null)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (listLen > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setPick((i) => (i + (e.key === 'ArrowDown' ? 1 : listLen - 1)) % listLen)
      return
    }
    if (listLen > 0 && (e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
      e.preventDefault()
      if (slash !== null) pickCommand(commands[pick])
      else if (mq) pickPerson(people[pick])
      return
    }
    if (e.key === 'Escape') {
      if (p.editing) {
        p.onCancelEdit()
        reset()
      } else if (p.replyTo) p.onCancelReply()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) {
      e.preventDefault()
      send()
    }
  }

  return (
    // Bottom padding trimmed into the home-indicator area like the tab bar (--nav-pad); none of it while the keyboard is up
    // (GroupChat sets data-keyboard), where iOS still reports the home-indicator inset and left a gap above the keyboard.
    <div className="relative border-t border-slate-200/80 bg-white pl-2 pr-4 pb-[max(var(--nav-pad),0.5rem)] pt-2 group-data-[keyboard]/chat:pb-2 dark:border-white/5 dark:bg-ink-900">
      {/* Above the box: the slash list, the people to tag, or a suggestion. */}
      {slash !== null && commands.length > 0 && (
        <Popup label="Tools" testId="chat-commands">
          {commands.map((t, i) => (
            <PopupRow key={t.id} active={i === pick} onPick={() => pickCommand(t)} icon={TOOL_ICON[t.id]} testId={`chat-command-${t.command}`}>
              <span className="font-semibold">/{t.command}</span> <span className="text-muted">{t.label}</span>
              <span className="text-muted block truncate text-xs">{t.hint}</span>
            </PopupRow>
          ))}
        </Popup>
      )}
      {mq && people.length > 0 && (
        <Popup label="Tag someone" testId="chat-mentions">
          {people.map((m, i) => (
            <PopupRow key={m.id} active={i === pick} onPick={() => pickPerson(m)} icon={<AtSign size={18} />} testId="mention-offer">
              <span className="font-semibold">@{m.label}</span>
              {m.id === EVERYONE && <span className="text-muted block text-xs">Everyone in the group</span>}
            </PopupRow>
          ))}
        </Popup>
      )}
      {suggestion && (
        <div className="mx-auto mb-2 flex max-w-2xl items-center gap-1" data-testid="chat-suggestion">
          <button
            type="button"
            onClick={() => runTool(suggestion.tool, clean, suggestion)}
            className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-brand-50 px-3 text-left text-sm font-semibold text-brand-800 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-200 dark:ring-brand-500/20"
          >
            <Sparkles size={16} className="shrink-0" aria-hidden />
            <span className="truncate">{suggestionLabel(suggestion, name, money)}</span>
            {viaAi && (
              <span className="ml-auto shrink-0 rounded-full bg-brand-100 px-1.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
                AI
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(clean)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-800"
            aria-label="Not now"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
      {!suggestion && aiBusy && canSuggest && (
        <div className="text-muted mx-auto mb-2 flex max-w-2xl items-center gap-1.5 px-2 text-xs" role="status">
          <Sparkles size={14} aria-hidden /> Checking with AI…
        </div>
      )}
      {(p.replyTo || p.editing) && (
        <div className="mx-auto mb-2 flex max-w-2xl items-center gap-2 rounded-xl bg-slate-100 py-1.5 pl-3 pr-1 dark:bg-ink-800" data-testid="chat-reply-bar">
          {p.editing ? <Pencil size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden /> : null}
          <div className="min-w-0 flex-1 border-l-2 border-brand-500 pl-2 text-xs">
            <div className="font-bold text-brand-700 dark:text-brand-300">
              {p.editing ? 'Editing your message' : `Replying to ${p.replyTo?.authorName ?? ''}`}
            </div>
            <div className="text-muted truncate">{p.editing ? p.editing.text : p.replyTo?.text}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (p.editing) {
                p.onCancelEdit()
                reset()
              } else p.onCancelReply()
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-ink-700"
            aria-label={p.editing ? 'Stop editing' : 'Cancel reply'}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
      <form
        className="mx-auto flex max-w-2xl items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        {!p.editing && (
          <button
            type="button"
            onClick={() => setSheet('menu')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-ink-800"
            aria-label="Tools: settle up, Pay me, add expense and more"
            aria-haspopup="dialog"
            data-testid="chat-tools"
          >
            <Plus size={24} aria-hidden />
          </button>
        )}
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        {/* One rounded box: the words, and Send inside it on the bottom edge, where it stays as the box grows. */}
        <div className="flex min-h-11 flex-1 items-end rounded-3xl bg-slate-100 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-brand-500 dark:bg-ink-800">
          <textarea
            id="chat-input"
            ref={area}
            rows={1}
            value={text}
            maxLength={CHAT_MAX + 200}
            onChange={(e) => {
              setText(e.target.value)
              setCaret(e.target.selectionStart ?? e.target.value.length)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKey}
            placeholder={p.editing ? 'Edit your message' : 'Message, / for tools, @ to tag'}
            aria-autocomplete="list"
            className="min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent py-2.5 pl-4 pr-1 text-base leading-snug outline-none"
            data-testid="chat-input"
          />
          <button
            type="submit"
            disabled={!clean}
            className="m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-on-fill transition disabled:opacity-40"
            aria-label={p.editing ? 'Save' : 'Send'}
            data-testid="chat-send"
          >
            {/* The plane's tail outweighs its point: half a pixel to the right reads as centred. */}
            <SendHorizontal size={16} className="translate-x-[0.5px]" aria-hidden />
          </button>
        </div>
      </form>

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title="Add to the chat" testId="chat-tools-sheet">
        <p className="text-muted -mt-1 mb-2 text-xs">Tip: type / in the message box for these, or @ to tag someone.</p>
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          {tools.map((t) => (
            <ToolRow
              key={t.id}
              icon={TOOL_ICON[t.id]}
              label={t.label}
              command={t.command}
              hint={t.hint}
              onClick={() => runTool(t.id)}
              testId={`chat-tool-${t.id}`}
            />
          ))}
        </ul>
      </Sheet>

      {openItemsOn && (
        <OpenItemSheet
          open={sheet === 'open'}
          onClose={() => setSheet(null)}
          group={group}
          // What's in the box is probably the item ("lunch oct 2 cafe blue"): start from it.
          initial={{ title: seed.title || clean, date: undefined }}
          onSaved={(item: OpenItem, isNew) => {
            if (!isNew) return
            onSend({ kind: 'openItem', ref: item.id, text: clean && clean !== item.title ? clean : '', ...extra() })
            reset()
          }}
        />
      )}
      <AskSheet
        kind="pay"
        open={sheet === 'pay'}
        onClose={() => setSheet(null)}
        group={group}
        me={me}
        mentionList={mentionList}
        pairDebts={p.pairDebts}
        seed={seed}
        onAsk={(to, amount) => sendAsk('pay', to, amount)}
      />
      <AskSheet
        kind="settle"
        open={sheet === 'settle'}
        onClose={() => setSheet(null)}
        group={group}
        me={me}
        mentionList={mentionList}
        pairDebts={p.pairDebts}
        seed={seed}
        onAsk={(to) => sendAsk('settle', to)}
      />
      <ShareSheet
        open={sheet === 'share'}
        onClose={() => setSheet(null)}
        group={group}
        expenses={p.expenses}
        onPick={(e) => {
          onSend({ kind: 'expense', ref: e.id, text: clean, ...extra() })
          reset()
          setSheet(null)
        }}
      />
    </div>
  )
}

function Popup({ label, testId, children }: { label: string; testId?: string; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-x-2 bottom-full z-20 mx-auto mb-1 max-h-72 max-w-2xl overflow-y-auto rounded-2xl bg-white p-1 shadow-xl ring-1 ring-slate-900/10 dark:bg-ink-800 dark:ring-white/10"
      role="listbox"
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </div>
  )
}

function PopupRow({
  active,
  onPick,
  icon,
  children,
  testId,
}: {
  active: boolean
  onPick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      // Keep the box's focus (and the keyboard up) while picking.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-sm ${active ? 'bg-slate-100 dark:bg-ink-700' : ''}`}
      data-testid={testId}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-ink-900 dark:text-slate-200"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

function ToolRow({
  icon,
  label,
  command,
  hint,
  onClick,
  testId,
}: {
  icon: React.ReactNode
  label: string
  command: string
  hint: string
  onClick: () => void
  testId?: string
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-2 py-2.5 text-left" data-testid={testId}>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200"
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {label} <span className="text-muted text-xs font-normal">/{command}</span>
          </span>
          {/* Inside the row's button: no (i) here, the line simply follows the look. */}
          <HintText hint={{ full: hint }} className="text-muted block text-xs" as="span" />
        </span>
      </button>
    </li>
  )
}

/**
 * Pay me or Settle up: ask everyone, or choose people. Settle up shows what each person owes you
 * right now; Pay me asks for an amount (from each person asked).
 */
function AskSheet({
  kind,
  open,
  onClose,
  group,
  me,
  mentionList,
  pairDebts,
  seed,
  onAsk,
}: {
  kind: 'pay' | 'settle'
  open: boolean
  onClose: () => void
  group: Group
  me?: MemberId
  mentionList: Mentionable[]
  pairDebts: Debt[]
  seed: { amount?: Cents; to?: MemberId[] }
  onAsk: (to: MemberId[] | undefined, amount?: Cents) => void
}) {
  const [amount, setAmount] = useState<Cents | undefined>(undefined)
  const [chosen, setChosen] = useState<MemberId[] | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: start from the seed each time the sheet opens
  useEffect(() => {
    if (!open) return
    setAmount(seed.amount)
    setChosen(seed.to?.length ? seed.to : null)
  }, [open])
  const people = mentionList.filter((m) => m.id !== EVERYONE)
  const owes = (id: MemberId) => (me ? owedBetween(pairDebts, id, me) : 0)
  const whoLabel = chosen?.length ? listNames(chosen.map((id) => people.find((x) => x.id === id)?.label ?? 'someone')) : 'everyone'
  const ready = kind === 'settle' ? chosen === null || chosen.length > 0 : !!amount && amount > 0 && (chosen === null || chosen.length > 0)
  const toggle = (id: MemberId) => setChosen((c) => (c?.includes(id) ? c.filter((x) => x !== id) : [...(c ?? []), id]))
  return (
    <Sheet open={open} onClose={onClose} title={kind === 'pay' ? 'Pay me' : 'Settle up'} testId={`chat-${kind}-sheet`}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (ready) onAsk(chosen ?? undefined, kind === 'pay' ? amount : undefined)
        }}
      >
        <HintText
          hint={
            kind === 'pay'
              ? { full: 'They get a card with a Pay button that opens Settle up, filled in.', short: 'They get a card with a Pay button.' }
              : {
                  full: 'They get a card with one button that settles exactly what they owe you, or shows that you’re square.',
                  short: 'They get one button for what they owe you.',
                }
          }
          className="text-muted -mt-1 mb-3 text-sm"
        />
        {kind === 'pay' && (
          <>
            <label htmlFor="chat-pay-amount" className="label">
              Amount
            </label>
            <MoneyInput
              id="chat-pay-amount"
              currency={group.currency}
              value={amount}
              onChange={setAmount}
              placeholder="0"
              autoFocus={!seed.amount}
              data-testid="chat-pay-amount"
            />
          </>
        )}
        <fieldset className="mt-4">
          <legend className="label">Ask</legend>
          <div className="flex flex-wrap gap-2" data-testid={`chat-${kind}-who`}>
            <button
              type="button"
              className="chip min-h-11"
              aria-pressed={chosen === null}
              onClick={() => setChosen(null)}
              data-testid={`chat-${kind}-everyone`}
            >
              {chosen === null && <span aria-hidden>✓</span>} Everyone
            </button>
            {people.map((m) => {
              const on = !!chosen?.includes(m.id)
              const n = owes(m.id)
              return (
                <button key={m.id} type="button" className="chip min-h-11" aria-pressed={on} onClick={() => toggle(m.id)}>
                  {on && <span aria-hidden>✓</span>} {m.label}
                  {kind === 'settle' && n > 0 && <span className="text-muted text-xs">owes {formatMoney(n, group.currency)}</span>}
                </button>
              )
            })}
          </div>
        </fieldset>
        <button type="submit" className="btn-primary mt-5 w-full" disabled={!ready} data-testid={`chat-${kind}-send`}>
          {kind === 'pay' ? `Ask ${whoLabel} for ${amount ? formatMoney(amount, group.currency) : 'an amount'}` : `Ask ${whoLabel} to settle up`}
        </button>
      </form>
    </Sheet>
  )
}

function ShareSheet({
  open,
  onClose,
  group,
  expenses,
  onPick,
}: {
  open: boolean
  onClose: () => void
  group: Group
  expenses: Expense[]
  onPick: (e: Expense) => void
}) {
  const live = expenses.filter((e) => typeof e.deletedAt !== 'number').slice(0, 30)
  return (
    <Sheet open={open} onClose={onClose} title="Share an expense">
      {live.length === 0 ? (
        <p className="text-muted text-sm">No expenses in this group yet.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          {live.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onPick(e)} className="flex min-h-12 w-full items-center gap-3 px-2 py-2 text-left">
                <span className="text-xl" aria-hidden>
                  <IconFace iconSvg={e.iconSvg} iconImage={e.iconImage} emoji={expenseEmoji(e)} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.description}</span>
                  <span className="text-muted block text-xs">{formatDate(e.date, 'day')}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatMoney(e.amount, group.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
