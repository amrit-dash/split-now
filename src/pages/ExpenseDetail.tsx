import { useEffect, useRef, useState } from 'react'
import { usePhotoUrls, useVaultOpen } from '@/hooks/useVault'
import { useConfirm } from '@/components/ConfirmSheet'
import { expensePhotos, photoArrived, photosKey, photosSummary, receiptCard } from '@/lib/receipt-photo'
import { PhotoViewer } from '@/components/PhotoViewer'
import { errText } from '@/lib/errors'
import { SPLIT_TYPE_LABEL } from '@/lib/expense-draft'
import { formatDate, formatDateTime } from '@/lib/locale'
import { addedLine } from '@/lib/added'
import { authorMember } from '@/lib/chat'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Camera, ChevronDown, CopyPlus, ImagePlus, Loader2, Paperclip, Pencil, Repeat, Send, Trash2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { myMemberId, useAllExpenses, useComments, useGroup } from '@/hooks/data'
import type { Expense, ExpenseComment, Group } from '@/types'
import { CATEGORIES } from '@/lib/categories'
import { categoryIcons, expenseEmoji, isIcon } from '@/lib/icons'
import { useLongPress } from '@/hooks/useLongPress'
import { IconSheet } from '@/components/IconSheet'
import { IconFace } from '@/components/IconFace'
import { useIconAi } from '@/hooks/useIconAi'
import { formatMoney } from '@/lib/money'
import { FREQ_LABEL } from '@/lib/recurrence'
import { rateLabel } from '@/lib/fx'
import { colorFor } from '@/lib/colors'
import { Avatar } from '@/components/Avatar'
import { Empty, Loading, PageHeader } from '@/components/Misc'
import { useToast } from '@/components/Toast'
import { Detail, type Hint, HintText, useShows } from '@/components/Hint'
import { SwipeRow } from '@/components/SwipeRow'
import { usePageTitle } from '@/lib/brand'
import { HistoryCard, TrashedBanner, TrustBadges, TrustPanel, useUndoableDelete } from '@/components/Trust'
import { labelOf, memberIdOfUid } from '@/lib/shortNames'
import { handlersOf, isReceived, sharesOf } from '../../shared/received'

export default function ExpenseDetail() {
  const { groupId, expenseId } = useParams()
  const group = useGroup(groupId)
  // Including trashed ones, so a deleted expense can still be viewed and restored.
  const expenses = useAllExpenses(groupId)
  const { user } = useMe()
  const nav = useNavigate()
  const toast = useToast()
  const undoable = useUndoableDelete()
  const patient = usePatience(`${groupId}/${expenseId}`)
  // Hooks before the early returns: the "Added by" line hides in the Minimal look.
  const showAdded = useShows(2)
  const e = expenses?.find((x) => x.id === expenseId)
  // An old link to an import summary pointed here with the group's id: open the group.
  const importLink = !!groupId && expenseId === groupId
  usePageTitle(e ? e.description : group === null || (expenses && !e && !patient) ? 'Expense' : undefined)
  if (importLink) return <Navigate to={`/groups/${groupId}`} replace />
  if (group === undefined || !expenses) return <Loading />
  // The first snapshot can come from the local cache before the server has sent this expense
  // (opened from a notification or another member's activity): wait a moment before "not found".
  if (group && !e && patient) return <Loading />
  if (!group || !e) {
    return (
      <>
        <PageHeader title="Expense" back={group ? `/groups/${group.id}` : '/groups'} />
        <Empty emoji="🔍" title="Expense not found">
          {group ? 'It may have been deleted for good.' : 'You may no longer be in this group.'}
          {group && (
            <Link to={`/groups/${group.id}`} replace className="btn-secondary mx-auto mt-4 w-fit">
              Open {group.emoji} {group.name}
            </Link>
          )}
        </Empty>
      </>
    )
  }
  const me = myMemberId(group, user.uid)
  const cur = group.currency
  const cat = CATEGORIES[e.category]
  const received = isReceived(e)
  const name = (id: string) => (id === me ? 'You' : labelOf(group.members, id, 'Former member', me))

  const template = e.recurringFrom ? expenses.find((x) => x.id === e.recurringFrom) : undefined

  // Nothing is lost (copies already added stay), so no confirm: an Undo puts the schedule back.
  const stopRepeating = async () => {
    const before = e
    try {
      await repo.saveExpense({ ...e, recurrence: undefined, updatedAt: Date.now() })
      toast('This expense no longer repeats', 'ok', {
        action: {
          label: 'Undo',
          run: () => {
            repo
              .saveExpense({ ...before, updatedAt: Date.now() })
              .then(() => toast('Repeating again'))
              .catch((err) => toast(errText(err), 'err'))
          },
        },
      })
    } catch (err) {
      toast(errText(err), 'err')
    }
  }

  // Goes to "Recently deleted"; the toast offers Undo instead of a confirm dialog.
  const del = () => {
    undoable.expense(group.id, e)
    nav(`/groups/${group.id}`, { replace: true })
  }
  const trashed = !!e.deletedAt

  return (
    <div>
      {/* The heading is the description in the card below, so the header carries no title (no empty h1). */}
      <PageHeader
        title=""
        back={`/groups/${group.id}`}
        right={
          trashed ? undefined : (
            <div className="flex gap-1">
              <Link
                to={`/add?group=${encodeURIComponent(group.id)}&again=${encodeURIComponent(e.id)}`}
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
                aria-label="Add again, dated today"
                data-testid="add-again"
              >
                <CopyPlus size={20} />
              </Link>
              <Link
                to={`/groups/${group.id}/expenses/${e.id}/edit`}
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-200/60 dark:hover:bg-ink-800"
                aria-label="Edit"
              >
                <Pencil size={20} />
              </Link>
              <button
                type="button"
                onClick={del}
                className="flex h-11 w-11 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                aria-label="Delete"
              >
                <Trash2 size={20} />
              </button>
            </div>
          )
        }
      />
      {trashed && <TrashedBanner group={group} item={e} kind="expense" />}
      <div className="card p-6 text-center">
        <ExpenseIcon expense={e} color={cat.color} editable={!trashed} vault={!!group.vault} />
        <h1 className="mt-3 text-xl font-bold">{e.description}</h1>
        <div className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight">{formatMoney(e.amount, cur)}</div>
        {e.original && (
          <div className="mt-1 text-sm text-muted" data-testid="fx-original">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{formatMoney(e.original.amount, e.original.currency)}</span> at{' '}
            {rateLabel(e.original, cur)}
          </div>
        )}
        <div className="mt-2 text-sm text-muted">
          {received ? 'Money received · ' : ''}
          {cat.label} · {formatDate(e.date, 'long')}
        </div>
        <div className="mt-1 text-xs text-muted">
          <span aria-hidden>{group.emoji}</span> {group.name}
        </div>
        <div className="mt-2 flex justify-center gap-1.5 empty:hidden">
          <TrustBadges e={e} group={group} />
        </div>
      </div>
      {group.type !== 'personal' && <TrustPanel group={group} expense={e} myMemberId={me} />}

      {e.recurrence && (
        <div className="card mt-3 flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200">
            <Repeat size={20} />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">Repeats {FREQ_LABEL[e.recurrence.freq].toLowerCase()}</div>
            <div className="text-muted">
              Next on {fmtDate(e.recurrence.nextDate)}
              {e.recurrence.until ? ` · ends ${fmtDate(e.recurrence.until)}` : ''}
            </div>
          </div>
          <button type="button" onClick={stopRepeating} className="chip min-h-10 shrink-0">
            Stop repeating
          </button>
        </div>
      )}
      {e.recurringFrom && !e.recurrence && (
        <div className="card mt-3 flex items-center gap-3 p-4 text-sm">
          <Repeat size={18} className="shrink-0 text-slate-400" aria-hidden />
          <div className="flex-1 text-muted">Added automatically from a repeating expense.</div>
          {template && (
            <Link to={`/groups/${group.id}/expenses/${template.id}`} className="chip shrink-0">
              {template.recurrence ? 'Manage' : 'View original'}
            </Link>
          )}
        </div>
      )}

      {group.type !== 'personal' && (
        <>
          <div className="card mt-3 p-4">
            <div className="label">{received ? 'Received by' : 'Paid by'}</div>
            {Object.entries(handlersOf(e)).map(([id, v]) => (
              <div key={id} className="flex items-center gap-3 py-1.5">
                <Avatar name={group.members[id]?.name ?? '?'} color={group.members[id]?.color ?? '#999'} photoURL={group.members[id]?.photoURL} size={32} />
                <span className="flex-1 font-medium">{name(id)}</span>
                <span className="font-semibold tabular-nums">{formatMoney(v, cur)}</span>
              </div>
            ))}
          </div>
          <div className="card mt-3 p-4">
            <div className="label">{received ? `Shared · ${SPLIT_TYPE_LABEL[e.splitType].toLowerCase()}` : SPLIT_TYPE_LABEL[e.splitType]}</div>
            {Object.entries(sharesOf(e)).map(([id, v]) => {
              // What they're owed (+) or owe (-) from this entry, either way round.
              const net = (e.paidBy[id] ?? 0) - (e.splits[id] ?? 0)
              return (
                <div key={id} className="flex items-center gap-3 py-1.5">
                  <Avatar name={group.members[id]?.name ?? '?'} color={group.members[id]?.color ?? '#999'} photoURL={group.members[id]?.photoURL} size={32} />
                  <div className="flex-1">
                    <div className="font-medium">{name(id)}</div>
                    {e.splitType === 'percent' && <div className="text-xs text-muted">{e.splitInput.percent?.[id]}%</div>}
                    {e.splitType === 'shares' && (
                      <div className="text-xs text-muted">
                        {e.splitInput.shares?.[id]} {e.splitInput.shares?.[id] === 1 ? 'share' : 'shares'}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{formatMoney(v, cur)}</div>
                    {net !== 0 && (
                      <div className={`text-xs tabular-nums ${net > 0 ? 'pos' : 'neg'}`}>
                        {net > 0 ? (received ? 'gets' : 'gets back') : 'owes'} {formatMoney(Math.abs(net), cur)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {e.splitType === 'itemized' && e.splitInput.items && (
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-white/5">
                {e.splitInput.items.map((it, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: receipt items have no id and names can repeat; this read-only list keeps its stored order.
                  <div key={i} className="flex justify-between gap-2">
                    <span className="min-w-0">
                      {it.name}{' '}
                      <span className="text-muted">
                        · {it.members.map((m) => name(m).split(' ')[0] + (it.shares?.[m] && it.shares[m] > 1 ? ` ×${it.shares[m]}` : '')).join(', ')}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatMoney(it.amount, e.original?.currency ?? cur)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {e.notes && (
        <div className="card mt-3 p-4">
          <div className="label">Notes</div>
          <p className="whitespace-pre-wrap text-sm">{e.notes}</p>
        </div>
      )}
      <ReceiptCard group={group} expense={e} trashed={trashed} />
      {group.type !== 'personal' && <Comments group={group} expense={e} />}
      {/* History is background: the Minimal look leaves it out. */}
      <Detail min={2}>
        <HistoryCard group={group} expense={e} />
      </Detail>
      {/* The "Added by" line too, unless someone other than its author changed it: who did is worth seeing in every look. */}
      {(showAdded || (!!e.updatedBy && e.updatedBy !== e.createdBy)) && (
        <p className="mt-4 text-center text-xs text-muted" data-testid="expense-added">
          {addedLine(
            e,
            creatorName(group, e.createdBy, user.uid),
            { dateTime: formatDateTime, date: (ms) => formatDate(ms) },
            e.updatedBy ? creatorName(group, e.updatedBy, user.uid) : undefined,
          )}
        </p>
      )}
    </div>
  )
}

const NO_COMMENTS: Hint = { full: 'No comments yet. Ask a question or add context for the group.', short: 'No comments yet.', tier: 'help' }

function Comments({ group, expense }: { group: Group; expense: Expense }) {
  const { user, profile } = useMe()
  const comments = useComments(group.id, expense.id)
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const memberOf = (authorUid: string) => group.members[memberIdOfUid(group.members, authorUid) ?? '']
  const colorOf = (authorUid: string, i: number) => memberOf(authorUid)?.color ?? colorFor(i)

  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await repo.addComment(group.id, expense.id, {
        text: t.slice(0, 2000),
        authorUid: user.uid,
        authorName: profile.displayName || user.displayName,
        createdAt: Date.now(),
      })
      setText('')
    } catch (err) {
      toast(errText(err), 'err')
    } finally {
      setBusy(false)
    }
  }
  // Deleting is undoable (the comment is re-added as it was), so no confirm dialog.
  const remove = async (c: ExpenseComment) => {
    try {
      await repo.deleteComment(group.id, expense.id, c.id)
      toast('Comment deleted', 'ok', {
        action: {
          label: 'Undo',
          run: () => {
            repo
              .addComment(group.id, expense.id, { text: c.text, authorUid: c.authorUid, authorName: c.authorName, createdAt: c.createdAt })
              .catch((err) => toast(errText(err), 'err'))
          },
        },
      })
    } catch (err) {
      toast(errText(err), 'err')
    }
  }

  return (
    <div className="card mt-3 p-4">
      <div className="label">Comments{comments?.length ? ` · ${comments.length}` : ''}</div>
      {comments === null ? null : comments.length === 0 ? (
        <HintText hint={NO_COMMENTS} className="text-sm text-muted" />
      ) : (
        <ul className="space-y-3">
          {comments.map((c, i) => (
            <SwipeRow
              key={c.id}
              className="-mx-4"
              contentClassName="flex gap-2.5 px-4"
              menuTitle="Your comment"
              actions={
                c.authorUid === user.uid
                  ? [{ label: 'Delete', ariaLabel: 'Delete comment', icon: <Trash2 size={20} strokeWidth={2.25} />, onClick: () => remove(c) }]
                  : []
              }
            >
              <Avatar name={c.authorName} color={colorOf(c.authorUid, i)} photoURL={memberOf(c.authorUid)?.photoURL} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{c.authorUid === user.uid ? 'You' : c.authorName}</span>
                  <span className="text-muted">{fmtWhen(c.createdAt)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.text}</p>
              </div>
            </SwipeRow>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          send()
        }}
      >
        <textarea
          className="input min-h-11 !py-2.5"
          rows={1}
          maxLength={2000}
          placeholder="Add a comment"
          aria-label="Add a comment"
          enterKeyHint="send"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) {
              ev.preventDefault()
              send()
            }
          }}
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fill text-on-fill disabled:opacity-40"
          aria-label="Send comment"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}

function fmtDate(d: string) {
  return formatDate(d, 'dayYear')
}

function fmtWhen(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return formatDate(ts, 'day')
}

/** True for the first few seconds after `key` changes. */
function usePatience(key: string, ms = 4000) {
  const [waiting, setWaiting] = useState(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the signal to start waiting again
  useEffect(() => {
    setWaiting(true)
    const t = setTimeout(() => setWaiting(false), ms)
    return () => clearTimeout(t)
  }, [key, ms])
  return waiting
}

/** "you", the member's name, or undefined when the account isn't in the group any more. */
function creatorName(group: Group, uid: string, me: string): string | undefined {
  if (uid === me) return 'you'
  const id = authorMember(group, uid)
  return id ? labelOf(group.members, id, '', authorMember(group, me)) || undefined : undefined
}

/**
 * The expense's photos: its scanned receipt and up to four attached photos (src/lib/receipt-photo.ts),
 * folded into one row until tapped. Open, a strip of thumbnails, each labelled, opening full screen
 * (the arrows move between them). The scanned receipt can be replaced; attached photos removed one
 * by one (a confirm: the file goes); Add a photo attaches one more while there is room. None of these
 * change the amount. A private group's photos are opened on the phone (repo.photoUrl) and never shown sealed.
 */
function ReceiptCard({ group, expense: e, trashed }: { group: Group; expense: Expense; trashed: boolean }) {
  const toast = useToast()
  const confirm = useConfirm()
  const open = useVaultOpen(group.id)
  const photos = expensePhotos(e)
  const srcs = usePhotoUrls(group.id, photos)
  const fileRef = useRef<HTMLInputElement>(null)
  const [slot, setSlot] = useState<'scan' | 'attached'>('attached')
  const [viewing, setViewing] = useState<number | null>(null)
  // Folded until tapped; a photo just added opens it, so the person sees what went in.
  const [shown, setShown] = useState(false)
  // The photos named before an upload started: once they differ, it has arrived.
  const [adding, setAdding] = useState<{ before: string } | null>(null)
  const current = photosKey(photos)
  useEffect(() => {
    if (adding && photoArrived(adding.before, current)) {
      setAdding(null)
      setShown(true)
    }
  }, [adding, current])
  // A failed upload says so in its own toast (repo.attachReceipt); the card stops waiting after a minute.
  useEffect(() => {
    if (!adding) return
    const t = setTimeout(() => setAdding(null), 60_000)
    return () => clearTimeout(t)
  }, [adding])
  const scan = photos.some((p) => p.kind === 'scan')
  const attached = photos.filter((p) => p.kind === 'attached').length
  const card = receiptCard({ scan, attached, trashed, canSeal: !group.vault || open })
  if (!card.show) return null
  const pick = (file: File) => {
    try {
      if (!repo.attachReceipt(group.id, e.id, file, { slot })) return toast('You’re offline. Connect to add the photo.', 'err')
      setAdding({ before: current })
      setViewing(null)
      toast(slot === 'scan' ? 'Replacing the scanned receipt…' : 'Adding the photo…')
    } catch (err) {
      toast(errText(err), 'err')
    }
  }
  const choose = (to: 'scan' | 'attached') => {
    setSlot(to)
    fileRef.current?.click()
  }
  const remove = async (i: number) => {
    const p = photos[i]
    if (p?.kind !== 'attached') return
    // The viewer sits above every sheet: close it so the question shows.
    setViewing(null)
    const ok = await confirm({ title: 'Remove this photo?', message: 'It’s deleted from the expense for everyone.', confirmLabel: 'Remove', tone: 'danger' })
    if (!ok) return
    repo.removePhoto(group.id, e.id, { path: p.path, url: p.url, at: 0 }).catch((err) => toast(errText(err), 'err'))
    toast('Photo removed')
  }
  const tile = 'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-white/10'
  return (
    <div className="card mt-3 overflow-hidden" data-testid="receipt-card">
      {photos.length ? (
        // Folded by default: the photos are there when wanted, without pushing comments and history down.
        <button
          type="button"
          className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
          onClick={() => setShown((v) => !v)}
          aria-expanded={shown}
          aria-controls={`receipt-${e.id}`}
          data-testid="receipt-toggle"
        >
          <span className={`${tile} h-10 w-10`}>
            {srcs[0] ? <img src={srcs[0]} alt="" className="h-full w-full object-cover" /> : <Paperclip size={16} className="text-muted" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{photos.length > 1 ? `Photos (${photos.length})` : 'Receipt'}</span>
            <span className="text-muted block truncate text-xs" data-testid="receipt-summary">
              {adding ? 'Adding the photo…' : photosSummary(photos)}
            </span>
          </span>
          <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${shown ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      ) : (
        <div className="px-4 pt-3">
          <div className="label">Photos</div>
        </div>
      )}
      {photos.length > 0 && shown && (
        <div id={`receipt-${e.id}`} className="px-4 pb-4">
          <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="receipt-photos">
            {photos.map((p, i) => (
              <li key={p.key} className="w-28 shrink-0">
                <button
                  type="button"
                  className={`${tile} h-28 w-28`}
                  onClick={() => setViewing(i)}
                  aria-label={`Open ${p.label.toLowerCase()} full screen`}
                  data-testid={p.kind === 'scan' ? 'receipt-open' : 'receipt-open-attached'}
                >
                  {srcs[i] ? (
                    <img src={srcs[i] as string} alt={p.label} className="h-full w-full object-cover" />
                  ) : (
                    <Loader2 size={18} className="text-muted animate-spin" aria-hidden />
                  )}
                </button>
                <span className={`mt-1 block truncate text-xs font-semibold ${p.kind === 'scan' ? 'text-brand-700 dark:text-brand-300' : 'text-muted'}`}>
                  {p.kind === 'scan' ? 'Scanned' : p.label.replace('Attached photo', 'Attached')}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {card.replaceScan && (
              <button type="button" className="btn min-h-11 flex-1" onClick={() => choose('scan')} disabled={!!adding} data-testid="receipt-replace">
                <Camera size={18} aria-hidden /> Replace scanned
              </button>
            )}
            {card.add && (
              <button type="button" className="btn min-h-11 flex-1" onClick={() => choose('attached')} disabled={!!adding} data-testid="receipt-add-more">
                <ImagePlus size={18} aria-hidden /> Add a photo
              </button>
            )}
          </div>
        </div>
      )}
      {!photos.length &&
        (adding ? (
          <p className="text-muted flex items-center gap-2 px-4 pb-4 pt-2 text-sm" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Adding the photo…
          </p>
        ) : (
          <div className="px-4 pb-4 pt-2">
            <button type="button" className="btn w-full" onClick={() => choose('attached')} data-testid="receipt-add">
              <ImagePlus size={18} aria-hidden /> Add a photo
            </button>
          </div>
        ))}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="receipt-file"
        onChange={(ev) => {
          const f = ev.target.files?.[0]
          if (f) pick(f)
          ev.target.value = ''
        }}
      />
      {viewing !== null && (
        <PhotoViewer
          photos={photos.map((p, i) => ({ src: srcs[i], alt: p.label, label: p.label }))}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          actions={(i) => {
            const p = photos[i]
            const btn = 'btn min-h-11 bg-white/10 text-white ring-1 ring-white/20'
            if (p?.kind === 'scan' && card.replaceScan)
              return (
                <button type="button" className={btn} onClick={() => choose('scan')}>
                  <Camera size={18} aria-hidden /> Replace scanned
                </button>
              )
            if (p?.kind === 'attached' && card.removeAttached)
              return (
                <button type="button" className={btn} onClick={() => void remove(i)} data-testid="photo-viewer-remove">
                  <Trash2 size={18} aria-hidden /> Remove photo
                </button>
              )
            return null
          }}
        />
      )}
    </div>
  )
}

/**
 * The expense's icon, at the top of its screen. Tap or press and hold: every icon, saved straight
 * away (only the icon changes, so nobody is asked to approve it again). Read-only in the trash.
 */
function ExpenseIcon({ expense: e, color, editable, vault }: { expense: Expense; color: string; editable: boolean; vault: boolean }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const ai = useIconAi(vault)
  const press = useLongPress({ onTap: () => setOpen(true), onHold: () => setOpen(true) })
  const face = expenseEmoji(e)
  const tile = 'mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-4xl'
  if (!editable)
    return (
      <div className={tile} style={{ background: color + '22' }} aria-hidden>
        <IconFace iconSvg={e.iconSvg} iconImage={e.iconImage} emoji={face} vault={vault} />
      </div>
    )
  const write = async (patch: Pick<Expense, 'icon' | 'iconAuto' | 'iconSvg' | 'iconImage'>) => {
    try {
      await repo.saveExpense({ ...e, ...patch, updatedAt: Date.now() })
    } catch (err) {
      toast(errText(err), 'err')
    }
  }
  // The icon chosen by hand; the automatic one's AI pick (iconAuto) still counts as Automatic.
  const chosen = isIcon(e.icon) && !e.iconAuto ? e.icon : undefined
  // Any emoji (or Automatic) drops a drawn icon; a drawn one keeps the emoji for text. Automatic keeps the AI's pick for this description.
  const save = (icon: string | undefined) => {
    if (icon === chosen && !e.iconSvg && !e.iconImage) return
    const drop = { iconSvg: undefined, iconImage: undefined }
    return write(icon ? { icon, iconAuto: undefined, ...drop } : { icon: e.iconAuto ? e.icon : undefined, iconAuto: e.iconAuto, ...drop })
  }
  return (
    <>
      <button
        type="button"
        {...press}
        className={`${tile} press-hold select-none [-webkit-touch-callout:none]`}
        style={{ background: color + '22' }}
        aria-label={`Icon ${face}. Change icon`}
        aria-haspopup="dialog"
        data-testid="expense-detail-icon"
      >
        <span aria-hidden>
          <IconFace iconSvg={e.iconSvg} iconImage={e.iconImage} emoji={face} vault={vault} />
        </span>
      </button>
      <IconSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Icon"
        value={chosen}
        auto={e.iconAuto && isIcon(e.icon) ? e.icon : expenseEmoji({ ...e, icon: undefined })}
        first={categoryIcons(e.category)}
        onPick={save}
        ai={ai.suggest ? { kind: 'expense', category: CATEGORIES[e.category]?.label } : undefined}
        svgValue={e.iconSvg}
        onPickSvg={(svg) => write({ icon: e.icon, iconSvg: svg, iconImage: undefined })}
        picture={ai.picture}
        pictureCost={ai.pictureCost}
        aiWhy={ai.why}
        pictureOff={ai.pictureWhy}
        imageValue={e.iconImage}
        onPickImage={(image) => write({ icon: e.icon, iconSvg: undefined, iconImage: image })}
      />
    </>
  )
}
