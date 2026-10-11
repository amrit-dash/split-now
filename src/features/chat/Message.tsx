import { useRef, useState, type ReactNode } from 'react'
import { labelOf } from '@/lib/shortNames'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Clock, HandCoins, Receipt } from 'lucide-react'
import type { ActivityEntry, ChatMessage, Expense, Group, MemberId, MergeRequest, OpenItem } from '@/types'
import { activityText } from '@/lib/activity'
import { CATEGORIES } from '@/lib/categories'
import { authorMember, linkParts, payCard, type ChatRow } from '@/lib/chat'
import { formatTime } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { claimHref, openItemMeta, type OpenItemState, suspectLine } from '@/lib/open-items'
import { Avatar } from '@/components/Avatar'
import { MergeChatCard } from '@/features/merge/Merge'
import { mentionParts } from '../../../shared/mentions'

export interface MessageCtx {
  group: Group
  /** the viewer */
  uid: string
  me?: MemberId
  today: string
  openItems: Map<string, { item: OpenItem; state: OpenItemState }>
  expenses: Map<string, Expense>
  /** the group's merge requests by id (a merge card shows its live state) */
  mergeRequests: Map<string, MergeRequest>
  /** every member's label in the group, for @mentions */
  labels: Record<MemberId, string>
  /** long-press / right-click / Enter on a bubble */
  onMenu: (m: ChatMessage) => void
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

/** Expenses and payments between messages, as one quiet pill that opens to show them. */
export function UpdatesPill({ entries, uid }: { entries: ActivityEntry[]; uid: string }) {
  const [open, setOpen] = useState(false)
  const first = activityText(entries[0], uid)
  return (
    <div className="my-2 flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-9 max-w-[85%] items-center gap-1.5 rounded-full bg-slate-200/70 px-3 py-1 text-xs text-slate-600 dark:bg-ink-800 dark:text-slate-300"
        data-testid="chat-updates"
      >
        <Receipt size={13} className="shrink-0" aria-hidden />
        <span className="truncate">{entries.length === 1 ? first : `${entries.length} updates · ${first}`}</span>
        {entries.length > 1 && <ChevronDown size={14} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden />}
      </button>
      {open && entries.length > 1 && (
        <ul className="mt-1.5 w-[85%] space-y-1 rounded-2xl bg-slate-100 p-2 text-xs text-slate-600 dark:bg-ink-900 dark:text-slate-300">
          {entries.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="text-muted shrink-0 tabular-nums">{formatTime(a.createdAt)}</span>
              <span className="min-w-0">{activityText(a, uid)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Words with @mentions picked out (yours stronger) and http(s) links made tappable (never any other scheme). */
function Words({ text, mine, ctx, mentions }: { text: string; mine: boolean; ctx: MessageCtx; mentions?: MemberId[] }) {
  const parts = mentions?.length ? mentionParts(text, ctx.labels, mentions) : [{ text }]
  return (
    <>
      {parts.map((part, j) =>
        part.mention ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
            key={j}
            className={`font-semibold ${part.mention === ctx.me ? (mine ? 'rounded bg-white/25 px-0.5' : 'rounded bg-brand-100 px-0.5 text-brand-800 dark:bg-brand-500/25 dark:text-brand-200') : mine ? '' : 'text-brand-700 dark:text-brand-300'}`}
          >
            {part.text}
          </span>
        ) : (
          linkParts(part.text).map((p, i) =>
            p.href ? (
              <a
                // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
                key={`${j}-${i}`}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={`underline underline-offset-2 ${mine ? '' : 'text-brand-700 dark:text-brand-300'}`}
              >
                {p.text}
              </a>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
              <span key={`${j}-${i}`}>{p.text}</span>
            ),
          )
        ),
      )}
    </>
  )
}

/** Press and hold (or right-click, or Enter) opens the message's menu. */
function useHold(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const clear = () => {
    clearTimeout(timer.current)
    start.current = null
  }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => {
        start.current = null
        onHold()
      }, 450)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
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
  }
}

export function MessageRow({ row, ctx }: { row: Extract<ChatRow, { type: 'message' }>; ctx: MessageCtx }) {
  const { message: m, mine, first, last } = row
  const memberId = authorMember(ctx.group, m.authorUid)
  const member = memberId ? ctx.group.members[memberId] : undefined
  const label = memberId ? labelOf(ctx.group.members, memberId, m.authorName, ctx.me) : m.authorName
  const hold = useHold(() => ctx.onMenu(m))
  const time = formatTime(m.createdAt)
  const card = m.kind === 'text' ? null : <Card m={m} ctx={ctx} mine={mine} memberId={memberId} />
  const tail = last ? (mine ? 'rounded-br-md' : 'rounded-bl-md') : ''
  return (
    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-2' : 'mt-0.5'}`} data-testid="chat-message">
      {!mine && (
        <div className="w-8 shrink-0" aria-hidden>
          {last && <Avatar name={member?.name ?? m.authorName} color={member?.color ?? '#94a3b8'} photoURL={member?.photoURL} size={32} />}
        </div>
      )}
      <div
        {...hold}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the bubble opens its menu from the keyboard (Enter)
        tabIndex={0}
        role="article"
        aria-label={`${mine ? 'You' : label}, ${time}${m.pending ? ', sending' : ''}. Press Enter for options`}
        className={`max-w-[80%] select-text rounded-3xl px-3.5 py-2 shadow-sm outline-offset-2 ${tail} ${
          mine ? 'bg-fill text-on-fill' : 'bg-white text-slate-900 dark:bg-ink-800 dark:text-slate-100'
        } ${card ? 'min-w-[14rem]' : ''}`}
      >
        {!mine && first && (
          <div className="mb-0.5 text-xs font-bold" style={{ color: member?.color && member.color !== 'accent' ? member.color : undefined }}>
            {label}
          </div>
        )}
        {card}
        {m.text && (
          <div className={`whitespace-pre-wrap break-words text-[15px] leading-snug ${card ? 'mt-2' : ''}`}>
            <Words text={m.text} mine={mine} ctx={ctx} mentions={m.mentions} />
          </div>
        )}
        <div className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums ${mine ? 'text-on-fill/75' : 'text-muted'}`}>
          {time}
          {mine && (m.pending ? <Clock size={12} aria-label="Sending" /> : <Check size={13} aria-label="Sent" />)}
        </div>
      </div>
    </div>
  )
}

function CardBox({ children, mine }: { children: ReactNode; mine: boolean }) {
  return <div className={`rounded-2xl p-3 ${mine ? 'bg-white/15' : 'bg-slate-50 dark:bg-ink-900'}`}>{children}</div>
}

/** The open item, Pay me or expense a message carries, as it is now (live). */
function Card({ m, ctx, mine, memberId }: { m: ChatMessage; ctx: MessageCtx; mine: boolean; memberId?: MemberId }) {
  const { group } = ctx
  const sub = mine ? 'text-on-fill/80' : 'text-muted'
  if (m.kind === 'openItem') {
    const entry = m.ref ? ctx.openItems.get(m.ref) : undefined
    if (!entry)
      return (
        <CardBox mine={mine}>
          <div className="text-sm font-semibold">🧾 Open item</div>
          <div className={`text-xs ${sub}`}>No longer here</div>
        </CardBox>
      )
    const { item, state } = entry
    const cat = CATEGORIES[item.category ?? 'other']
    const who = suspectLine(item.suspects, ctx.me, (id) => (group.members[id] ? labelOf(group.members, id, '', ctx.me) : undefined))
    return (
      <CardBox mine={mine}>
        <div className={`text-[11px] font-bold uppercase tracking-wide ${sub}`}>Open item</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xl" aria-hidden>
            {cat.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{item.title}</div>
            <div className={`truncate text-xs ${sub}`}>{openItemMeta(item, group.currency, ctx.today)}</div>
          </div>
        </div>
        {who && state === 'open' && <div className={`mt-1 text-xs ${sub}`}>{who}</div>}
        {state === 'open' ? (
          <Link
            to={claimHref(group.id, item.id)}
            className={`mt-2 flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-bold ${mine ? 'bg-white/90 text-slate-900' : 'bg-fill text-on-fill'}`}
            data-testid="chat-claim"
          >
            <HandCoins size={16} aria-hidden /> I paid, claim it
          </Link>
        ) : state === 'claimed' ? (
          <Link
            to={`/groups/${group.id}/expenses/${item.expenseId}`}
            className={`mt-2 flex min-h-10 items-center gap-1.5 text-sm font-semibold ${mine ? '' : 'pos'}`}
          >
            <Check size={16} aria-hidden /> Claimed and added
          </Link>
        ) : (
          <div className={`mt-2 text-xs ${sub}`}>Deleted</div>
        )}
      </CardBox>
    )
  }
  if (m.kind === 'merge') {
    // Light inside any bubble: the card has its own buttons.
    return (
      <div className="rounded-2xl bg-white p-3 text-slate-900 dark:bg-ink-900 dark:text-slate-100" data-testid="chat-merge">
        <MergeChatCard group={group} request={m.ref ? ctx.mergeRequests.get(m.ref) : undefined} me={ctx.me} myUid={ctx.uid} />
      </div>
    )
  }
  if (m.kind === 'pay') {
    const amount = formatMoney(m.amount ?? 0, group.currency)
    const pay = payCard(m, { groupId: group.id, me: ctx.uid, myMember: ctx.me, authorMember: memberId })
    return (
      <CardBox mine={mine}>
        <div className={`text-[11px] font-bold uppercase tracking-wide ${sub}`}>Pay me</div>
        <div className="mt-0.5 text-2xl font-extrabold tabular-nums">{amount}</div>
        {pay && !pay.mine && (
          <Link
            to={pay.href}
            className="mt-2 flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-fill text-sm font-bold text-on-fill"
            data-testid="chat-pay"
          >
            Pay {amount}
          </Link>
        )}
        {pay?.mine && <div className={`mt-1 text-xs ${sub}`}>You asked the group for this</div>}
      </CardBox>
    )
  }
  // expense
  const e = m.ref ? ctx.expenses.get(m.ref) : undefined
  if (!e || typeof e.deletedAt === 'number')
    return (
      <CardBox mine={mine}>
        <div className="text-sm font-semibold">🧾 Expense</div>
        <div className={`text-xs ${sub}`}>{e ? 'Deleted' : 'No longer here'}</div>
      </CardBox>
    )
  const cat = CATEGORIES[e.category]
  const payers = Object.keys(e.paidBy)
  const paidBy = payers.length > 1 ? `${payers.length} people` : payers[0] === ctx.me ? 'you' : (group.members[payers[0]]?.name ?? 'someone')
  return (
    <Link to={`/groups/${group.id}/expenses/${e.id}`} className="block" data-testid="chat-expense">
      <CardBox mine={mine}>
        <div className={`text-[11px] font-bold uppercase tracking-wide ${sub}`}>Expense</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xl" aria-hidden>
            {cat.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{e.description}</div>
            <div className={`truncate text-xs ${sub}`}>Paid by {paidBy}</div>
          </div>
          <div className="shrink-0 font-bold tabular-nums">{formatMoney(e.amount, group.currency)}</div>
        </div>
      </CardBox>
    </Link>
  )
}
