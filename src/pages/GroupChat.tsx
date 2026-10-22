import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { labelOf } from '@/lib/shortNames'
import { Navigate, useParams } from 'react-router-dom'
import { ArrowDown, Bell, BellOff, ChevronLeft, Info, Reply } from 'lucide-react'
import { ChatIcon, CopyIcon, EditIcon, LightbulbIcon, TrashIcon } from '@/components/icons'
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
import { aiSuggestOn, mentionables, setAiSuggestOn, setSuggestOn, suggestOn } from '@/lib/chat-tools'
import { unavailableText } from '@/lib/ai'
import { chatViewportBox, opensKeyboard } from '@/lib/keyboard'
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
import { HintText, InfoTip, type Hint } from '@/components/Hint'
import { Collapsible } from '@/components/Collapsible'
import { openOnce } from '@/lib/vault-open'

/** Kept in every look: who can read the chat (people who join later too) is a privacy point. */
const CHAT_START_HINT: Hint = {
  full: 'The group’s money chat: ask who paid, add an open item, ask to settle up or send a Pay me. Everyone in the group sees all of it, even people who join later.',
  short: 'Everyone in the group sees all of it, even people who join later.',
  min: 'Everyone in the group sees the whole chat.',
  tier: 'key',
}

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
  // AI for suggestions: offered only while the admin flag chatAi is on; off on each device until turned on.
  // Never in a private group: the AI would read its messages (docs/VAULT.md).
  const chatAiFlag = useFlag('chatAi')
  const chatAiOn = chatAiFlag && !group?.vault
  const [aiSuggest, setAiSuggest] = useState(aiSuggestOn)
  /** the server said no this visit (AI off in settings, no key, the day's allowance used): stop asking */
  const [aiBlocked, setAiBlocked] = useState(false)
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

  // The keyboard opening (or settling) shrinks the chat: keep the latest message in view above the box, like any chat app.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the keyboard's room changes
  useLayoutEffect(() => {
    if (box && firstScroll.current) scrollToBottom()
  }, [box?.height])

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
      const page = await openOnce(groupId, await repo.fetchChatBefore(groupId, messages[0].createdAt, CHAT_WINDOW))
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
        <Empty icon="search" title="This group doesn’t exist or you’re not a member" />
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
    // Fills the screen, message box on the bottom edge. With the keyboard up it pins to what's visible (src/lib/keyboard.ts):
    // only the messages scroll; the header and the box stay put.
    <div
      className={`group/chat fixed inset-x-0 top-0 flex flex-col ${box ? '' : 'bottom-0'}`}
      data-keyboard={box ? '' : undefined}
      data-testid="chat-screen"
      style={box ? { height: box.height, transform: box.top ? `translateY(${box.top}px)` : undefined } : undefined}
    >
      {/* The group screen's header metrics (PageHeader): same top and bottom space, back button and right-hand buttons in the same places. */}
      <header className="z-20 border-b border-slate-200 bg-white pb-3 pt-[calc(var(--safe-top)+1.25rem)] shadow-sm dark:border-white/10 dark:bg-ink-900">
        <div className="mx-auto flex min-h-11 max-w-2xl items-center gap-2.5 pl-2 pr-4">
          <button
            type="button"
            onClick={goBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-ink-800"
            aria-label="Back"
          >
            <ChevronLeft size={24} aria-hidden />
          </button>
          {group && <GroupIcon emoji={group.emoji} group={group} size={44} />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight">{group?.name ?? ' '}</h1>
            <div className="text-muted truncate text-[0.8125rem]">
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
                  <HintText hint={CHAT_START_HINT} className="" as="span" />
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
            ai={chatAiOn && aiSuggest && !aiBlocked && repo.mode !== 'demo'}
            onAiUnavailable={(reason) => {
              setAiBlocked(true)
              toast(`AI suggestions paused: ${unavailableText(reason, { onPhone: false })}`, 'err')
            }}
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
              icon={<CopyIcon size={20} aria-hidden />}
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
              icon={<EditIcon size={20} aria-hidden />}
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
            <MenuRow icon={<TrashIcon size={20} aria-hidden />} label="Delete message" danger onClick={() => removeMessage(menuFor)} testId="chat-delete" />
          )}
        </ul>
      </Sheet>

      <Sheet open={info} onClose={() => setInfo(false)} title="About this chat" testId="chat-info-sheet">
        {/* What the chat is, as one highlighted card; who can read it stays in every detail level. */}
        <div className="flex gap-3 rounded-2xl bg-brand-50 p-3.5 dark:bg-brand-500/10">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 dark:bg-ink-800 dark:text-brand-300"
            aria-hidden
          >
            <ChatIcon size={18} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold">The group’s money chat</div>
            <HintText hint={ABOUT_HINT} className="mt-0.5 text-sm text-slate-700 dark:text-slate-200" />
            <HintText hint={WHO_SEES_HINT} className="text-muted mt-1 text-xs" />
          </div>
        </div>

        {/* The how-tos fold away: worth reading once, not every time the sheet opens. */}
        <Collapsible
          title="How to use it"
          icon={<LightbulbIcon size={20} aria-hidden />}
          summary="Tools, tags, replies"
          className="!mt-3 !bg-slate-50 !shadow-none !ring-0 dark:!bg-ink-800"
          testId="chat-howto"
        >
          <ul className="space-y-3 px-4 pb-4 text-sm">
            <TipRow glyph="/" title="Tools" text="Type / for /settle, /pay, /expense, /balances and more." />
            <TipRow glyph="@" title="Tags" text="Tag someone, or @everyone. A tag reaches them even if they muted the chat." />
            <TipRow
              glyph={<Reply size={15} aria-hidden />}
              title="Replies"
              text="Swipe a message right to reply; press and hold it for Reply, Edit and Delete."
            />
          </ul>
        </Collapsible>

        <h3 className="mb-2 mt-5 px-1 text-sm font-bold">Your settings</h3>
        <div className="divide-y divide-slate-100 rounded-2xl bg-slate-50 dark:divide-white/5 dark:bg-ink-800">
          <div className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center font-medium">
                Suggest tools as I type
                <InfoTip hint={SUGGEST_HINT} label="About suggesting tools" />
              </div>
              <HintText hint={SUGGEST_HINT} className="text-muted text-xs" as="div" />
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
          {chatAiOn && suggest && (
            <div className="flex items-center gap-3 p-3" data-testid="chat-ai-row">
              <div className="min-w-0 flex-1">
                <div className="flex items-center font-medium">
                  Use AI for suggestions
                  {repo.mode !== 'demo' && <InfoTip hint={AI_SUGGEST_HINT} label="About AI suggestions" />}
                </div>
                {repo.mode === 'demo' ? (
                  <div className="text-muted text-xs">Needs a Split Now account: not in the demo.</div>
                ) : (
                  <HintText hint={AI_SUGGEST_HINT} className="text-muted text-xs" as="div" />
                )}
              </div>
              <Switch
                checked={aiSuggest && repo.mode !== 'demo'}
                onChange={(v) => {
                  setAiSuggest(v)
                  setAiSuggestOn(v)
                  setAiBlocked(false)
                }}
                label="Use AI for suggestions"
                disabled={repo.mode === 'demo'}
                testId="chat-ai-switch"
              />
            </div>
          )}
          <div className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center font-medium">
                Mute this chat
                <InfoTip hint={MUTE_HINT} label="About muting this chat" />
              </div>
              <HintText hint={MUTE_HINT} className="text-muted text-xs" as="div" />
            </div>
            <Switch checked={muted} onChange={toggleMute} label="Mute this chat" disabled={!prefs} />
          </div>
        </div>
      </Sheet>
    </div>
  )
}

const ABOUT_HINT: Hint = {
  full: 'Ask who paid, add an open item anyone can claim, ask to settle up or send a Pay me.',
  short: 'Ask who paid, settle up, send a Pay me.',
  tier: 'help',
}
// Who reads it is a privacy fact: it stays in every look.
const WHO_SEES_HINT: Hint = {
  full: 'Everyone in the group sees all of it, even people who join later.',
  short: 'Everyone in the group sees it, even later joiners.',
  tier: 'key',
}
const SUGGEST_HINT: Hint = {
  full: '“Can everyone settle up?” offers Settle up. Read on this phone, nothing is sent until you tap. This device only.',
  short: 'Offers a tool for what you type. This device only.',
  tier: 'help',
}
const AI_SUGGEST_HINT: Hint = {
  full: 'When the app finds nothing, asks AI after you pause. Slower, and uses your AI allowance. Best left off.',
  short: 'Asks AI when the app finds nothing.',
  tier: 'help',
}
const MUTE_HINT: Hint = { full: 'No notifications for new messages, except when someone tags you. Only for you.', short: 'Tags still reach you.', tier: 'help' }

/** One how-to in the chat's ⓘ: a glyph chip, a short title and the line. */
function TipRow({ glyph, title, text }: { glyph: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white font-mono text-sm font-bold text-brand-600 shadow-sm dark:bg-ink-900 dark:text-brand-300"
        aria-hidden
      >
        {glyph}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="text-muted block text-xs">{text}</span>
      </span>
    </li>
  )
}

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

/** The visual viewport's box (src/lib/keyboard.ts) while a field has focus, following the keyboard as it opens and closes. */
const readViewport = () => chatViewportBox(window.visualViewport, window.innerHeight, opensKeyboard(document.activeElement as HTMLElement | null))
function useChatViewport() {
  const [box, setBox] = useState(readViewport)
  useEffect(() => {
    const vv = window.visualViewport
    let timer: ReturnType<typeof setTimeout> | undefined
    const on = () => {
      setBox(readViewport())
      // iOS settles the viewport only after the keyboard's slide, sometimes without a resize event.
      clearTimeout(timer)
      timer = setTimeout(() => setBox(readViewport()), 350)
    }
    vv?.addEventListener('resize', on)
    vv?.addEventListener('scroll', on)
    window.addEventListener('resize', on)
    document.addEventListener('focusin', on)
    document.addEventListener('focusout', on)
    return () => {
      clearTimeout(timer)
      vv?.removeEventListener('resize', on)
      vv?.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      document.removeEventListener('focusin', on)
      document.removeEventListener('focusout', on)
    }
  }, [])
  return box
}
