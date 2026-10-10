import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, Loader2, Share2 } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useFlag } from '@/hooks/useAppConfig'
import type { ActivityEntry, Cents, Group, MemberId } from '@/types'
import { errText } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { lastNudgeAcross, lastNudgeAt, localNudgeAt, nudgeCooldownText, nudgeResultText, nudgedRecently, rememberNudge, type NudgeResult } from '@/lib/nudge'
import { buildPayLink, MAX_LINK_PARTS, newPayLinkCode, payLinkFeatures } from '@/lib/paylinks'
import { canNudgePerson, groupNames, personNudgeItems, settlePersonHref, type PersonBalance } from '@/lib/settleAll'
import type { HomeBalance } from '@/lib/collect'
import { convertMinor } from '@/lib/fx'
import { useTodayRates } from '@/hooks/useFx'
import { andList, cardSpec, firstName, renderShareCard, shareReminder, type ReminderArgs } from '@/lib/share-card'
import { useToast } from '@/components/Toast'

/**
 * The two ways to chase a debt, side by side: Remind (the share sheet with a Pay me link that
 * works without an account, plus a PNG card where files can be shared; src/lib/paylinks.ts)
 * and Nudge (a push from the server, once a day per person and group). Nudge is hidden for
 * people who haven't joined (nothing to push to) and reads as unavailable once used today.
 * When the nudge can't be pushed (their notifications are off) the share sheet opens instead;
 * the server has still left them the reminder in the app.
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
  /** activity of this group (or several groups merged; entries carry their group), when the screen has it: nudges from other devices show up there */
  feed?: ActivityEntry[] | null
  className?: string
}) {
  const { user, profile } = useMe()
  const toast = useToast()
  const nav = useNavigate()
  const chase = useChase()
  // Off: Remind still shares, but the members-only Settle up link instead of a new Pay me link.
  const { createLinks } = payLinkFeatures(useFlag('payLinks'))
  const nudges = useFlag('nudges')
  const m = group.members[debtor]
  const name = m?.name ?? 'Someone'
  const first = firstName(name)
  const canNudge = nudges && !!m?.uid && m.uid !== user.uid
  const lastAt = lastNudgeAt(feed, user.uid, debtor, group.id) ?? localNudgeAt(group.id, debtor)
  const cooling = nudgedRecently(lastAt)
  // Collect in my currency: the link asks for the amount in yours (a UPI QR when it's INR), and
  // records the group's own amount when paid. Without today's rate, it stays in the group's.
  const home = profile.currency
  const collect = !!profile.collectInHome && home !== group.currency
  const rate = useTodayRates(home, collect ? [group.currency] : [])?.[group.currency]
  const inHome = collect && rate ? convertMinor(amount, group.currency, home, rate.rate) : undefined

  const remind = () =>
    chase.share(async () => {
      // A Pay me link the debtor can open without an account; written in the background (the
      // share sheet must open while the tap still counts), refusals arrive through onError.
      const code = createLinks ? newPayLinkCode() : undefined
      const payeeName = group.members[me]?.name ?? profile.displayName
      if (code)
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
                amount: inHome ?? amount,
                currency: inHome ? home : group.currency,
                payment: profile.payment,
                createdBy: user.uid,
                parts: inHome
                  ? [{ groupId: group.id, groupName: group.name, from: debtor, to: me, amount, currency: group.currency, paid: inHome }]
                  : undefined,
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
        amount: inHome ?? amount,
        currency: inHome ? home : group.currency,
        upi: profile.payment?.upi,
        payLink: code,
      }
      const file = await renderShareCard(cardSpec(args)).catch(() => null)
      const r = await shareReminder(args, file)
      // Demo mode has one browser: offer to open the link as the friend would see it.
      const demo = repo.mode === 'demo' && code ? { action: { label: `Open as ${first}`, run: () => nav(`/r/${code}?guest=demo`) } } : undefined
      if (r === 'copied') toast(code ? 'Reminder and Pay me link copied' : 'Reminder and pay link copied', 'ok', demo)
      else if (demo) toast('Pay me link ready', 'ok', demo)
    })

  const nudge = () =>
    chase.nudge({
      first,
      currency: group.currency,
      cooling,
      call: () => repo.nudge(group.id, debtor, amount),
      remember: () => rememberNudge(group.id, debtor),
      share: remind,
    })

  return <ChaseButtons first={first} busy={chase.busy} onRemind={remind} onNudge={canNudge ? nudge : undefined} cooling={cooling} className={className} />
}

/**
 * Remind and Nudge for a "by person" row that spans several groups (the Balances screen): one
 * share with the total they owe you (a Pay me link records a payment in one group only, so the
 * link is your cross-group Settle up), and one nudge, one push with the total (the callable's
 * `items`). Only when they owe you overall; Nudge only when they have an account.
 */
export function PersonRemindActions({ p, feed, className = '' }: { p: PersonBalance; feed?: ActivityEntry[] | null; className?: string }) {
  const { user, profile } = useMe()
  const toast = useToast()
  const chase = useChase()
  const nudges = useFlag('nudges')
  const first = firstName(p.name)
  const owedParts = p.parts.filter((r) => r.dir === 'owed')
  const canNudge = nudges && canNudgePerson(p, user.uid)
  const cooling = nudgedRecently(lastNudgeAcross(owedParts, feed, user.uid))
  const { createLinks } = payLinkFeatures(useFlag('payLinks'))
  const nav = useNavigate()
  if (p.net <= 0) return null

  // Combined across currencies (Collect in my currency) and all owed to you: one Pay me link for the
  // ≈ total in your currency, recording each group's own amount when paid (shared/paylinks parts).
  const hb = 'approx' in p && (p as HomeBalance).approx ? (p as HomeBalance) : null
  const bundle = !!hb && createLinks && owedParts.length === p.parts.length && p.parts.length <= MAX_LINK_PARTS

  const remind = () =>
    chase.share(async () => {
      const names = groupNames(p)
      const lead = owedParts[0] ?? p.parts[0]
      const code = bundle && hb ? newPayLinkCode() : undefined
      if (code && hb)
        repo
          .createPayLink(
            code,
            buildPayLink(
              {
                groupName: andList(names),
                from: { id: lead.memberId, name: p.name },
                to: { id: lead.me, name: profile.displayName },
                amount: p.net,
                currency: p.currency,
                payment: profile.payment,
                createdBy: user.uid,
                parts: p.parts.map((r) => ({
                  groupId: r.groupId,
                  groupName: r.groupName,
                  from: r.memberId,
                  to: r.me,
                  amount: r.amount,
                  currency: r.currency,
                  paid: Math.abs(hb.home[r.key] ?? r.amount),
                })),
              },
              Date.now(),
            ),
          )
          .catch((e) => toast(errText(e), 'err'))
      const args: ReminderArgs = {
        origin: location.origin,
        groupId: lead.groupId,
        groupName: andList(names),
        debtor: { id: lead.memberId, name: p.name },
        payee: { id: lead.me, name: profile.displayName },
        amount: p.net,
        currency: p.currency,
        upi: profile.payment?.upi,
        across: names,
        // Their cross-group Settle up is keyed by you (the person they owe).
        // A combined balance (every currency in yours, Balances with Collect in my currency) opens the combined one.
        link: settlePersonHref({ key: p.key.endsWith('|*') ? `u:${user.uid}|*` : `u:${user.uid}|${p.currency}` }),
        payLink: code,
      }
      const file = await renderShareCard(cardSpec(args)).catch(() => null)
      const r = await shareReminder(args, file)
      // Demo mode has one browser: offer to open the link as the friend would see it.
      const demo = repo.mode === 'demo' && code ? { action: { label: `Open as ${first}`, run: () => nav(`/r/${code}?guest=demo`) } } : undefined
      if (r === 'copied') toast(code ? 'Reminder and Pay me link copied' : 'Reminder copied', 'ok', demo)
      else if (demo) toast('Pay me link ready', 'ok', demo)
    })

  const nudge = () =>
    chase.nudge({
      first,
      currency: p.currency,
      cooling,
      call: () => repo.nudgeAcross(personNudgeItems(p)),
      remember: () => {
        for (const r of owedParts) if (r.uid) rememberNudge(r.groupId, r.memberId)
      },
      share: remind,
    })

  return (
    <ChaseButtons first={first} busy={chase.busy} onRemind={remind} onNudge={canNudge ? nudge : undefined} cooling={cooling} className={className} across />
  )
}

/** Busy state, the share sheet, and a nudge with its fallbacks: shared by both kinds of row. */
function useChase() {
  const toast = useToast()
  const [busy, setBusy] = useState<'remind' | 'nudge' | null>(null)

  const share = async (run: () => Promise<void>) => {
    if (busy === 'remind') return
    setBusy('remind')
    try {
      await run()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const nudge = async (o: {
    first: string
    currency: string
    cooling: boolean
    call: () => Promise<NudgeResult>
    remember: () => void
    share: () => Promise<void>
  }) => {
    if (busy) return
    if (o.cooling) {
      toast(nudgeCooldownText(o.first))
      return
    }
    setBusy('nudge')
    let r: NudgeResult
    try {
      r = await o.call()
    } catch (e) {
      toast(errText(e), 'err')
      return
    } finally {
      setBusy(null)
    }
    const text = nudgeResultText(r, o.first, (c) => formatMoney(c, o.currency))
    // A reminder went out (as a push, or in the app when their notifications are off): today's is used.
    if (r.sent || r.reason === 'no_push') o.remember()
    if (r.sent) {
      toast(text, 'ok')
      return
    }
    const again = { action: { label: 'Share', run: () => void o.share() } }
    if (r.reason === 'no_push') {
      // Straight to the share sheet with the same reminder and link; the toast's Share is there
      // for browsers that won't open a share sheet this long after the tap.
      toast(text, 'ok', again)
      await o.share()
      return
    }
    toast(text, 'err', r.reason === 'rate_limited' || r.reason === 'not_owed' ? undefined : again)
  }

  return { busy, share, nudge }
}

function ChaseButtons({
  first,
  busy,
  onRemind,
  onNudge,
  cooling,
  className,
  across = false,
}: {
  first: string
  busy: 'remind' | 'nudge' | null
  onRemind: () => void
  onNudge?: () => void
  cooling: boolean
  className: string
  across?: boolean
}) {
  const btn = 'text-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-ink-800'
  return (
    <span className={`flex items-center ${className}`}>
      <button
        type="button"
        onClick={onRemind}
        className={btn}
        aria-label={across ? `Remind ${first}: share what they owe you across groups` : `Remind ${first}: share a pay link`}
        disabled={busy === 'remind'}
        data-testid="remind"
      >
        {busy === 'remind' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Share2 size={18} aria-hidden />}
      </button>
      {onNudge && (
        <button
          type="button"
          onClick={onNudge}
          className={`${btn} ${cooling ? 'opacity-50' : ''}`}
          aria-label={cooling ? `Nudge ${first}: already nudged today` : `Nudge ${first} with a notification${across ? ' about the total' : ''}`}
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
