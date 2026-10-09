import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, Loader2, Share2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useFlag } from '@/hooks/useAppConfig'
import type { ActivityEntry, Cents, Group, MemberId } from '@/types'
import { errText } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { lastNudgeAt, localNudgeAt, nudgeCooldownText, nudgeResultText, nudgedRecently, rememberNudge, type NudgeResult } from '@/lib/nudge'
import { buildPayLink, newPayLinkCode } from '@/lib/paylinks'
import { cardSpec, renderShareCard, shareReminder, type ReminderArgs } from '@/lib/share-card'
import { useToast } from '@/components/Toast'

/**
 * The two ways to chase a debt, side by side: Remind (the share sheet with a Pay me link that
 * works without an account, plus a PNG card where files can be shared; src/lib/paylinks.ts)
 * and Nudge (a push from the server, once a day per person and group). Nudge is hidden for
 * people who haven't joined (nothing to push to) and reads as unavailable once used today.
 */
export function RemindActions({
  group,
  debtor,
  amount,
  me,
  feed,
  className = '',
}: {
  group: Group
  debtor: MemberId
  /** minor units of the group currency they owe you */
  amount: Cents
  me: MemberId
  /** the group's activity feed, when the screen has it (nudges from other devices show up there) */
  feed?: ActivityEntry[] | null
  className?: string
}) {
  const { user, profile } = useMe()
  const toast = useToast()
  const nav = useNavigate()
  const payLinks = useFlag('payLinks')
  const nudges = useFlag('nudges')
  const [busy, setBusy] = useState<'remind' | 'nudge' | null>(null)
  const m = group.members[debtor]
  const name = m?.name ?? 'Someone'
  const first = name.split(' ')[0]
  const canNudge = nudges && !!m?.uid && m.uid !== user.uid
  const lastAt = lastNudgeAt(feed, user.uid, debtor) ?? localNudgeAt(group.id, debtor)
  const cooling = nudgedRecently(lastAt)

  const remind = async () => {
    if (busy) return
    setBusy('remind')
    try {
      // A Pay me link the debtor can open without an account; written in the background (the
      // share sheet must open while the tap still counts), refusals arrive through onError.
      const code = newPayLinkCode()
      const payeeName = group.members[me]?.name ?? profile.displayName
      repo
        .createPayLink(
          code,
          buildPayLink(
            {
              groupId: group.id,
              groupName: group.name,
              emoji: group.emoji,
              from: { id: debtor, name },
              to: { id: me, name: payeeName },
              amount,
              currency: group.currency,
              payment: profile.payment,
              createdBy: user.uid,
            },
            Date.now(),
          ),
        )
        .catch((e) => toast(errText(e), 'err'))
      const args: ReminderArgs = {
        origin: location.origin,
        groupId: group.id,
        groupName: group.name,
        emoji: group.emoji,
        debtor: { id: debtor, name },
        payee: { id: me, name: payeeName },
        amount,
        currency: group.currency,
        upi: profile.payment?.upi,
        payLink: code,
      }
      const file = await renderShareCard(cardSpec(args)).catch(() => null)
      const r = await shareReminder(args, file)
      // Demo mode has one browser: offer to open the link as the friend would see it.
      const demo = repo.mode === 'demo' ? { action: { label: `Open as ${first}`, run: () => nav(`/r/${code}?guest=demo`) } } : undefined
      if (r === 'copied') toast('Reminder and Pay me link copied', 'ok', demo)
      else if (demo) toast('Pay me link ready', 'ok', demo)
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const nudge = async () => {
    if (busy) return
    if (cooling) {
      toast(nudgeCooldownText(first))
      return
    }
    setBusy('nudge')
    try {
      const r: NudgeResult = await repo.nudge(group.id, debtor, amount)
      if (r.sent) rememberNudge(group.id, debtor)
      toast(
        nudgeResultText(r, first, (c) => formatMoney(c, group.currency)),
        r.sent ? 'ok' : 'err',
      )
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const btn = 'text-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-ink-800'
  return (
    <span className={`flex items-center ${className}`}>
      {payLinks && (
        <button
          type="button"
          onClick={remind}
          className={btn}
          aria-label={`Remind ${first}: share a pay link`}
          disabled={busy === 'remind'}
          data-testid="remind"
        >
          {busy === 'remind' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Share2 size={18} aria-hidden />}
        </button>
      )}
      {canNudge && (
        <button
          type="button"
          onClick={nudge}
          className={`${btn} ${cooling ? 'opacity-50' : ''}`}
          aria-label={cooling ? `Nudge ${first}: already nudged today` : `Nudge ${first} with a notification`}
          aria-disabled={cooling || undefined}
          title={cooling ? nudgeCooldownText(first) : undefined}
          disabled={busy === 'nudge'}
          data-testid="nudge"
        >
          {busy === 'nudge' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <BellRing size={18} aria-hidden />}
        </button>
      )}
    </span>
  )
}
