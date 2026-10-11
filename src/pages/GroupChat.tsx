import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ArrowDown, ChevronLeft, Copy, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useBack } from '@/hooks/useBack'
import { CHAT_WINDOW, myMemberId, useActivity, useChat, useExpenses, useGroup, useOpenItems } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import type { ChatMessage } from '@/types'
import { usePageTitle } from '@/lib/brand'
import { chatRows, markRead, readAtOf, unreadCount } from '@/lib/chat'
import { copy } from '@/lib/share'
import { errText } from '@/lib/errors'
import { todayISO } from '@/lib/id'
import { openItemState } from '@/lib/open-items'
import { GroupIcon } from '@/components/GroupIcon'
import { Empty } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { Composer } from '@/features/chat/Composer'
import { DayHeader, type MessageCtx, MessageRow, UnreadLine, UpdatesPill } from '@/features/chat/Message'

/** How far from the bottom (px) still counts as "at the bottom": new messages then scroll into view. */
const NEAR_BOTTOM = 160

/**
 * /groups/:groupId/chat: the group's money chat. Full screen (no tab bar), WhatsApp-like: bubbles
 * that run together, day headers that stick, an "Unread messages" line where you left off, the
 * group's expenses and payments as quiet pills between messages, and cards for open items, Pay
 * me and expenses. The newest CHAT_WINDOW messages are live; older ones load as you scroll up.
 */
export default function GroupChat() {
  const { groupId = '' } = useParams()
  const { user, profile } = useMe()
  const toast = useToast()
  const goBack = useBack(`/groups/${groupId}`)
  const chatOn = useFlag('groupChat')
  const openItemsOn = useFlag('openItems')
  const group = useGroup(groupId)
  const live = useChat(groupId, CHAT_WINDOW, chatOn)
  const activity = useActivity(groupId)
  const expenses = useExpenses(groupId)
  const openItems = useOpenItems(openItemsOn ? groupId : undefined)
  usePageTitle(group ? `${group.name} chat` : undefined)

  // Where you left off when the screen opened: the unread line stays there while you read.
  const [readAt] = useState(() => readAtOf(groupId))
  const [older, setOlder] = useState<ChatMessage[]>([])
  const [exhausted, setExhausted] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [seenAt, setSeenAt] = useState(readAt ?? 0)
  const scroller = useRef<HTMLDivElement>(null)
  const firstScroll = useRef(false)
  const keep = useRef<{ height: number; top: number } | null>(null)

  const messages = useMemo(() => {
    if (!live) return null
    const ids = new Set(live.map((m) => m.id))
    return [...older.filter((m) => !ids.has(m.id)), ...live]
  }, [live, older])
  // Fewer than a full window live means the start of the chat is already here.
  const startLoaded = exhausted || (!!live && live.length < CHAT_WINDOW)
  const today = todayISO()
  const rows = useMemo(
    () =>
      messages
        ? chatRows(messages, {
            me: user.uid,
            today,
            readAt,
            activity: activity ?? [],
            olderThan: startLoaded ? undefined : messages[0]?.createdAt,
          })
        : [],
    [messages, user.uid, today, readAt, activity, startLoaded],
  )

  const ctx: MessageCtx | null = useMemo(() => {
    if (!group) return null
    const byId = new Map((expenses ?? []).map((e) => [e.id, e]))
    return {
      group,
      uid: user.uid,
      me: myMemberId(group, user.uid),
      today,
      expenses: byId,
      openItems: new Map((openItems ?? []).map((o) => [o.id, { item: o, state: openItemState(o, expenses ? byId : null) }])),
      onMenu: setMenuFor,
    }
  }, [group, user.uid, today, expenses, openItems])

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // First paint: at the unread line if there is one, else at the bottom.
  useLayoutEffect(() => {
    if (firstScroll.current || !messages) return
    firstScroll.current = true
    const unread = document.getElementById('chat-unread')
    if (unread) unread.scrollIntoView({ block: 'center' })
    else scrollToBottom()
  }, [messages, scrollToBottom])

  // A new message: follow it when you're at the bottom or it's yours; otherwise the ↓ button counts it.
  const newest = messages?.[messages.length - 1]
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the newest message changes
  useLayoutEffect(() => {
    if (!newest || !firstScroll.current) return
    if (atBottom || newest.authorUid === user.uid) scrollToBottom(true)
  }, [newest?.id])

  // Older messages loaded above: keep what you were looking at in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after older messages are added
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !keep.current) return
    el.scrollTop = keep.current.top + (el.scrollHeight - keep.current.height)
    keep.current = null
  }, [older])

  // Read: what's on screen while the app is in front.
  useEffect(() => {
    if (!newest || !atBottom) return
    const mark = () => {
      if (document.visibilityState !== 'visible') return
      markRead(groupId, newest.createdAt)
      setSeenAt(newest.createdAt)
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [newest, atBottom, groupId])

  const loadOlder = useCallback(async () => {
    const el = scroller.current
    if (!messages?.length || startLoaded || loadingOlder || !el) return
    setLoadingOlder(true)
    try {
      const page = await repo.fetchChatBefore(groupId, messages[0].createdAt, CHAT_WINDOW)
      keep.current = { height: el.scrollHeight, top: el.scrollTop }
      if (page.length < CHAT_WINDOW) setExhausted(true)
      if (page.length) setOlder((o) => [...page, ...o])
      else keep.current = null
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setLoadingOlder(false)
    }
  }, [messages, startLoaded, loadingOlder, groupId, toast])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM)
    if (el.scrollTop < 200) void loadOlder()
  }

  if (!chatOn) return <Navigate to={`/groups/${groupId}`} replace />
  if (group === null)
    return (
      <div className="mx-auto max-w-lg px-4 pt-[calc(var(--safe-top)+2rem)]">
        <Empty emoji="🔍" title="This group doesn’t exist or you’re not a member" />
      </div>
    )
  if (group && group.type === 'personal') return <Navigate to={`/groups/${groupId}`} replace />

  const myName = (group && ctx?.me && group.members[ctx.me]?.name) || profile.displayName || 'Someone'
  const send = (m: Omit<ChatMessage, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'pending'>) => {
    repo.postChat(groupId, { ...m, authorUid: user.uid, authorName: myName.slice(0, 80), createdAt: Date.now() }).catch((e) => toast(errText(e), 'err'))
  }
  const removeMessage = (m: ChatMessage) => {
    setMenuFor(null)
    const { id, pending: _p, ...rest } = m
    repo
      .deleteChat(groupId, id)
      .then(() =>
        toast('Message deleted', 'ok', {
          action: { label: 'Undo', run: () => void repo.postChat(groupId, rest, id).catch((e) => toast(errText(e), 'err')) },
        }),
      )
      .catch((e) => toast(errText(e), 'err'))
  }
  const newBelow = atBottom ? 0 : unreadCount(messages, seenAt, user.uid)
  const members = group ? Object.values(group.members).filter((m) => typeof m.removedAt !== 'number') : []

  return (
    <div className="flex h-dvh flex-col bg-slate-100 dark:bg-ink-950">
      <header className="z-20 border-b border-slate-200/70 bg-slate-50/95 px-2 pb-2 pt-[calc(var(--safe-top)+0.5rem)] backdrop-blur-xl dark:border-white/5 dark:bg-ink-950/95">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
            aria-label="Back"
          >
            <ChevronLeft size={24} aria-hidden />
          </button>
          {group && <GroupIcon emoji={group.emoji} size={36} />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{group?.name ?? ' '}</h1>
            <div className="text-muted truncate text-xs">
              {members.length
                ? members
                    .map((m) => m.name.split(' ')[0])
                    .slice(0, 6)
                    .join(', ') + (members.length > 6 ? ` +${members.length - 6}` : '')
                : ''}
            </div>
          </div>
        </div>
      </header>

      <div ref={scroller} onScroll={onScroll} className="relative flex-1 overflow-y-auto overscroll-contain px-3" data-testid="chat-scroll">
        <div className="mx-auto max-w-2xl pb-3">
          {messages === null || !ctx ? (
            <div className="text-muted py-10 text-center text-sm" role="status">
              Loading messages…
            </div>
          ) : (
            <>
              {startLoaded ? (
                <div className="mx-auto my-4 max-w-sm rounded-2xl bg-amber-50 px-4 py-3 text-center text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                  The group’s money chat. Ask who paid, write down an open item anyone can claim, or send a Pay me. Everyone in the group sees the whole chat,
                  including people who join later.
                </div>
              ) : (
                <div className="text-muted py-3 text-center text-xs" role="status">
                  {loadingOlder ? 'Loading earlier messages…' : ''}
                </div>
              )}
              {rows.map((r) =>
                r.type === 'day' ? (
                  <DayHeader key={r.key} label={r.label} />
                ) : r.type === 'unread' ? (
                  <UnreadLine key={r.key} />
                ) : r.type === 'updates' ? (
                  <UpdatesPill key={r.key} entries={r.entries} uid={user.uid} />
                ) : (
                  <MessageRow key={r.key} row={r} ctx={ctx} />
                ),
              )}
            </>
          )}
        </div>
      </div>

      <div className="relative">
        {!atBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute -top-14 right-4 z-10 flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-white px-3 text-sm font-semibold shadow-lg dark:bg-ink-800"
            aria-label={newBelow ? `${newBelow} new ${newBelow === 1 ? 'message' : 'messages'}, jump to latest` : 'Jump to latest'}
            data-testid="chat-jump"
          >
            {newBelow > 0 && <span className="rounded-full bg-fill px-1.5 text-xs text-on-fill">{newBelow}</span>}
            <ArrowDown size={18} aria-hidden />
          </button>
        )}
        {group && <Composer group={group} expenses={expenses ?? []} openItemsOn={openItemsOn} onSend={send} />}
      </div>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title="Message">
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          {menuFor?.text && (
            <li>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 px-2 text-left font-medium"
                onClick={async () => {
                  const ok = await copy(menuFor.text)
                  setMenuFor(null)
                  toast(ok ? 'Copied' : 'Copy failed', ok ? 'ok' : 'err')
                }}
              >
                <Copy size={20} aria-hidden /> Copy text
              </button>
            </li>
          )}
          {menuFor && menuFor.authorUid === user.uid && (
            <li>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 px-2 text-left font-medium text-rose-700 dark:text-rose-400"
                onClick={() => removeMessage(menuFor)}
                data-testid="chat-delete"
              >
                <Trash2 size={20} aria-hidden /> Delete message
              </button>
            </li>
          )}
          {menuFor && menuFor.authorUid !== user.uid && !menuFor.text && <li className="text-muted px-2 py-3 text-sm">Nothing to do with this message.</li>}
        </ul>
      </Sheet>
    </div>
  )
}
