import { useEffect, useRef, useState } from 'react'
import { usePhotoUrl, useVaultOpen } from '@/hooks/useVault'
import { photoArrived, receiptCard } from '@/lib/receipt-photo'
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
        <PageHeader title="Expense" back />
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
        back
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
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-4xl" style={{ background: cat.color + '22' }} aria-hidden>
          {cat.emoji}
        </div>
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
 * The receipt photo: a thumbnail that opens full screen (PhotoViewer), a private group's opened on
 * the phone (repo.photoUrl) and never shown sealed. Without one, Add a receipt photo; with one,
 * Replace. Either only changes the photo, never the amount (repo.attachReceipt, after which the
 * live expense names the new photo). Nothing to add to a deleted expense or a locked private group.
 */
function ReceiptCard({ group, expense: e, trashed }: { group: Group; expense: Expense; trashed: boolean }) {
  const toast = useToast()
  const open = useVaultOpen(group.id)
  const src = usePhotoUrl(group.id, { path: e.receiptPath, url: e.receiptUrl })
  const fileRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState(false)
  // Folded until tapped; a photo just added opens it, so the person sees what went in.
  const [shown, setShown] = useState(false)
  // The photo named before the upload started: once the expense names another, it has arrived.
  const [adding, setAdding] = useState<{ before?: string } | null>(null)
  const current = e.receiptPath ?? e.receiptUrl
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
  const hasPhoto = !!current
  const card = receiptCard({ hasPhoto, trashed, canSeal: !group.vault || open })
  if (!card.show) return null
  const pick = (file: File) => {
    try {
      if (!repo.attachReceipt(group.id, e.id, file)) return toast('You’re offline. Connect to add the photo.', 'err')
      setAdding({ before: current })
      setViewing(false)
      toast(hasPhoto ? 'Replacing the photo…' : 'Adding the photo…')
    } catch (err) {
      toast(errText(err), 'err')
    }
  }
  const choose = () => fileRef.current?.click()
  return (
    <div className="card mt-3 overflow-hidden" data-testid="receipt-card">
      {hasPhoto ? (
        // Folded by default: the photo is there when wanted, without pushing comments and history down.
        <button
          type="button"
          className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
          onClick={() => setShown((v) => !v)}
          aria-expanded={shown}
          aria-controls={`receipt-${e.id}`}
          data-testid="receipt-toggle"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200 dark:bg-ink-900 dark:ring-white/10">
            {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Paperclip size={16} className="text-muted" aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Receipt</span>
            <span className="text-muted block text-xs">
              {adding ? 'Replacing the photo…' : shown ? 'Tap the photo to open it full screen' : 'Show the photo'}
            </span>
          </span>
          <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${shown ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      ) : (
        <div className="px-4 pt-3">
          <div className="label">Receipt</div>
        </div>
      )}
      {hasPhoto && shown && (
        <div id={`receipt-${e.id}`} className="px-4 pb-4">
          {src ? (
            <button
              type="button"
              className="block w-full"
              onClick={() => setViewing(true)}
              aria-label="Open the receipt full screen"
              data-testid="receipt-open"
            >
              <img src={src} alt="Receipt" className="max-h-72 w-full rounded-xl bg-slate-50 object-contain dark:bg-ink-900" />
            </button>
          ) : (
            <p className="text-muted text-sm">Loading the photo…</p>
          )}
          {card.replace && (
            <button type="button" className="btn mt-3 w-full" onClick={choose} disabled={!!adding} data-testid="receipt-replace">
              <Camera size={18} aria-hidden /> Replace photo
            </button>
          )}
        </div>
      )}
      {!hasPhoto &&
        (adding ? (
          <p className="text-muted flex items-center gap-2 px-4 pb-4 pt-2 text-sm" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Adding the photo…
          </p>
        ) : (
          <div className="px-4 pb-4 pt-2">
            <button type="button" className="btn w-full" onClick={choose} data-testid="receipt-add">
              <ImagePlus size={18} aria-hidden /> Add a receipt photo
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
      {viewing && src && (
        <PhotoViewer
          src={src}
          alt="Receipt"
          onClose={() => setViewing(false)}
          actions={
            card.replace ? (
              <button type="button" className="btn min-h-11 bg-white/10 text-white ring-1 ring-white/20" onClick={choose}>
                <Camera size={18} aria-hidden /> Replace photo
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
