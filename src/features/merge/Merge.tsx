import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Link2, Loader2, X } from 'lucide-react'
import { repo } from '@/data'
import type { Group, MemberId, MergeRequest } from '@/types'
import { Avatar } from '@/components/Avatar'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { errText } from '@/lib/errors'
import { keptOf, mergeCandidates, mergeCardState, mergeStillPossible, openMergeRequests } from '@/lib/merge'
import { labelOf } from '@/lib/shortNames'
import { mergeApprover } from '../../../shared/merge-members'
import { formatMoney } from '@/lib/money'

/*
 * Two entries that are one person: the Merge sheet (Members → a person → Merge), the offers on
 * the Members screen (suggestions and requests waiting), the card in the group chat and the row
 * in Inbox → To sort. The merge runs on the server; balances stay the same in total.
 */

/** Merge and decide, with the toasts. `busy` is the request id (or 'merge') being worked on. */
export function useMergeActions(group: Group) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const name = (id: MemberId) => labelOf(group.members, id, group.members[id]?.name ?? 'Someone')
  const merge = async (from: MemberId, into: MemberId): Promise<boolean> => {
    setBusy('merge')
    try {
      const r = await repo.mergeMembers(group, from, into)
      toast(r.status === 'pending' ? 'Asked for their OK in the chat' : `${name(keptOf(group.members, from, into))} is one person now`)
      return true
    } catch (e) {
      toast(errText(e), 'err')
      return false
    } finally {
      setBusy(null)
    }
  }
  const decide = async (r: MergeRequest, approve: boolean) => {
    setBusy(r.id)
    try {
      const out = await repo.decideMerge(group, r.id, approve)
      toast(
        out.status === 'pending'
          ? 'Asked for their OK in the chat'
          : out.status === 'declined'
            ? r.status === 'suggested'
              ? 'Kept as two people'
              : 'Declined'
            : `${name(r.into)} is one person now`,
      )
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }
  return { merge, decide, busy, name }
}

/** Members → a person → Merge: pick who they really are, see what happens, merge (or ask the creator). */
export function MergeSheet({
  group,
  from,
  me,
  myUid,
  net,
  open,
  onClose,
}: {
  group: Group
  from: MemberId | null
  me?: MemberId
  myUid: string
  /** balances now (minor units), to show where the merged person will stand */
  net?: Record<MemberId, number>
  open: boolean
  onClose: () => void
}) {
  const { merge, busy, name } = useMergeActions(group)
  const [other, setOther] = useState<MemberId | null>(null)
  useEffect(() => {
    if (open) setOther(null)
  }, [open])
  if (!from) return null
  const who = (id: MemberId) => (id === me ? 'You' : name(id))
  const candidates = mergeCandidates(group.members, from)
  const kept = other ? keptOf(group.members, from, other) : null
  const approver = kept ? mergeApprover(group, kept, myUid) : null
  const asks = !!approver
  const gone = other && kept ? (kept === other ? from : other) : null
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={other ? 'Make them one person?' : `Who else is ${who(from) === 'You' ? 'you' : who(from)}?`}
      testId="merge-sheet"
    >
      {!other ? (
        candidates.length === 0 ? (
          <p className="text-muted text-sm">There’s nobody to merge with: two people who both have accounts sign in separately, so they stay two.</p>
        ) : (
          <>
            <p className="text-muted -mt-1 mb-2 text-sm">Pick the entry that’s the same person, like someone added once by name and once by email.</p>
            <ul className="-mx-2 divide-y divide-slate-100 dark:divide-white/5">
              {candidates.map((id) => {
                const m = group.members[id]!
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="flex min-h-14 w-full items-center gap-3 px-2 py-2 text-left"
                      onClick={() => setOther(id)}
                      data-testid="merge-pick"
                    >
                      <Avatar name={m.name} color={m.color} photoURL={m.photoURL} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{who(id)}</span>
                        <span className="text-muted block truncate text-xs">
                          {m.name}
                          {m.email ? ` · ${m.email}` : ''}
                          {m.uid ? ' · has an account' : ''}
                        </span>
                      </span>
                      <ArrowRight size={18} className="text-slate-400" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )
      ) : (
        <div>
          <div className="flex items-center justify-center gap-3 py-2" aria-hidden>
            <Avatar name={group.members[gone!]!.name} color={group.members[gone!]!.color} photoURL={group.members[gone!]!.photoURL} size={44} />
            <Link2 size={20} className="text-slate-400" />
            <Avatar name={group.members[kept!]!.name} color={group.members[kept!]!.color} photoURL={group.members[kept!]!.photoURL} size={44} />
          </div>
          <p className="text-sm">
            <b>{who(gone!)}</b> and <b>{who(kept!)}</b> become one person: <b>{who(kept!)}</b>.
          </p>
          {net && (
            <p className="mt-2 text-sm" data-testid="merge-balance">
              {balanceLine(who(kept!), (net[from] ?? 0) + (net[other] ?? 0), group.currency)}
            </p>
          )}
          <ul className="text-muted mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>Everything {who(gone!) === 'You' ? 'you' : who(gone!)} paid or owes moves over, so their balances add up.</li>
            <li>A payment between the two is removed (it was one person paying themselves).</li>
            <li>Past activity still shows the old name.</li>
          </ul>
          {asks && (
            <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              This group needs its creator’s OK. They’ll get a request in the chat.
            </p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOther(null)} disabled={!!busy}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!!busy}
              onClick={async () => {
                if (await merge(from, other)) onClose()
              }}
              data-testid="merge-confirm"
            >
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} {asks ? 'Ask to merge' : 'Merge'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** One open suggestion or request, as a card with its actions. */
function MergeOffer({ group, r, me, myUid, compact }: { group: Group; r: MergeRequest; me?: MemberId; myUid: string; compact?: boolean }) {
  const { decide, busy, name } = useMergeActions(group)
  const state = mergeCardState(r, myUid)
  const who = (id: MemberId) => (id === me ? 'you' : name(id))
  const asker = r.by !== 'system' ? Object.entries(group.members).find(([, m]) => m.uid === r.by)?.[0] : undefined
  const approver = r.approverUid ? Object.entries(group.members).find(([, m]) => m.uid === r.approverUid)?.[0] : undefined
  const text =
    state.kind === 'suggested'
      ? `${cap(who(r.from))} and ${who(r.into)} look like the same person.`
      : state.kind === 'pending'
        ? `${asker ? cap(who(asker)) : 'Someone'} asks to make ${who(r.from)} and ${who(r.into)} one person.`
        : state.kind === 'done'
          ? `${cap(who(r.from))} and ${who(r.into)} are one person now.`
          : `Merging ${who(r.from)} and ${who(r.into)} was declined.`
  return (
    <div className={compact ? '' : 'card p-4'} data-testid="merge-offer">
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
          aria-hidden
        >
          <Link2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{text}</p>
          {state.kind === 'pending' && !state.canDecide && (
            <p className="text-muted mt-0.5 text-xs">{approver ? `Waiting for ${approver === me ? 'you' : name(approver)} to OK it.` : 'Waiting for an OK.'}</p>
          )}
          {state.kind === 'suggested' && <p className="text-muted mt-0.5 text-xs">Merging moves everything into {who(r.into)}; balances add up.</p>}
        </div>
      </div>
      {state.canDecide && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => decide(r, false)} data-testid="merge-decline">
            <X size={16} aria-hidden /> {state.kind === 'suggested' ? 'Not the same' : 'Decline'}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!!busy} onClick={() => decide(r, true)} data-testid="merge-approve">
            {busy === r.id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}{' '}
            {state.kind === 'suggested' ? 'Merge' : 'OK, merge'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Where the merged person stands: both balances added up. */
function balanceLine(who: string, total: number, currency: string): string {
  const you = who === 'You'
  if (total === 0) return `${who} ${you ? 'are' : 'is'} settled up after the merge.`
  return `After the merge ${you ? 'you' : who} ${total > 0 ? (you ? 'get back' : 'gets back') : you ? 'owe' : 'owes'} ${formatMoney(Math.abs(total), currency)}.`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Members screen: the suggestions and requests still open (stale ones hidden). */
export function MergeOffers({ group, requests, me, myUid }: { group: Group; requests: MergeRequest[] | null; me?: MemberId; myUid: string }) {
  const open = openMergeRequests(requests).filter((r) => mergeStillPossible(group.members, r))
  if (!open.length) return null
  return (
    <div className="space-y-3" data-testid="merge-offers">
      {open.map((r) => (
        <MergeOffer key={r.id} group={group} r={r} me={me} myUid={myUid} />
      ))}
    </div>
  )
}

/** The chat card of a merge request (its words are the message's own text, @mentioning the creator). */
export function MergeChatCard({ group, request, me, myUid }: { group: Group; request: MergeRequest | undefined; me?: MemberId; myUid: string }) {
  if (!request) return <p className="text-muted text-sm">A merge of two people in this group.</p>
  return <MergeOffer group={group} r={request} me={me} myUid={myUid} compact />
}

/** Inbox → To sort: a merge waiting for my OK, with a way into its group. */
export function MergeApprovalRow({ group, request, me, myUid }: { group: Group; request: MergeRequest; me?: MemberId; myUid: string }) {
  return (
    <div className="card p-4">
      <Link to={`/groups/${group.id}/members`} className="text-muted mb-2 block text-xs font-semibold">
        {group.emoji} {group.name}
      </Link>
      <MergeOffer group={group} r={request} me={me} myUid={myUid} compact />
    </div>
  )
}
