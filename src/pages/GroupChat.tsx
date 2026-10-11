import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { labelOf } from '@/lib/shortNames'
import { Navigate, useParams } from 'react-router-dom'
import { ArrowDown, Bell, BellOff, ChevronLeft, Copy, Info, Pencil, Reply, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useBack } from '@/hooks/useBack'
import {
  CHAT_WINDOW,
  computeGroupData,
  myMemberId,
  useActivity,
  useChat,
  useExpenses,
  useGroup,
  useMergeRequests,
  useOpenItems,
  useSettlements,
} from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import type { ChatMessage, ChatReplyRef } from '@/types'
import { usePageTitle } from '@/lib/brand'
import { canEdit, chatIsEmpty, chatRows, markRead, readAtOf, replyRef, unreadCount } from '@/lib/chat'
import { mentionables, setSuggestOn, suggestOn } from '@/lib/chat-tools'
import { chatViewportBox } from '@/lib/keyboard'
import { saveCapturePrefs } from '@/lib/capture-settings'
import { setChatMuted } from '@/lib/push'
import { formatMoney } from '@/lib/money'
import { copy } from '@/lib/share'
import { errText } from '@/lib/errors'
import { todayISO } from '@/lib/id'
import { openItemState } from '@/lib/open-items'
import { GroupIcon } from '@/components/GroupIcon'
import { Empty } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { Composer, type Draft } from '@/features/chat/Composer'
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
  const [replyTo, setReplyTo] = useState<ChatReplyRef | null>(null)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [info, setInfo] = useState(false)
  const [suggest, setSuggest] = useState(suggestOn)
  const settlements = useSettlements(groupId)
  const mergeRequests = useMergeRequests(groupId)
  const prefs = useCapturePrefs()
  const box = useChatViewport()
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

  const data = useMemo(
    () => (group && expenses && settlements ? computeGroupData(group, expenses, settlements, user.uid) : null),
    [group, expenses, settlements, user.uid],
  )
  const me = group ? myMemberId(group, user.uid) : undefined
  const mentionList = useMemo(() => (group ? mentionables(group.members, me) : []), [group, me])
  const allTags = useMemo(() => (group ? mentionables(group.members, me, true) : []), [group, me])

  /** Reply: the quote keeps a card's one line too (the open item's title, the amount asked). */
  const startReply = useCallback(
    (m: ChatMessage) => {
      const line =
        m.kind === 'pay' && group
          ? formatMoney(m.amount ?? 0, group.currency)
          : m.kind === 'openItem' && m.ref
            ? openItems?.find((o) => o.id === m.ref)?.title
            : m.kind === 'expense' && m.ref
              ? expenses?.find((e) => e.id === m.ref)?.description
              : undefined
      setEditing(null)
      setMenuFor(null)
      setReplyTo(replyRef(m, line))
    },
    [group, openItems, expenses],
  )
  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.remove('chat-flash')
    void el.offsetWidth
    el.classList.add('chat-flash')
  }, [])

  const ctx: MessageCtx | null = useMemo(() => {
    if (!group) return null
    const byId = new Map((expenses ?? []).map((e) => [e.id, e]))
    return {
      group,
      uid: user.uid,
      me,
      today,
      expenses: byId,
      openItems: new Map((openItems ?? []).map((o) => [o.id, { item: o, state: openItemState(o, expenses ? byId : null) }])),
      pairDebts: data?.rawDebts ?? [],
      debts: data?.debts ?? [],
      members: Object.keys(group.members).filter((id) => typeof group.members[id].removedAt !== 'number'),
      mentionList: allTags,
      mergeRequests: new Map((mergeRequests ?? []).map((r) => [r.id, r])),
      onMenu: setMenuFor,
      onReply: startReply,
      onJump: jumpTo,
    }
  }, [group, user.uid, me, today, expenses, openItems, data, allTags, mergeRequests, startReply, jumpTo])

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

  const myName = (group && me && group.members[me]?.name) || profile.displayName || 'Someone'
  const send = (m: Draft) => {
    setReplyTo(null)
    repo.postChat(groupId, { ...m, authorUid: user.uid, authorName: myName.slice(0, 80), createdAt: Date.now() }).catch((e) => toast(errText(e), 'err'))
  }
  const saveEdit = (m: ChatMessage, text: string, mentions: string[]) => {
    setEditing(null)
    if (text === m.text) return
    repo.editChat(groupId, m.id, { text, mentions }).catch((e) => toast(errText(e), 'err'))
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
  // Muting is yours only (users/{uid}/settings/notifications mutedChats): the others still get theirs.
  const muted = !!prefs?.mutedChats.includes(groupId)
  const toggleMute = () => {
    const next = setChatMuted(prefs?.mutedChats ?? [], groupId, !muted)
    saveCapturePrefs(user.uid, repo.mode, { mutedChats: next })
      .then(() => toast(muted ? 'Chat notifications on' : 'Chat muted. You still hear when someone tags you'))
      .catch((e) => toast(errText(e), 'err'))
  }
  const newBelow = atBottom ? 0 : unreadCount(messages, seenAt, user.uid)
  const members = ctx?.members ?? []

  return (
    // Pinned to what's visible (src/lib/keyboard.ts): with the keyboard up only the messages scroll; the header and the box stay put.
    <div className="fixed inset-x-0 top-0 flex flex-col" style={{ height: box.height, transform: box.top ? `translateY(${box.top}px)` : undefined }}>
      <header className="z-20 border-b border-slate-200 bg-white px-2 pb-2 pt-[calc(var(--safe-top)+0.5rem)] shadow-sm dark:border-white/10 dark:bg-ink-900">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-ink-800"
            aria-label="Back"
          >
            <ChevronLeft size={24} aria-hidden />
          </button>
          {group && <GroupIcon emoji={group.emoji} group={group} size={36} />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{group?.name ?? ' '}</h1>
            <div className="text-muted truncate text-xs">
              {group?.type === 'direct'
                ? 'Just the two of you'
                : members.length
                  ? members
                      .map((id) => (group && id === me ? 'You' : labelOf(group?.members ?? {}, id, '', me)))
                      .slice(0, 6)
                      .join(', ') + (members.length > 6 ? ` +${members.length - 6}` : '')
                  : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleMute}
            disabled={!prefs}
            aria-pressed={muted}
            aria-label={muted ? 'Chat muted. Turn notifications back on' : 'Mute this chat'}
            title={muted ? 'Muted' : 'Mute'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition ${
              muted
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-ink-800'
            }`}
            data-testid="chat-mute"
          >
            {muted ? <BellOff size={20} aria-hidden /> : <Bell size={20} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setInfo(true)}
            aria-label="About this chat"
            aria-haspopup="dialog"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-ink-800"
            data-testid="chat-info"
          >
            <Info size={20} aria-hidden />
          </button>
        </div>
      </header>

      <div ref={scroller} onScroll={onScroll} className="chat-wallpaper relative flex-1 overflow-y-auto overscroll-contain px-3" data-testid="chat-scroll">
        <div className="mx-auto max-w-2xl pb-3">
          {messages === null || !ctx ? (
            <div className="text-muted py-10 text-center text-sm" role="status">
              Loading messages…
            </div>
          ) : (
            <>
              {startLoaded && chatIsEmpty(rows) ? (
                <div
                  className="mx-auto my-6 max-w-sm rounded-2xl bg-amber-50 px-4 py-3 text-center text-xs text-amber-900 shadow-sm dark:bg-amber-500/10 dark:text-amber-100"
                  data-testid="chat-intro"
                >
                  {INTRO}
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
        {group && (
          <Composer
            group={group}
            expenses={expenses ?? []}
            openItemsOn={openItemsOn}
            me={me}
            mentionList={mentionList}
            pairDebts={data?.rawDebts ?? []}
            suggest={suggest}
            onSend={send}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onEdit={saveEdit}
          />
        )}
      </div>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title="Message" testId="chat-menu">
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
          {menuFor && !menuFor.pending && (
            <MenuRow icon={<Reply size={20} aria-hidden />} label="Reply" onClick={() => startReply(menuFor)} testId="chat-reply" />
          )}
          {menuFor?.text && (
            <MenuRow
              icon={<Copy size={20} aria-hidden />}
              label="Copy text"
              onClick={async () => {
                const ok = await copy(menuFor.text)
                setMenuFor(null)
                toast(ok ? 'Copied' : 'Copy failed', ok ? 'ok' : 'err')
              }}
            />
          )}
          {menuFor && canEdit(menuFor, user.uid) && (
            <MenuRow
              icon={<Pencil size={20} aria-hidden />}
              label="Edit message"
              onClick={() => {
                setReplyTo(null)
                setEditing(menuFor)
                setMenuFor(null)
              }}
              testId="chat-edit"
            />
          )}
          {menuFor && menuFor.authorUid === user.uid && (
            <MenuRow icon={<Trash2 size={20} aria-hidden />} label="Delete message" danger onClick={() => removeMessage(menuFor)} testId="chat-delete" />
          )}
        </ul>
      </Sheet>

      <Sheet open={info} onClose={() => setInfo(false)} title="About this chat" testId="chat-info-sheet">
        <p className="text-sm">{INTRO}</p>
        <ul className="text-muted mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>Type / for tools: /settle, /pay, /expense, /balances and more.</li>
          <li>Type @ to tag someone, or @everyone. A tag reaches them even if they muted the chat.</li>
          <li>Swipe a message to the right to reply, or press and hold it for Reply, Edit and Delete.</li>
        </ul>
        <div className="mt-4 divide-y divide-slate-100 rounded-2xl bg-slate-50 dark:divide-white/5 dark:bg-ink-800">
          <div className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">Suggest tools as I type</div>
              <div className="text-muted text-xs">
                “Can everyone settle up?” offers Settle up. Read on this phone, nothing is sent until you tap. This device only.
              </div>
            </div>
            <Switch
              checked={suggest}
              onChange={(v) => {
                setSuggest(v)
                setSuggestOn(v)
              }}
              label="Suggest tools as I type"
              testId="chat-suggest-switch"
            />
          </div>
          <div className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">Mute this chat</div>
              <div className="text-muted text-xs">No notifications for new messages, except when someone tags you. Only for you.</div>
            </div>
            <Switch checked={muted} onChange={toggleMute} label="Mute this chat" disabled={!prefs} />
          </div>
        </div>
      </Sheet>
    </div>
  )
}

const INTRO =
  'The group’s money chat. Ask who paid, write down an open item anyone can claim, ask people to settle up or send a Pay me. Everyone in the group sees the whole chat, including people who join later.'

function MenuRow({ icon, label, onClick, danger, testId }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; testId?: string }) {
  return (
    <li>
      <button
        type="button"
        className={`flex min-h-14 w-full items-center gap-3 px-2 text-left font-medium ${danger ? 'text-rose-700 dark:text-rose-400' : ''}`}
        onClick={onClick}
        data-testid={testId}
      >
        {icon} {label}
      </button>
    </li>
  )
}

/** The visual viewport's box (src/lib/keyboard.ts), following the keyboard as it opens and closes. */
const readViewport = () => chatViewportBox(window.visualViewport, window.innerHeight)
function useChatViewport() {
  const [box, setBox] = useState(readViewport)
  useEffect(() => {
    const vv = window.visualViewport
    const on = () => setBox(readViewport())
    vv?.addEventListener('resize', on)
    vv?.addEventListener('scroll', on)
    window.addEventListener('resize', on)
    return () => {
      vv?.removeEventListener('resize', on)
      vv?.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])
  return box
}
