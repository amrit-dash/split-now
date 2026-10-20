import { useRef, useState, type ReactNode } from 'react'
import { labelOf } from '@/lib/shortNames'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Clock,
  HandCoins,
  Handshake,
  Layers,
  Receipt,
  Reply,
  Scale,
  Settings2,
  Users,
} from 'lucide-react'
import type { ActivityEntry, ChatMessage, ChatReplyRef, Debt, Expense, Group, MemberId, MergeRequest, OpenItem } from '@/types'
import { activityText } from '@/lib/activity'
import { expenseEmoji } from '@/lib/icons'
import { IconFace } from '@/components/IconFace'
import { authorMember, foldsUpdates, linkParts, payCard, settleCard, updateKind, type ChatRow, type UpdateKind } from '@/lib/chat'
import { listNames, mentionParts, type Mentionable } from '@/lib/chat-tools'
import { formatTime } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { claimHref, openItemEmoji, openItemMeta, type OpenItemState, suspectLine } from '@/lib/open-items'
import { Avatar } from '@/components/Avatar'
import { MergeChatCard } from '@/features/merge/Merge'
import { handlersOf, isReceived } from '../../../shared/received'

export interface MessageCtx {
  group: Group
  /** the viewer */
  uid: string
  me?: MemberId
  today: string
  openItems: Map<string, { item: OpenItem; state: OpenItemState }>
  expenses: Map<string, Expense>
  /** what each pair owes each other now (Settle up cards) */
  pairDebts: Debt[]
  /** the group's suggested payments (the Balances card): simplified when the group simplifies */
  debts: Debt[]
  /** member ids still in the group */
  members: MemberId[]
  /** everyone who can be tagged, you included, to draw the tags */
  mentionList: Mentionable[]
  /** the group's merge requests by id (a merge card shows its live state) */
  mergeRequests: Map<string, MergeRequest>
  /** long-press / right-click / Enter on a message */
  onMenu: (m: ChatMessage) => void
  /** swipe right on a message */
  onReply: (m: ChatMessage) => void
  /** tap a quoted message: scroll to it */
  onJump: (id: string) => void
}

/** A day header: a small centred pill that sticks to the top while its day scrolls by. */
export function DayHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-2 z-10 my-3 flex justify-center" role="separator" aria-label={label}>
      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur dark:bg-ink-800/90 dark:text-slate-300">
        {label}
      </span>
    </div>
  )
}

export function UnreadLine() {
  return (
    <div className="my-3 flex items-center gap-3" role="separator" aria-label="Unread messages" id="chat-unread">
      <span className="h-px flex-1 bg-amber-300/70 dark:bg-amber-500/30" />
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Unread messages</span>
      <span className="h-px flex-1 bg-amber-300/70 dark:bg-amber-500/30" />
    </div>
  )
}

const KIND_ICON: Record<UpdateKind, typeof Receipt> = { expense: Receipt, payment: HandCoins, people: Users, group: Settings2 }

/**
 * Expenses, payments and people coming and going, between messages: each one a system message on
 * the left with an icon for what it's about, never mistaken for someone talking. Three or more in a
 * row fold into one summary (how many, and the latest) that opens to show them all (foldsUpdates).
 */
export function UpdatesPill({ entries, uid }: { entries: ActivityEntry[]; uid: string }) {
  const [open, setOpen] = useState(false)
  if (!foldsUpdates(entries)) {
    return (
      <div className="my-2 space-y-1.5" data-testid="chat-updates">
        {entries.map((a) => (
          <SystemUpdate key={a.id} entry={a} uid={uid} />
        ))}
      </div>
    )
  }
  const latest = entries[entries.length - 1]
  return (
    <div className="my-2" data-testid="chat-updates">
      <div className="flex items-start gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
          aria-hidden
        >
          <Layers size={16} />
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 max-w-[85%] flex-1 items-center gap-2 rounded-2xl rounded-tl-md bg-white/90 px-3 py-2 text-left shadow-sm ring-1 ring-slate-900/5 backdrop-blur sm:flex-none dark:bg-ink-800/90 dark:ring-white/5"
          data-testid="chat-updates-toggle"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{entries.length} updates</span>
            <span className="text-muted block truncate text-xs">
              {formatTime(latest.createdAt)} · {activityText(latest, uid)}
            </span>
          </span>
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="mt-1.5 space-y-1.5 border-l-2 border-slate-200 pl-2 ml-4 dark:border-white/10" data-testid="chat-updates-list">
          {entries.map((a) => (
            <SystemUpdate key={a.id} entry={a} uid={uid} />
          ))}
        </div>
      )}
    </div>
  )
}

/** One update as a system message: icon tile, the words, the time. */
function SystemUpdate({ entry, uid }: { entry: ActivityEntry; uid: string }) {
  const Icon = KIND_ICON[updateKind(entry.type)]
  return (
    <div className="flex items-start gap-2" data-testid="chat-system-update">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-ink-800 dark:text-slate-400"
        aria-hidden
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-md bg-white/70 px-3 py-1.5 ring-1 ring-slate-900/5 backdrop-blur dark:bg-ink-900/70 dark:ring-white/5">
        <p className="text-sm text-slate-700 dark:text-slate-200">{activityText(entry, uid)}</p>
        <p className="text-muted text-[11px] tabular-nums">{formatTime(entry.createdAt)}</p>
      </div>
    </div>
  )
}

/** Words with @tags drawn as tags and http(s) links made tappable (never any other scheme). */
function Words({ text, mentions, ctx, mine }: { text: string; mentions?: string[]; ctx: MessageCtx; mine: boolean }) {
  const parts = mentionParts(text, mentions, ctx.mentionList)
  return (
    <>
      {parts.map((p, i) =>
        p.mention ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
            key={i}
            className={`rounded px-0.5 font-semibold ${
              p.mention === ctx.me || p.mention === 'all'
                ? 'bg-amber-200/70 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200'
                : mine
                  ? 'text-brand-800 dark:text-brand-200'
                  : 'text-brand-700 dark:text-brand-300'
            }`}
          >
            {p.text}
          </span>
        ) : (
          linkParts(p.text).map((l, j) =>
            l.href ? (
              <a
                // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
                key={`${i}-${j}`}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-brand-700 underline underline-offset-2 dark:text-brand-300"
              >
                {l.text}
              </a>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
              <span key={`${i}-${j}`}>{l.text}</span>
            ),
          )
        ),
      )}
    </>
  )
}

/** How far right a message is dragged before letting go replies to it. */
const REPLY_AT = 56

/**
 * Press and hold (or right-click, or Enter) opens the message's menu; a swipe to the right
 * replies (the row follows the finger, a reply arrow shows, and letting go past REPLY_AT replies).
 */
function useGestures(onHold: () => void, onReply: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef<{ x: number; y: number; swiping: boolean } | null>(null)
  const [dx, setDx] = useState(0)
  const clear = () => {
    clearTimeout(timer.current)
    start.current = null
  }
  const end = () => {
    if (start.current?.swiping && dx >= REPLY_AT) onReply()
    clear()
    setDx(0)
  }
  return {
    dx,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        start.current = { x: e.clientX, y: e.clientY, swiping: false }
        timer.current = setTimeout(() => {
          start.current = null
          setDx(0)
          onHold()
        }, 450)
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current
        if (!s) return
        const mx = e.clientX - s.x
        const my = e.clientY - s.y
        if (!s.swiping && Math.hypot(mx, my) > 8) {
          clearTimeout(timer.current)
          // Mostly sideways and to the right: a reply swipe. Anything else is a scroll.
          if (e.pointerType !== 'mouse' && mx > 0 && Math.abs(mx) > Math.abs(my) * 1.5) s.swiping = true
          else {
            start.current = null
            return
          }
        }
        if (s.swiping) setDx(Math.max(0, Math.min(mx, REPLY_AT + 24)))
      },
      onPointerUp: end,
      onPointerCancel: () => {
        clear()
        setDx(0)
      },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault()
        clear()
        onHold()
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onHold()
        }
      },
    },
  }
}

/** The answered message, quoted at the top of a reply; tapping it scrolls there. */
function Quote({ r, ctx, mine }: { r: ChatReplyRef; ctx: MessageCtx; mine: boolean }) {
  const id = authorMember(ctx.group, r.authorUid)
  const who = r.authorUid === ctx.uid ? 'You' : id ? labelOf(ctx.group.members, id, r.authorName, ctx.me) : r.authorName
  const color = id && ctx.group.members[id]?.color !== 'accent' ? ctx.group.members[id]?.color : undefined
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        ctx.onJump(r.id)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`mb-1.5 block w-full rounded-lg border-l-4 px-2.5 py-1.5 text-left text-xs ${
        mine ? 'border-brand-500 bg-brand-500/10 dark:bg-white/5' : 'border-slate-400 bg-slate-900/5 dark:bg-white/5'
      }`}
      style={color ? { borderLeftColor: color } : undefined}
      aria-label={`Reply to ${who}: ${r.text}. Show the message`}
    >
      <span className="block font-bold" style={color ? { color } : undefined}>
        {who}
      </span>
      <span className="text-muted line-clamp-2 break-words">{r.text}</span>
    </button>
  )
}

/** Under a message, outside it: the time, "edited", and for your own the sending clock or the sent tick. */
function Meta({ m, mine }: { m: ChatMessage; mine: boolean }) {
  return (
    <div className={`text-muted mt-0.5 flex items-center gap-1 px-1 text-[11px] tabular-nums ${mine ? 'justify-end' : 'justify-start'}`}>
      {typeof m.editedAt === 'number' && <span>edited ·</span>}
      {formatTime(m.createdAt)}
      {mine &&
        (m.pending ? <Clock size={12} aria-label="Sending" /> : <CheckCheck size={14} className="text-brand-600 dark:text-brand-300" aria-label="Sent" />)}
    </div>
  )
}

export function MessageRow({ row, ctx }: { row: Extract<ChatRow, { type: 'message' }>; ctx: MessageCtx }) {
  const { message: m, mine, first, last, showTime } = row
  const memberId = authorMember(ctx.group, m.authorUid)
  const member = memberId ? ctx.group.members[memberId] : undefined
  const label = memberId ? labelOf(ctx.group.members, memberId, m.authorName, ctx.me) : m.authorName
  const { dx, handlers } = useGestures(
    () => ctx.onMenu(m),
    () => ctx.onReply(m),
  )
  const time = formatTime(m.createdAt)
  const isCard = m.kind !== 'text'
  const tail = last ? (mine ? 'rounded-br-md' : 'rounded-bl-md') : ''
  const nameColor = member?.color && member.color !== 'accent' ? member.color : undefined
  return (
    <div
      id={`msg-${m.id}`}
      className={`relative flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-3' : 'mt-1'}`}
      data-testid="chat-message"
    >
      {/* The reply arrow that shows while swiping. */}
      {dx > 8 && (
        <span
          className="pointer-events-none absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-600 shadow dark:bg-ink-800 dark:text-slate-300"
          style={{ opacity: Math.min(1, dx / 56) }}
          aria-hidden
        >
          <Reply size={16} />
        </span>
      )}
      {!mine && (
        <div className="w-8 shrink-0 self-end pb-5" aria-hidden>
          {last && <Avatar name={member?.name ?? m.authorName} color={member?.color ?? '#94a3b8'} photoURL={member?.photoURL} size={32} />}
        </div>
      )}
      <div
        className={`flex min-w-0 flex-col ${mine ? 'items-end' : 'items-start'} ${isCard ? 'w-[min(22rem,85%)]' : 'max-w-[80%]'}`}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      >
        {!mine && first && (
          <div className="mb-0.5 px-1 text-xs font-bold" style={{ color: nameColor }}>
            {label}
          </div>
        )}
        <div
          {...handlers}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the message opens its menu from the keyboard (Enter)
          tabIndex={0}
          role="article"
          aria-label={`${mine ? 'You' : label}, ${time}${m.pending ? ', sending' : ''}. Press Enter for options`}
          className={`touch-pan-y select-text outline-offset-2 ${isCard ? 'w-full' : ''}`}
        >
          {isCard ? (
            <Card m={m} ctx={ctx} mine={mine} memberId={memberId} />
          ) : (
            <div
              className={`rounded-2xl px-3.5 py-2 shadow-sm ${tail} ${
                mine
                  ? 'bg-brand-100 text-slate-900 ring-1 ring-brand-200/80 dark:bg-brand-900/45 dark:text-slate-50 dark:ring-brand-500/20'
                  : 'bg-white text-slate-900 ring-1 ring-slate-900/5 dark:bg-ink-800 dark:text-slate-100 dark:ring-white/5'
              }`}
            >
              {m.replyTo && <Quote r={m.replyTo} ctx={ctx} mine={mine} />}
              <div className="whitespace-pre-wrap break-words text-[15px] leading-snug">
                <Words text={m.text} mentions={m.mentions} ctx={ctx} mine={mine} />
              </div>
            </div>
          )}
        </div>
        {showTime && <Meta m={m} mine={mine} />}
      </div>
    </div>
  )
}

// ---- Cards ------------------------------------------------------------------------------------

type Tone = 'amber' | 'emerald' | 'sky' | 'violet' | 'slate'
const TONES: Record<Tone, { tile: string; label: string; edge: string }> = {
  amber: {
    tile: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    label: 'text-amber-700 dark:text-amber-300',
    edge: 'before:bg-amber-400',
  },
  emerald: {
    tile: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    label: 'text-emerald-700 dark:text-emerald-300',
    edge: 'before:bg-emerald-500',
  },
  sky: { tile: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', label: 'text-sky-700 dark:text-sky-300', edge: 'before:bg-sky-500' },
  violet: {
    tile: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    label: 'text-violet-700 dark:text-violet-300',
    edge: 'before:bg-violet-500',
  },
  slate: { tile: 'bg-slate-100 text-slate-700 dark:bg-ink-700 dark:text-slate-200', label: 'text-slate-600 dark:text-slate-300', edge: 'before:bg-slate-400' },
}

/**
 * A card in the chat: its own thing, not a bubble. A coloured edge and icon say what it is (open
 * item amber, Pay me green, Settle up blue, Balances violet, Expense grey); the words that went
 * with it sit under a line at the bottom; a reply's quote sits on top.
 */
function ChatCard({
  tone,
  icon,
  label,
  m,
  ctx,
  mine,
  children,
  testId,
}: {
  tone: Tone
  icon: ReactNode
  label: string
  m: ChatMessage
  ctx: MessageCtx
  mine: boolean
  children: ReactNode
  testId?: string
}) {
  const t = TONES[tone]
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-white p-3.5 pl-4 shadow-md ring-1 ring-slate-900/5 before:absolute before:inset-y-0 before:left-0 before:w-1 dark:bg-ink-900 dark:ring-white/10 ${t.edge}`}
      data-testid={testId}
    >
      {m.replyTo && <Quote r={m.replyTo} ctx={ctx} mine={mine} />}
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.tile}`} aria-hidden>
          {icon}
        </span>
        <span className={`text-[11px] font-bold uppercase tracking-wide ${t.label}`}>{label}</span>
      </div>
      <div className="mt-2">{children}</div>
      {m.text && (
        <div className="mt-3 whitespace-pre-wrap break-words border-t border-slate-100 pt-2 text-sm leading-snug dark:border-white/5">
          <Words text={m.text} mentions={m.mentions} ctx={ctx} mine={mine} />
        </div>
      )}
    </div>
  )
}

const btnPrimary = 'mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-fill px-3 text-sm font-bold text-on-fill'
const btnQuiet = 'mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 text-sm font-semibold dark:bg-ink-800'

/** Who an ask is for: "Asked everyone", "Asked Rahul and Priya". */
function askedLine(to: MemberId[] | undefined, ctx: MessageCtx): string {
  if (!to?.length) return 'Asked everyone in the group'
  return `Asked ${listNames(to.map((id) => (id === ctx.me ? 'you' : labelOf(ctx.group.members, id, 'someone', ctx.me))))}`
}

/** The open item, Pay me, Settle up, Balances or expense a message carries, as it is now (live). */
function Card({ m, ctx, mine, memberId }: { m: ChatMessage; ctx: MessageCtx; mine: boolean; memberId?: MemberId }) {
  const { group } = ctx
  const cur = group.currency
  const authorName = memberId ? labelOf(group.members, memberId, m.authorName, ctx.me) : m.authorName
  const shell = (tone: Tone, icon: ReactNode, label: string, body: ReactNode, testId?: string) => (
    <ChatCard tone={tone} icon={icon} label={label} m={m} ctx={ctx} mine={mine} testId={testId}>
      {body}
    </ChatCard>
  )

  if (m.kind === 'openItem') {
    const entry = m.ref ? ctx.openItems.get(m.ref) : undefined
    if (!entry) return shell('amber', <ClipboardList size={15} />, 'Open item', <div className="text-muted text-sm">No longer here</div>)
    const { item, state } = entry
    const who = suspectLine(item.suspects, ctx.me, (id) => (group.members[id] ? labelOf(group.members, id, '', ctx.me) : undefined))
    return shell(
      'amber',
      <ClipboardList size={15} />,
      'Open item',
      <>
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" aria-hidden>
            <IconFace iconSvg={item.iconSvg} iconImage={item.iconImage} emoji={openItemEmoji(item)} vault={!!group.vault} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{item.title}</div>
            <div className="text-muted truncate text-xs">{openItemMeta(item, cur, ctx.today)}</div>
          </div>
        </div>
        {who && state === 'open' && <div className="text-muted mt-1.5 text-xs">{who}</div>}
        {state === 'open' ? (
          <Link to={claimHref(group.id, item.id)} className={btnPrimary} data-testid="chat-claim">
            <HandCoins size={16} aria-hidden /> I paid, claim it
          </Link>
        ) : state === 'claimed' ? (
          <Link to={`/groups/${group.id}/expenses/${item.expenseId}`} className="pos mt-2 flex min-h-11 items-center gap-1.5 text-sm font-semibold">
            <Check size={16} aria-hidden /> Claimed and added
          </Link>
        ) : (
          <div className="text-muted mt-2 text-xs">Deleted</div>
        )}
      </>,
      'chat-card-open',
    )
  }

  if (m.kind === 'merge')
    return shell(
      'violet',
      <Users size={15} />,
      'Merge',
      <div data-testid="chat-merge">
        <MergeChatCard group={group} request={m.ref ? ctx.mergeRequests.get(m.ref) : undefined} me={ctx.me} myUid={ctx.uid} />
      </div>,
    )

  if (m.kind === 'pay') {
    const amount = formatMoney(m.amount ?? 0, cur)
    const pay = payCard(m, { groupId: group.id, me: ctx.uid, myMember: ctx.me, authorMember: memberId })
    return shell(
      'emerald',
      <HandCoins size={15} />,
      'Pay me',
      <>
        <div className="text-3xl font-extrabold tabular-nums">{amount}</div>
        <div className="text-muted mt-0.5 text-xs">{askedLine(m.to, ctx)}</div>
        {pay && 'href' in pay && (
          <Link to={pay.href} className={btnPrimary} data-testid="chat-pay">
            Pay {authorName} {amount}
          </Link>
        )}
      </>,
      'chat-card-pay',
    )
  }

  if (m.kind === 'settle') {
    const view = settleCard(m, { groupId: group.id, me: ctx.uid, myMember: ctx.me, authorMember: memberId, debts: ctx.pairDebts, members: ctx.members })
    return shell(
      'sky',
      <Handshake size={15} />,
      'Settle up',
      <>
        <div className="text-base font-semibold">{mine ? 'You asked to settle up' : `${authorName} asks to settle up`}</div>
        <div className="text-muted mt-0.5 text-xs">{askedLine(m.to, ctx)}</div>
        {view?.kind === 'owe' && (
          <Link to={view.href} className={btnPrimary} data-testid="chat-settle">
            Settle {formatMoney(view.amount, cur)} with {authorName}
          </Link>
        )}
        {view?.kind === 'owed' && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            {authorName} owes you {formatMoney(view.amount, cur)}
          </div>
        )}
        {view?.kind === 'square' && (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-ink-800">
            <Check size={16} className="pos" aria-hidden /> You’re all settled with {authorName}
          </div>
        )}
        {view?.kind === 'mine' && (
          <div className="text-muted mt-2 text-sm">
            {view.owing === 0 ? 'Everyone you asked is settled with you' : `${view.owing} ${view.owing === 1 ? 'person still owes' : 'people still owe'} you`}
          </div>
        )}
      </>,
      'chat-card-settle',
    )
  }

  if (m.kind === 'balances') {
    const shown = ctx.debts.slice(0, 6)
    const name = (id: MemberId) => (id === ctx.me ? 'You' : labelOf(group.members, id, 'Someone', ctx.me))
    return shell(
      'violet',
      <Scale size={15} />,
      'Balances',
      <>
        {shown.length === 0 ? (
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Check size={16} className="pos" aria-hidden /> Everyone’s settled up
          </div>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((d) => (
              <li key={`${d.from}-${d.to}`} className={`flex items-center gap-1.5 text-sm ${d.from === ctx.me || d.to === ctx.me ? 'font-semibold' : ''}`}>
                <span className="min-w-0 truncate">{name(d.from)}</span>
                <ArrowRight size={14} className="text-muted shrink-0" aria-label="pays" />
                <span className="min-w-0 flex-1 truncate">{name(d.to)}</span>
                <span className="shrink-0 tabular-nums">{formatMoney(d.amount, cur)}</span>
              </li>
            ))}
            {ctx.debts.length > shown.length && <li className="text-muted text-xs">and {ctx.debts.length - shown.length} more</li>}
          </ul>
        )}
        <div className="text-muted mt-1.5 text-[11px]">Live: always shows the group as it is now</div>
        {shown.length > 0 && (
          <Link to={`/groups/${group.id}/settle`} className={btnQuiet}>
            Settle up
          </Link>
        )}
      </>,
      'chat-card-balances',
    )
  }

  // expense
  const e = m.ref ? ctx.expenses.get(m.ref) : undefined
  if (!e || typeof e.deletedAt === 'number')
    return shell('slate', <Receipt size={15} />, 'Expense', <div className="text-muted text-sm">{e ? 'Deleted' : 'No longer here'}</div>)
  const payers = Object.keys(handlersOf(e))
  const paidBy = payers.length > 1 ? `${payers.length} people` : payers[0] === ctx.me ? 'you' : labelOf(group.members, payers[0], 'someone', ctx.me)
  return (
    <Link to={`/groups/${group.id}/expenses/${e.id}`} className="block" data-testid="chat-expense">
      {shell(
        'slate',
        <Receipt size={15} />,
        isReceived(e) ? 'Money received' : 'Expense',
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" aria-hidden>
            <IconFace iconSvg={e.iconSvg} iconImage={e.iconImage} emoji={expenseEmoji(e)} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{e.description}</div>
            <div className="text-muted truncate text-xs">
              {isReceived(e) ? 'Received by' : 'Paid by'} {paidBy}
            </div>
          </div>
          <div className="shrink-0 text-base font-bold tabular-nums">{formatMoney(e.amount, cur)}</div>
        </div>,
      )}
    </Link>
  )
}
