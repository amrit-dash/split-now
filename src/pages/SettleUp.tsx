import { useFeature } from '@/hooks/useMode'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ChevronDown, Lightbulb, X } from 'lucide-react'
import { CameraIcon, ChecksIcon, CopyIcon, ExternalIcon, HistoryIcon, ImageAddIcon, QrIcon } from '@/components/icons'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { ChequeIcon } from '@/components/ChequeIcon'
import { computeGroupData, memberOrder, useAllGroupData, useExpenses, useGroup, useSettlements } from '@/hooks/data'
import { useOcr } from '@/hooks/useOcr'
import { useVaultOpen, useVaultVersion } from '@/hooks/useVault'
import type { Cents, MemberId, PaymentHandles } from '@/types'
import type { MemberProfile } from '@/data/repo'
import { centsToInput, currencySymbol, formatMoney, fromHundredths, groupedInput } from '@/lib/money'
import { isSettled } from '@/lib/members'
import { isIOS, isUpiId, methodFor, methodLabel, payOptions, roundSuggestions, settleMethods, type PayOption } from '@/lib/payments'
import { matchMember, parsePaymentScreenshot, type ParsedPayment } from '@/lib/ocr-parse'
import { pending } from '@/lib/pending'
import { haptic } from '@/lib/haptics'
import { linkToClose } from '@/lib/paylinks'
import { nettableRows, pendingSettlements, personBalances, personKey, signedAmount, type PersonBalance } from '@/lib/settleAll'
import { allocateAcrossGroups } from '@/lib/settleMulti'
import { clearedFor, collectsInHome, inHome, payeeCollects, paidIn, payInLine, planInHome, type HomeBalance } from '@/lib/collect'
import { useTodayRates } from '@/hooks/useFx'
import { useRowTripRates, useTripRates } from '@/hooks/useTripRate'
import { defaultRateBasis, type RateBasis, rateGapLine, rowTripDates, tripRateDate } from '@/lib/trip-rate'
import { formatRate, type FxRate } from '@/lib/fx'
import { formatDate } from '@/lib/locale'
import { lastMethod, rememberMethod } from '@/lib/recents'
import { waitingTotal } from '@/lib/trust'
import { needsOkOnCreate } from '../../shared/payment-ok'
import { copy } from '@/lib/share'
import { errText } from '@/lib/errors'
import { todayISO, uid } from '@/lib/id'
import { Avatar } from '@/components/Avatar'
import { QrCode } from '@/components/QrCode'
import { encodeQr } from '@/lib/qr'
import { Empty, Loading, PageHeader, Segmented, Spinner } from '@/components/Misc'
import { MoneyInput } from '@/components/MoneyInput'
import { CardSkeleton, ListSkeleton } from '@/components/Skeleton'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { usePageTitle } from '@/lib/brand'
import { Select } from '@/components/Select'
import { DateField } from '@/components/DateField'
import { labelOf } from '@/lib/shortNames'
import { type Hint, HintText, InfoTip, useShows } from '@/components/Hint'

/** Under "Waive the rest": the waived part is recorded, so it stops counting as owed. */
const WAIVE_HINT: Hint = { full: 'Records that nothing more is owed.', tier: 'key' }

/** The payment needs the recipient's OK, so it doesn't count yet. */
const NEEDS_OK_HINT: Hint = {
  full: 'Counts once the person paid confirms it. Attach a screenshot and it counts at once if it matches.',
  short: 'Counts once they confirm, or a screenshot matches.',
  min: 'Counts once they confirm it.',
  tier: 'key',
}

/** Under the payment handles: the app never moves money, so the payment is made elsewhere first. */
const PAY_OUTSIDE_HINT: Hint = {
  full: 'Pay in your UPI or bank app, then record it below. Split Now never moves money.',
  short: 'Pay in your UPI or bank app, then record it here.',
  min: 'Pay in your bank app first. Split Now never moves money.',
  tier: 'key',
}

export default function SettleUp() {
  usePageTitle('Settle up')
  const { groupId } = useParams()
  const [params] = useSearchParams()
  const { user, profile } = useMe()
  const group = useGroup(groupId)
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)
  const nav = useNavigate()
  const toast = useToast()
  const ocr = useOcr()
  const fileRef = useRef<HTMLInputElement>(null)
  const proofRef = useRef<HTMLInputElement>(null)
  /** the payment screenshot, attached when the payment needs the recipient's OK */
  const [proof, setProof] = useState<File | null>(null)

  const d = useMemo(
    () => (group && expenses && settlements ? computeGroupData(group, expenses, settlements, user.uid) : null),
    [group, expenses, settlements, user.uid],
  )
  const [from, setFrom] = useState<MemberId>('')
  const [to, setTo] = useState<MemberId>('')
  /** minor units of the group currency; undefined while empty */
  const [amount, setAmount] = useState<number>()
  /** typed, read from a screenshot or given in the link: changing the people no longer refills it */
  const [amountTouched, setAmountTouched] = useState(false)
  const [amountError, setAmountError] = useState<string>()
  const [method, setMethod] = useState('')
  /** picked by hand (or implied by a pay option / screenshot): stop choosing a default */
  const [methodTouched, setMethodTouched] = useState(false)
  const pickMethod = (m: string) => {
    setMethod(m)
    setMethodTouched(true)
  }
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  /** part payment: record the rest as waived, so nothing stays owed */
  const [waive, setWaive] = useState(false)
  // Simple doesn't offer waiving the rest (docs/SIMPLE_MODE.md): a part payment just leaves the rest owed.
  const showWaive = useFeature('waive')
  const [payee, setPayee] = useState<MemberProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [init, setInit] = useState(false)
  /** opened from a scanned payment screenshot: keep "Read from payment screenshot" in every look */
  const [fromScan, setFromScan] = useState(false)
  // Method, Note and the screenshot reader are optional extras: hidden in the Minimal look.
  const optional = useShows(2)
  /** Pay in another currency (the recipient's own): null = in the group's currency */
  const [payIn, setPayIn] = useState<boolean | null>(null)
  /** what changes hands in that currency (minor units); undefined = the exact conversion */
  const [paidTyped, setPaidTyped] = useState<number>()
  /** today's rate or the trip's (src/lib/trip-rate.ts), picked by hand; null = the group's default */
  const [basisPicked, setBasisPicked] = useState<RateBasis | null>(null)
  const typeAmount = (v: number | undefined) => {
    setAmount(v)
    setAmountTouched(true)
    setAmountError(undefined)
  }

  const applyPayment = (parsed: ParsedPayment) => {
    if (!d) return
    const p = { ...parsed, amount: parsed.amount && fromHundredths(parsed.amount, d.group.currency) }
    if (p.amount) typeAmount(p.amount)
    if (p.method && settleMethods(d.group.currency).includes(p.method)) pickMethod(p.method)
    if (p.date) setDate(p.date)
    const members = memberOrder(d.group).map((id) => ({ id, name: d.group.members[id].name }))
    const match = matchMember(
      p.payee,
      members.filter((m) => m.id !== d.me),
    )
    if (match && d.me) {
      setFrom(d.me)
      setTo(match)
    }
    toast(
      p.amount
        ? `Read ${formatMoney(p.amount, d.group.currency)}${match ? ` to ${labelOf(d.group.members, match, '', d.me)}` : ''}`
        : 'Couldn’t read an amount',
    )
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time set-up once the group has loaded (guarded by init); later live updates must not reset what the person entered.
  useEffect(() => {
    if (!d || init) return
    setInit(true)
    setMethod(settleMethods(d.group.currency)[0])
    // "Pay me" links: /groups/:id/settle?from=&to=&amount=<minor units>.
    const qf = params.get('from'),
      qt = params.get('to'),
      qa = params.get('amount')
    if (qf && qt) {
      setFrom(qf)
      setTo(qt)
      const n = Number(qa)
      if (qa && Number.isFinite(n) && n > 0) {
        setAmount(Math.round(n))
        setAmountTouched(true)
      }
    } else {
      const mine = d.debts.find((x) => x.from === d.me) ?? d.debts.find((x) => x.to === d.me) ?? d.debts[0]
      if (mine) {
        setFrom(mine.from)
        setTo(mine.to)
        setAmount(mine.amount)
      } else {
        const o = memberOrder(d.group)
        setFrom(d.me ?? o[0])
        setTo(o.find((x) => x !== d.me) ?? o[0])
      }
    }
    if (pending.payment) {
      setFromScan(true)
      applyPayment(pending.payment.parsed)
      pending.payment = undefined
    }
  }, [d, init])

  // A different pair of people: offer what they owe, until the amount is typed by hand.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-offer only when the pair changes, not on every live balance update, so the amount does not change under the person.
  useEffect(() => {
    if (!d || !init || amountTouched || !from || !to) return
    setAmount(d.debts.find((x) => x.from === from && x.to === to)?.amount)
  }, [from, to, init])

  const toUid = group?.members[to]?.uid
  // A private group's copy opens only with its key: read again once it's unlocked here (it was a token).
  const vaultOpen = useVaultOpen(groupId)
  // biome-ignore lint/correctness/useExhaustiveDependencies: vaultOpen is the trigger, not read inside.
  useEffect(() => {
    setPayee(null)
    // Payment handles are shared per group (only co-members can read them). A slower answer for
    // an earlier recipient must not land after a quicker one for the current recipient.
    if (!toUid || !groupId) return
    let live = true
    repo
      .getMemberProfile(groupId, toUid)
      .then((p) => {
        if (live) setPayee(p)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [toUid, groupId, vaultOpen])

  // Method: what was used to pay this person last time, else UPI when they have a UPI ID.
  const payeeUpi = !!payee?.payment?.upi?.trim()
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pick the method only when the recipient or their UPI ID changes; a method picked by hand (methodTouched) is kept.
  useEffect(() => {
    if (!d || !init || methodTouched || !to) return
    const ms = settleMethods(d.group.currency)
    const remembered = lastMethod(d.group.id, to)
    setMethod(remembered && ms.includes(remembered) ? remembered : payeeUpi && ms.includes('UPI') ? 'UPI' : ms[0])
  }, [to, payeeUpi, init])

  // The recipient's own currency, when it isn't the group's: you (Preferences), or what they share.
  const groupCur = group?.currency
  const recipientCur = to && d && to === d.me ? profile.currency : payee?.currency
  const otherCur = recipientCur && groupCur && recipientCur !== groupCur ? recipientCur : undefined
  const prefersOther = to && d && to === d.me ? collectsInHome(profile) : payeeCollects(payee)
  // The rate on the trip's last day as well as today's (owner, 24 Oct 2026): a Trip group starts on the trip's.
  const tripDate = useMemo(
    () =>
      group && expenses
        ? tripRateDate(
            group,
            expenses.map((e) => e.date),
            todayISO(),
          )
        : null,
    [group, expenses],
  )
  const rates = useTripRates(otherCur, groupCur, tripDate)
  const basis: RateBasis = basisPicked ?? (group ? defaultRateBasis(group, tripDate) : 'today')
  /** ECB rate payment currency → group currency on the day in use; undefined while loading, null when unavailable */
  const rate = basis === 'trip' && tripDate && rates.trip ? rates.trip : rates.today

  if (group === null)
    return (
      <>
        {/* Fixed: this group is gone for you, and every screen of it behind this one would say the same, so back leaves the group. */}
        <PageHeader title="Settle up" back={{ to: '/groups', mode: 'fixed' }} />
        <Empty icon="search" title="This group doesn’t exist or you’re not a member" />
      </>
    )
  if (!d || !group) return <Loading />
  const cur = group.currency
  // People in the group now, plus anyone who left with money still owed (old data) or is prefilled here.
  const order = memberOrder(group, [...Object.keys(d.net).filter((id) => !isSettled(d.net[id] ?? 0)), from, to])
  const name = (id: MemberId) => (id === d.me ? 'You' : labelOf(group.members, id, '', d.me))
  const owed = d.debts.find((x) => x.from === from && x.to === to)?.amount
  const methods = settleMethods(cur)
  const validAmount = amount !== undefined && amount > 0
  const payAmount = validAmount ? amount : 0
  const payNote = `Split Now ${group.name}`
  const payeeName = payee?.displayName ?? group.members[to]?.name
  const toMe = to === d.me
  const suggestions = owed ? roundSuggestions(owed, cur) : []
  const big = amount !== undefined && groupedInput(amount, cur).length > 7
  // Paying in the recipient's currency: on when they collect in it, until switched by hand.
  const converting = !!otherCur && !!rate && (payIn ?? prefersOther)
  const due = validAmount ? amount : 0
  // Payments need the recipient's OK: this one waits for them (unless the screenshot matches).
  const needsOk = needsOkOnCreate(group.paymentApproval, { to }, group.members, user.uid)
  const recordedWaiting = from && to ? waitingTotal(d.waiting, from, to) : 0
  // What changes hands: the exact conversion of the amount, until typed over (a different bank rate, or a part).
  const expected = converting && otherCur && rate ? clearedFor(0, due, cur, otherCur, rate.rate).expected : 0
  const paidAmount = converting ? (paidTyped ?? expected) : 0
  const conv = converting && otherCur && rate ? { ...clearedFor(paidAmount, due, cur, otherCur, rate.rate), cur: otherCur, paid: paidAmount } : null
  /** what this payment clears in the group (the amount when not converting) */
  const clears = conv ? conv.cleared : due
  const restAfter = owed !== undefined && clears > 0 && clears < owed ? owed - clears : 0

  const save = async () => {
    if (!validAmount) {
      setAmountError('Enter an amount')
      document.getElementById('settle-amount')?.focus()
      return
    }
    if (conv && (conv.status === 'over' || conv.status === 'none' || conv.cleared <= 0))
      return toast(conv.status === 'over' ? `That’s more than the ${formatMoney(conv.expected, conv.cur)} owed` : 'Enter what was paid', 'err')
    if (!from || !to || from === to) return toast('Pick two different people', 'err')
    setBusy(true)
    try {
      const base = { groupId: group.id, from, to, date, createdBy: user.uid, createdAt: Date.now() }
      // Opened from a Pay me link (/r/{code} → here): this payment clears it, so the link reads
      // as paid for the payee and can't be recorded a second time by the server.
      const asked = Number(params.get('amount'))
      const link = linkToClose(
        params.get('link'),
        { from: params.get('from') ?? '', to: params.get('to') ?? '', amount: Number.isInteger(asked) && asked > 0 ? asked : undefined },
        { from, to, amount: clears + (waive ? restAfter : 0) },
      )
      const id = uid('s_')
      const paid = conv && rate ? paidIn(conv.cur, conv.paid, rate.rate, rate.date) : undefined
      await repo.saveSettlement(
        { id, ...base, amount: clears, method, note: note.trim() || undefined, payLink: link, paid },
        // A private group's screenshot is sealed on the way up (src/data/vault-repo.ts); only the payee reads it.
        needsOk && proof ? { proof } : undefined,
      )
      if (link) repo.markPayLinkPaid(link, { method, settlementId: id }).catch((e) => console.warn('Pay me link not updated', e))
      // The rest is let go as its own record, so the history shows what was paid and what was waived.
      if (waive && restAfter > 0) await repo.saveSettlement({ id: uid('s_'), ...base, amount: restAfter, method: 'waived', note: 'Rest waived' })
      rememberMethod(group.id, to, method)
      haptic('save')
      toast(
        needsOk
          ? `Payment recorded. It counts once ${name(to)} confirms it${proof ? ', or when the screenshot matches' : ''}.`
          : waive && restAfter > 0
            ? 'Payment recorded, rest waived'
            : 'Payment recorded',
      )
      nav(`/groups/${group.id}`, { replace: true })
    } catch (e) {
      toast(errText(e), 'err')
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
    >
      <PageHeader
        title="Settle up"
        subtitle={
          <>
            <span aria-hidden>{group.emoji}</span> {group.name}
          </>
        }
        back={`/groups/${group.id}`}
      />
      <div className="card p-5">
        <PersonSelect
          label="Payer"
          value={from}
          onChange={(v) => {
            setFrom(v)
            if (v === to) setTo(order.find((x) => x !== v) ?? '')
          }}
          order={order}
          group={group}
          name={name}
        />
        <div className="my-2 flex justify-center">
          <span className="rounded-full bg-slate-100 p-2 dark:bg-ink-800" aria-hidden>
            <ArrowDown size={18} />
          </span>
        </div>
        <PersonSelect label="Recipient" value={to} onChange={setTo} order={order.filter((x) => x !== from)} group={group} name={name} />

        <div className="mt-5 flex items-baseline justify-center gap-2">
          {/* Sized with the amount, as on Add expense (AmountCard). */}
          <span
            className={`text-muted font-extrabold leading-none tracking-tight ${currencySymbol(cur).length > 2 ? 'text-3xl' : big ? 'text-4xl' : 'text-5xl'}`}
            aria-hidden
          >
            {currencySymbol(cur)}
          </span>
          <MoneyInput
            bare
            grouped
            id="settle-amount"
            className={`w-auto min-w-[3ch] max-w-[15rem] rounded-lg bg-transparent text-center [field-sizing:content] font-extrabold tabular-nums outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-brand-500 ${big ? 'text-4xl' : 'text-5xl'}`}
            placeholder={centsToInput(0, cur)}
            aria-label={`Amount in ${cur}`}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? 'settle-amount-error' : undefined}
            enterKeyHint="done"
            value={amount}
            currency={cur}
            onChange={typeAmount}
          />
        </div>
        {amountError && (
          <p id="settle-amount-error" role="alert" className="neg mt-1 text-center text-sm">
            {amountError}
          </p>
        )}
        {owed !== undefined && (
          <div className="mt-2 text-center text-sm text-muted">
            {name(from)} owe{from === d.me ? '' : 's'} {name(to)} {formatMoney(owed, cur)}
            {recordedWaiting > 0 && (
              <div className="mt-1 text-xs text-sky-700 dark:text-sky-300" data-testid="settle-waiting">
                {formatMoney(recordedWaiting, cur)} already recorded, waiting for {name(to) === 'You' ? 'your' : `${name(to)}’s`} OK
              </div>
            )}
            {/* Round figures for a part payment; the full amount when something else is typed. */}
            <div className="mt-2 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Amount suggestions">
              {[owed, ...suggestions].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setAmount(v)
                    setAmountTouched(v !== owed)
                    setAmountError(undefined)
                  }}
                  aria-pressed={amount === v}
                  className={`chip min-h-9 tabular-nums ${amount === v ? 'chip-on' : ''}`}
                  data-testid={v === owed ? 'settle-full' : 'settle-round'}
                >
                  {v === owed ? `Full ${formatMoney(v, cur)}` : formatMoney(v, cur)}
                </button>
              ))}
            </div>
          </div>
        )}
        {otherCur && (
          <PayInPanel
            groupCur={cur}
            otherCur={otherCur}
            toMe={toMe}
            recipient={name(to)}
            on={converting}
            rate={rate}
            onToggle={(v) => {
              setPayIn(v)
              setPaidTyped(undefined)
            }}
            paid={paidAmount}
            onPaid={setPaidTyped}
            line={
              conv
                ? payInLine(
                    conv,
                    conv.paid,
                    due,
                    (m) => formatMoney(m, conv.cur),
                    (m) => formatMoney(m, cur),
                  )
                : ''
            }
            status={conv?.status}
            tripDate={tripDate && rates.trip ? rates.trip.date : null}
            basis={basis}
            onBasis={(b) => {
              setBasisPicked(b)
              setPaidTyped(undefined)
            }}
            gap={
              converting && otherCur && rates.today && rates.trip && tripDate
                ? rateGapLine({
                    basis,
                    atToday: clearedFor(0, due, cur, otherCur, rates.today.rate).expected,
                    atTrip: clearedFor(0, due, cur, otherCur, rates.trip.rate).expected,
                    format: (m) => formatMoney(m, otherCur),
                  })
                : null
            }
          />
        )}
        {restAfter > 0 && showWaive && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800" data-testid="waive-rest">
            <div className="min-w-0">
              <div className="font-semibold">Waive the rest ({formatMoney(restAfter, cur)})</div>
              <HintText hint={WAIVE_HINT} as="div" className="text-xs text-muted" />
            </div>
            <Switch checked={waive} onChange={setWaive} label={`Waive the remaining ${formatMoney(restAfter, cur)}`} testId="waive-switch" />
          </div>
        )}

        {(optional || fromScan || ocr.busy) && (
          <button
            type="button"
            className="btn-secondary btn-sm mt-4 w-full"
            onClick={() => fileRef.current?.click()}
            disabled={ocr.busy}
            aria-busy={ocr.busy || undefined}
          >
            {ocr.busy ? (
              <>
                <Spinner className="!h-4 !w-4" label="Reading the screenshot" /> Reading {Math.round(ocr.progress * 100)}%
              </>
            ) : (
              <>
                <CameraIcon size={16} aria-hidden /> Read from payment screenshot
              </>
            )}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            // The same screenshot is the proof the recipient (and the server's check) will see.
            if (needsOk) setProof(f)
            try {
              applyPayment(parsePaymentScreenshot(await ocr.run(f)))
            } catch (err) {
              toast(`Couldn’t read the image: ${errText(err)}`, 'err')
            }
          }}
        />
      </div>

      {to && (
        <PayWith
          key={`${to}-${conv ? conv.cur : cur}`}
          cur={conv ? conv.cur : cur}
          toMe={toMe}
          payer={name(from)}
          recipient={name(to)}
          recipientJoined={!!toUid}
          payment={payee?.payment}
          payeeName={payeeName}
          amount={conv ? conv.paid : payAmount}
          payNote={payNote}
          onPick={pickMethod}
        />
      )}

      <div className="card mt-3 space-y-3 p-4">
        {optional && (
          <div>
            <div className="label" id="settle-method-label">
              Method
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="settle-method-label">
              {[...new Set([...(conv ? settleMethods(conv.cur) : []), ...methods])].map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={m === method}
                  onClick={() => pickMethod(m)}
                  className={`chip min-h-10 ${m === method ? 'chip-on' : ''}`}
                >
                  {methodLabel(m)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={optional ? 'grid grid-cols-2 gap-2' : ''}>
          <DateField aria-label="Date" value={date} onChange={(v) => setDate(v || todayISO())} />
          {optional && <input className="input" placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />}
        </div>
      </div>

      {needsOk && (
        <div className="card mt-3 p-4" data-testid="settle-needs-ok">
          <div className="flex items-start gap-2">
            <HistoryIcon size={18} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
            <div className="min-w-0 text-sm">
              <div className="flex items-center font-semibold">
                Needs {labelOf(group.members, to, 'their', d.me)}’s OK
                <InfoTip hint={NEEDS_OK_HINT} label="About payment OKs" />
              </div>
              <HintText hint={NEEDS_OK_HINT} as="div" className="text-muted text-xs" />
            </div>
          </div>
          {proof ? (
            <div className="mt-3 flex items-center gap-3" data-testid="settle-proof">
              <ProofThumb file={proof} />
              <div className="min-w-0 flex-1 text-sm">Screenshot attached</div>
              <button type="button" className="btn-ghost btn-sm min-h-11 min-w-11" onClick={() => setProof(null)} aria-label="Remove the screenshot">
                <X size={18} aria-hidden />
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary btn-sm mt-3 w-full" onClick={() => proofRef.current?.click()} data-testid="settle-proof-add">
              <ImageAddIcon size={16} aria-hidden /> Attach payment screenshot
            </button>
          )}
          <input
            ref={proofRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) setProof(f)
            }}
            data-testid="settle-proof-input"
          />
        </div>
      )}

      {/* Pinned to the bottom of the screen (full screen, no tab bar), so Record is always in reach. */}
      <div className="pinned-action sticky bottom-0 z-20 -mx-4 mt-5 bg-gradient-to-t from-slate-50 from-70% to-slate-50/0 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-4 dark:from-ink-950 dark:to-ink-950/0">
        <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="settle-record">
          <ChequeIcon size={22} />{' '}
          {conv && conv.cleared > 0 && conv.status !== 'over'
            ? `Record ${formatMoney(conv.paid, conv.cur)} (clears ${formatMoney(conv.cleared, cur)})`
            : `Record ${validAmount ? formatMoney(amount, cur) : 'payment'}`}
        </button>
      </div>
    </form>
  )
}

/**
 * "Pay in ₹ instead": the debt stays in the group's currency (the amount above is what gets
 * cleared); this is what changes hands in the recipient's own currency, at the ECB rate, editable
 * for a bank's slightly different rate or a part payment. The line under it says what it clears.
 */
function PayInPanel({
  groupCur,
  otherCur,
  toMe,
  recipient,
  on,
  rate,
  onToggle,
  paid,
  onPaid,
  line,
  status,
  tripDate,
  basis,
  onBasis,
  gap,
}: {
  groupCur: string
  otherCur: string
  toMe: boolean
  recipient: string
  on: boolean
  rate: FxRate | null | undefined
  onToggle: (on: boolean) => void
  paid: number
  onPaid: (v: number | undefined) => void
  line: string
  status?: string
  /** the trip's rate date (src/lib/trip-rate.ts), when the group has one: today's rate or that day's */
  tripDate: string | null
  basis: RateBasis
  onBasis: (b: RateBasis) => void
  /** how far the other rate is ("₹240 more than at today’s rate") */
  gap: string | null
}) {
  const label = toMe ? `Collect in ${otherCur} instead` : `Pay ${recipient} in ${otherCur} instead`
  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800" data-testid="pay-in">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{label}</div>
          <div className="text-muted text-xs" data-testid="pay-in-rate">
            {rate === undefined
              ? 'Getting today’s rate…'
              : rate === null
                ? 'No exchange rate right now (offline?). Pay in the group’s currency, or try again online.'
                : `1 ${groupCur} = ${formatRate(1 / rate.rate)} ${otherCur} · ECB, ${formatDate(rate.date)}`}
          </div>
        </div>
        <Switch checked={on} onChange={onToggle} label={label} disabled={!rate} testId="pay-in-switch" />
      </div>
      {on && tripDate && (
        <div className="mt-3" data-testid="pay-in-basis">
          <Segmented<RateBasis>
            value={basis}
            onChange={onBasis}
            label="Which day’s exchange rate"
            options={[
              { value: 'trip', label: `Trip · ${formatDate(tripDate)}` },
              { value: 'today', label: 'Today' },
            ]}
          />
          {gap && (
            <p className="text-muted mt-1 text-center text-xs" data-testid="pay-in-gap">
              {gap}
            </p>
          )}
        </div>
      )}
      {on && (
        <div className="mt-3">
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-muted text-xl font-bold" aria-hidden>
              {currencySymbol(otherCur)}
            </span>
            <MoneyInput
              bare
              id="pay-in-amount"
              className="w-full min-w-0 max-w-[12rem] rounded-lg bg-transparent text-center text-3xl font-extrabold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={`Amount paid in ${otherCur}`}
              aria-describedby="pay-in-line"
              enterKeyHint="done"
              value={paid || undefined}
              currency={otherCur}
              onChange={onPaid}
              data-testid="pay-in-amount"
            />
          </div>
          <p
            id="pay-in-line"
            aria-live="polite"
            className={`mt-1 text-center text-xs ${status === 'over' ? 'neg' : status === 'part' ? 'text-amber-700 dark:text-amber-400' : 'text-muted'}`}
            data-testid="pay-in-line"
          >
            {line}
          </p>
        </div>
      )}
    </div>
  )
}

function PersonSelect({
  label,
  value,
  onChange,
  order,
  group,
  name,
}: {
  label: string
  value: MemberId
  onChange: (v: MemberId) => void
  order: MemberId[]
  group: NonNullable<ReturnType<typeof useGroup>>
  name: (id: MemberId) => string
}) {
  const m = group.members[value]
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={onChange}
      options={order.map((id) => ({
        value: id,
        text: name(id),
        label: name(id),
        icon: <Avatar name={group.members[id].name} photoURL={group.members[id].photoURL} color={group.members[id].color} size={28} />,
      }))}
      triggerClassName="rounded-2xl bg-slate-50 p-3 transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-ink-800"
      renderTrigger={(_, open) => (
        <span className="flex items-center gap-3">
          {m ? <Avatar name={m.name} photoURL={m.photoURL} color={m.color} size={40} /> : <span className="h-10 w-10 rounded-full bg-slate-200" />}
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
            <span className="block truncate font-bold">{name(value)}</span>
          </span>
          <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      )}
    />
  )
}

/** UPI: a scannable QR for the exact amount, plus buttons that open a UPI app on this phone. */
function UpiCard({
  o,
  amount,
  cur,
  toMe,
  payer,
  onPick,
  onCopy,
}: {
  o: PayOption
  amount: number
  cur: string
  toMe: boolean
  payer: string
  onPick: () => void
  onCopy: () => void
}) {
  const ios = isIOS()
  let qrOk = true
  try {
    if (o.qr) encodeQr(o.qr)
  } catch {
    qrOk = false
  }
  return (
    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-ink-800" data-testid="upi-card">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">UPI</div>
          <div className="truncate font-mono text-sm">{o.value}</div>
        </div>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white dark:hover:bg-ink-700"
          onClick={onCopy}
          aria-label="Copy UPI ID"
        >
          <CopyIcon size={18} />
        </button>
      </div>
      {o.qr && qrOk && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <QrCode value={o.qr} size={196} label={`UPI QR code to pay ${o.value}${amount > 0 ? ` ${formatMoney(amount, cur)}` : ''}`} />
          <div className="flex items-center gap-1.5 text-center text-xs text-muted">
            <QrIcon size={14} className="shrink-0" aria-hidden />
            {toMe ? `${payer} scans this with any UPI app` : 'Scan with any UPI app on another phone'}
            {amount > 0 ? ` · ${formatMoney(amount, cur)}` : ''}
          </div>
        </div>
      )}
      {!toMe && o.href && (
        <div className="mt-3 space-y-2">
          <a className="btn-primary btn-sm w-full" href={o.href} onClick={onPick} data-testid="upi-open">
            Pay {amount > 0 ? formatMoney(amount, cur) : ''} with a UPI app <ExternalIcon size={16} aria-hidden />
          </a>
          <div className="grid grid-cols-3 gap-2">
            {o.apps?.map((a) => (
              <a
                key={a.id}
                className="btn btn-sm !px-2 text-xs bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-ink-700 dark:text-slate-100 dark:ring-white/10"
                href={a.href}
                onClick={onPick}
                data-testid={`upi-${a.id}`}
              >
                {a.label}
              </a>
            ))}
          </div>
          <HintText
            className="text-xs leading-snug text-muted"
            hint={{
              full: (
                <>
                  {ios ? 'On iPhone, “Pay with a UPI app” opens the one iOS picks.' : 'Android lists your UPI apps.'} If an app refuses the link, scan the QR or
                  pay to the UPI ID.
                </>
              ),
              short: 'App refuses the link? Scan the QR or pay to the UPI ID.',
              tier: 'key',
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * "Pay X with" / "Get paid by X": the recipient's payment handles (UPI QR + app links, PayID,
 * bank, PayPal…), or a box to paste their UPI ID when none is on file. Shared by the single-group
 * and cross-group settle screens. Key it by recipient so a typed UPI ID doesn't carry over.
 */
function PayWith({
  cur,
  toMe,
  payer,
  recipient,
  recipientJoined,
  payment,
  payeeName,
  amount,
  payNote,
  onPick,
}: {
  cur: string
  toMe: boolean
  payer: string
  recipient: string
  recipientJoined: boolean
  payment?: PaymentHandles
  payeeName?: string
  amount: Cents
  payNote: string
  onPick: (method: string) => void
}) {
  const toast = useToast()
  /** a UPI ID typed in for someone who hasn't joined (or hasn't added one) */
  const [manualUpi, setManualUpi] = useState('')
  const options = payOptions(payment, amount, cur, payNote, payeeName)
  // No UPI on file: let the payer paste the recipient's UPI ID to get the same QR / app links.
  const canTypeUpi = cur === 'INR' && !toMe && !options.some((o) => o.key === 'upi')
  const typed = canTypeUpi && isUpiId(manualUpi) ? payOptions({ upi: manualUpi.trim() }, amount, cur, payNote, payeeName) : []
  // In the Minimal look a UPI QR is enough: the other handles (bank, PayPal…) show only when there is no UPI.
  const allHandles = useShows(2)
  const all = [...options, ...typed]
  const shown = allHandles || !all.some((o) => o.qr) ? all : all.filter((o) => o.qr)
  return (
    <div className="card mt-3 p-4">
      <div className="label">{toMe ? `Get paid by ${payer}` : `Pay ${recipient} with`}</div>
      {shown.length === 0 && (
        <p className="text-sm text-muted">
          {toMe
            ? 'Add your UPI ID in Profile so friends can pay you by QR.'
            : recipientJoined
              ? `${recipient} hasn’t added payment details yet.`
              : `${recipient} hasn’t joined Split Now yet. Ask them for their ${cur === 'INR' ? 'UPI ID' : cur === 'AUD' ? 'PayID or bank details' : 'payment details'}.`}
        </p>
      )}
      {canTypeUpi && (
        <input
          className="input mt-2"
          placeholder={`${recipient}’s UPI ID (e.g. name@okaxis)`}
          value={manualUpi}
          onChange={(e) => setManualUpi(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          aria-label="Recipient UPI ID"
          data-testid="manual-upi"
        />
      )}
      {shown.length > 0 && (
        <div className="mt-2 space-y-2">
          {shown.map((o) =>
            o.qr ? (
              <UpiCard
                key={`${o.key}-${o.value}`}
                o={o}
                amount={amount}
                cur={cur}
                toMe={toMe}
                payer={payer}
                onPick={() => onPick('UPI')}
                onCopy={async () => {
                  await copy(o.value)
                  onPick('UPI')
                  toast('UPI ID copied')
                }}
              />
            ) : (
              <div key={`${o.key}-${o.value}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-muted">{o.label}</div>
                  <div className="truncate font-mono text-sm">{o.value}</div>
                </div>
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white dark:hover:bg-ink-700"
                  onClick={async () => {
                    await copy(o.value)
                    onPick(methodFor(o))
                    toast(`${o.label} copied`)
                  }}
                  aria-label={`Copy ${o.label}`}
                >
                  <CopyIcon size={18} />
                </button>
                {o.href && (
                  <a
                    className="accent-live flex h-11 w-11 items-center justify-center rounded-xl bg-fill text-on-fill"
                    href={o.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onPick(methodFor(o))}
                    aria-label={`Open ${o.label} (opens in a new tab)`}
                  >
                    <ExternalIcon size={18} />
                  </a>
                )}
              </div>
            ),
          )}
          <HintText hint={PAY_OUTSIDE_HINT} className="text-xs text-muted" />
        </div>
      )}
    </div>
  )
}

/* ───────────────────── Settle up with one person, across groups ───────────────────── */

/**
 * /settle/with/:key — everything with one person in one currency (a PersonBalance from
 * Balances → By person), settled with one real payment. Prefilled with the net; editing it
 * records a partial payment, shared across the groups by allocateAcrossGroups (lib/settleMulti).
 * Each group gets its own settlement, in its own direction, so they all clear (or shrink).
 * People with balances in several currencies get one of these per currency: never netted.
 */
export function SettleWithPerson() {
  usePageTitle('Settle up')
  const { key = '' } = useParams()
  const { user, profile } = useMe()
  const data = useAllGroupData()
  const nav = useNavigate()
  const toast = useToast()
  const home = profile.currency
  // What I owe in a group that asks for the payee's OK isn't netted against what they owe me
  // elsewhere (it would wait for their OK while the rest counted): it's settled in that group.
  const split = useMemo(() => {
    if (!data) return null
    const gated = new Set(data.filter((d) => d.group.paymentApproval).map((d) => d.group.id))
    return nettableRows(pendingSettlements(data, home), gated)
  }, [data, home])
  const rows = split?.rows ?? null
  // A combined key (person|*, from Balances with Collect in my currency): every currency, in yours.
  const combined = key.endsWith('|*')
  const rates = useTodayRates(home, combined && rows ? rows.map((r) => r.currency) : [])
  // Trips in another currency at the trip's rate, as in each group's own Settle up; Today puts every group on today's.
  const [basisPicked, setBasisPicked] = useState<RateBasis | null>(null)
  const basis: RateBasis = basisPicked ?? 'trip'
  /** the choice changed: fill in the new total once it's worked out */
  const [refill, setRefill] = useState(false)
  /** the trip day of each row that has one (whatever the choice), for the choice and the payment's record */
  const tripDays = useMemo(() => {
    if (!combined || !rows || !data) return {}
    const groups = Object.fromEntries(
      data.map((d) => [d.group.id, { type: d.group.type, endDate: d.group.endDate, expenseDates: d.expenses.map((e) => e.date) }]),
    )
    return rowTripDates(rows, groups, home, todayISO())
  }, [combined, rows, data, home])
  const rowRates = useRowTripRates(combined ? rows : null, data, home, basis)
  const people = useMemo<(PersonBalance | HomeBalance)[] | null>(() => {
    if (!rows) return null
    const list = personBalances(rows)
    if (!combined) return list
    return rates && rowRates ? inHome(list, home, rates, rowRates.rates, rowRates.days) : null
  }, [rows, combined, rates, rowRates, home])
  /** frozen while saving: each saved settlement changes the live balance under us */
  const [snap, setSnap] = useState<PersonBalance | HomeBalance | null>(null)
  const p = snap ?? people?.find((x) => x.key === key) ?? null
  /** minor units; undefined while empty */
  const [amount, setAmount] = useState<number>()
  const [method, setMethod] = useState('')
  const [methodTouched, setMethodTouched] = useState(false)
  const pickMethod = (m: string) => {
    setMethod(m)
    setMethodTouched(true)
  }
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [payee, setPayee] = useState<MemberProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [init, setInit] = useState(false)
  // Method and Note are optional extras: hidden in the Minimal look.
  const optional = useShows(2)

  const cur = p?.currency ?? 'INR'
  const toMe = !!p && p.net > 0
  /** groups in the net direction (where the money goes); the others are netted out */
  const major = p ? p.parts.filter((r) => (p.net > 0 ? r.dir === 'owed' : r.dir === 'owe')) : []
  const majorKey = major.map((r) => `${r.groupId}:${r.memberId}`).join(',')

  useEffect(() => {
    if (!p || init) return
    setInit(true)
    setAmount(p.net === 0 ? undefined : Math.abs(p.net))
    setMethod(settleMethods(p.currency)[0])
  }, [p, init])
  // Trip rates ↔ Today: the total at the other rates, once they're in.
  useEffect(() => {
    if (!refill || !p) return
    setRefill(false)
    setAmount(p.net === 0 ? undefined : Math.abs(p.net))
  }, [p, refill])

  // The recipient's payment handles: per group, so try each shared group until one has some.
  const recipientUid = toMe ? user.uid : p?.parts.find((r) => r.uid)?.uid
  // A private group opened here: its copy can now be read (a token before).
  const vaultV = useVaultVersion()
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the groups' values (majorKey), not the live balance object, so a saved settlement does not refetch the handles.
  useEffect(() => {
    setPayee(null)
    if (!p || p.net === 0) return
    let off = false
    const tries = major.map((r) => ({ groupId: r.groupId, uid: toMe ? user.uid : r.uid })).filter((t): t is { groupId: string; uid: string } => !!t.uid)
    ;(async () => {
      let first: MemberProfile | null = null
      for (const t of tries) {
        const m = await repo.getMemberProfile(t.groupId, t.uid).catch(() => null)
        if (off) return
        if (m && payOptions(m.payment, 0, cur, '').length > 0) {
          setPayee(m)
          return
        }
        first ??= m
      }
      if (!off && first) setPayee(first)
    })()
    return () => {
      off = true
    }
  }, [majorKey, toMe, cur, user.uid, p?.net === 0, vaultV])

  // Method: what was last used to pay this person in one of these groups, else UPI when they have a UPI ID.
  const payeeUpi = !!payee?.payment?.upi?.trim()
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pick only when the groups (majorKey) or the UPI ID change, not on every live balance update; a method picked by hand is kept.
  useEffect(() => {
    if (!p || !init || methodTouched) return
    const ms = settleMethods(cur)
    const remembered = major.map((r) => lastMethod(r.groupId, toMe ? r.me : r.memberId)).find((m) => m && ms.includes(m))
    setMethod(remembered ?? (payeeUpi && ms.includes('UPI') ? 'UPI' : ms[0]))
  }, [majorKey, payeeUpi, init])

  if (!people && !snap)
    return (
      <>
        <PageHeader title="Settle up" back="/settle" />
        <CardSkeleton className="h-48" />
        <ListSkeleton rows={3} />
      </>
    )
  if (!p) {
    return (
      <>
        <PageHeader title="Settle up" back="/settle" />
        <Empty icon="confetti" title="Nothing left to settle">
          You’re all square with this person.{' '}
          <Link to="/settle" className="font-semibold text-brand-600 dark:text-brand-300">
            Back to Balances
          </Link>
        </Empty>
      </>
    )
  }

  const n = new Set(p.parts.map((r) => r.groupId)).size
  const even = p.net === 0
  const owedTotal = Math.abs(p.net)
  const value = even ? 0 : (amount ?? 0)
  // Folded into your currency: one payment in it, recorded in each group in that group's currency.
  const hb = 'approx' in p && p.approx ? (p as HomeBalance) : null
  const approx = !!hb
  const homePlan = hb ? planInHome(hb, value) : null
  const tooMuch = !even && (homePlan ? homePlan.status === 'over' : value > owedTotal)
  const plain = allocateAcrossGroups(
    p.parts.map((r) => ({ key: r.key, signed: signedAmount(r) })),
    value,
  )
  const plan = homePlan ? { payment: value, clearsAll: homePlan.clearsAll } : plain
  const recorded = new Map<string, { amount: Cents; left: Cents; paid?: Cents; counter?: boolean }>(
    homePlan ? homePlan.parts.map((x) => [x.key, x]) : plain.allocations.map((a) => [a.key, a]),
  )
  const mixed = p.parts.some((r) => r.dir === 'owe') && p.parts.some((r) => r.dir === 'owed')
  const partial = !even && value > 0 && (homePlan ? homePlan.status === 'part' : value < owedTotal)
  const fmt = (c: Cents) => formatMoney(c, cur)
  const recordCount = new Set(p.parts.filter((r) => (recorded.get(r.key)?.amount ?? 0) > 0).map((r) => r.groupId)).size
  const meName = profile.displayName || 'You'
  // Same person, other currencies: separate balances, never netted with this one.
  const personPart = p.key.slice(0, p.key.lastIndexOf('|'))
  const otherCur = (people ?? []).filter((x) => x.key !== p.key && x.key.slice(0, x.key.lastIndexOf('|')) === personPart)
  const held = (split?.held ?? []).filter((r) => personKey(r) === personPart && (combined || r.currency === cur))
  // Payments from me to them already recorded and waiting for their OK, in these groups, so nobody pays twice.
  const waiting = p.parts.reduce((sum, r) => {
    const g = data?.find((d) => d.group.id === r.groupId)
    return g && r.currency === cur ? sum + waitingTotal(g.waiting, r.me, r.memberId) : sum
  }, 0)

  const save = async () => {
    if (!even && value <= 0) return toast('Enter an amount', 'err')
    if (tooMuch) return toast(`That’s more than the ${fmt(owedTotal)} owed overall`, 'err')
    setSnap(p)
    setBusy(true)
    const auto = even
      ? `Netted out across ${n} groups (no payment)`
      : `Part of one payment of ${fmt(plan.payment)} ${toMe ? `from ${p.label}` : `to ${p.label}`} across ${n} groups`
    let saved = 0
    try {
      for (const r of p.parts) {
        const a = recorded.get(r.key)
        if (!a || a.amount <= 0) continue
        const from = r.dir === 'owed' ? r.memberId : r.me
        const to = r.dir === 'owed' ? r.me : r.memberId
        const counter = even || (homePlan ? !!a.counter : Math.sign(signedAmount(r)) !== Math.sign(p.net))
        // The part of the payment that went to this group, when it's in another currency than the money.
        const paid =
          approx && !counter && r.currency !== cur && a.paid && 'rates' in p
            ? paidIn(cur, a.paid, 1 / (p as HomeBalance).rates[r.key], (basis === 'trip' && tripDays[r.key]) || todayISO())
            : undefined
        await repo.saveSettlement({
          id: uid('s_'),
          groupId: r.groupId,
          from,
          to,
          amount: a.amount,
          method: counter ? 'Cross-group netting' : method,
          note: note.trim() || auto,
          date,
          createdBy: user.uid,
          createdAt: Date.now(),
          paid,
        })
        if (!counter) rememberMethod(r.groupId, to, method)
        saved++
      }
      haptic('save')
      toast(
        even
          ? `Cleared ${n} groups with ${p.label}`
          : plan.clearsAll
            ? `Settled up with ${p.label} across ${n} groups 💸`
            : `Recorded ${fmt(plan.payment)} ${toMe ? 'from' : 'to'} ${p.label} 💸`,
      )
      nav('/settle', { replace: true })
    } catch (e) {
      toast(saved ? `Saved ${saved} of the groups, then: ${errText(e)}` : errText(e), 'err')
      // Start over from what's actually left now.
      setSnap(null)
      setInit(false)
      setBusy(false)
    }
  }

  const big = amount !== undefined && groupedInput(amount, cur).length > 7

  return (
    <form
      data-testid="settle-person"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
    >
      <PageHeader title="Settle up" subtitle={`with ${p.label} · ${n} groups`} back="/settle" />
      <div className="card p-5">
        <div className="flex flex-col items-center text-center">
          <Avatar name={p.label} photoURL={p.photoURL} color={p.color} size={56} />
          <div className="text-muted mt-2 text-sm font-semibold" data-testid="settle-person-dir">
            {even ? `You and ${p.label} are even overall` : toMe ? `${p.label} pays you` : `You pay ${p.label}`}
          </div>
        </div>
        {even ? (
          <div className="mt-3 text-center">
            <div className="text-3xl font-extrabold">No money changes hands</div>
            <HintText
              className="text-muted mt-1 text-sm"
              hint={{
                full: `What you owe in one group cancels what ${p.label} owes in another. Clearing records it in each.`,
                short: 'Clearing records it in each group.',
              }}
            />
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-baseline justify-center gap-2">
              <span
                className={`text-muted font-extrabold leading-none tracking-tight ${currencySymbol(cur).length > 2 ? 'text-3xl' : big ? 'text-4xl' : 'text-5xl'}`}
                aria-hidden
              >
                {currencySymbol(cur)}
              </span>
              <MoneyInput
                bare
                grouped
                id="settle-person-amount"
                className={`w-auto min-w-[3ch] max-w-[15rem] rounded-lg bg-transparent text-center [field-sizing:content] font-extrabold tabular-nums outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-brand-500 ${tooMuch ? 'neg' : ''} ${big ? 'text-4xl' : 'text-5xl'}`}
                placeholder={centsToInput(0, cur)}
                aria-label={`Total amount in ${cur}`}
                aria-invalid={tooMuch || undefined}
                aria-describedby="settle-person-hint"
                enterKeyHint="done"
                value={amount}
                currency={cur}
                onChange={setAmount}
                data-testid="settle-person-amount"
              />
            </div>
            <div id="settle-person-hint" className="text-muted mt-1 text-center text-sm" aria-live="polite">
              {tooMuch ? (
                <span className="neg">More than the {fmt(owedTotal)} owed overall. </span>
              ) : value === owedTotal ? (
                `Total across ${n} groups`
              ) : (
                `${toMe ? `${p.label} owes you` : `You owe ${p.label}`} ${fmt(owedTotal)} overall. `
              )}
              {value !== owedTotal && (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center font-semibold text-brand-600 dark:text-brand-300"
                  onClick={() => setAmount(owedTotal)}
                >
                  Use
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card mt-3 p-4" data-testid="settle-person-breakdown">
        <h2 className="label">Recorded in each group</h2>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {p.parts.map((r) => {
            const a = recorded.get(r.key)
            const s = Math.sign(signedAmount(r))
            return (
              <li key={r.key} className="flex items-center gap-3 py-2.5" data-testid="settle-person-part">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-ink-800" aria-hidden>
                  {r.groupEmoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.groupName}</div>
                  <div className="text-muted truncate text-xs">
                    {r.dir === 'owed' ? `${p.label} owes you ${formatMoney(r.amount, r.currency)}` : `You owe ${p.label} ${formatMoney(r.amount, r.currency)}`}
                    {approx && r.currency !== cur && a?.paid ? ` · ${fmt(a.paid)} of the payment` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-bold tabular-nums ${a?.amount ? (s > 0 ? 'pos' : 'neg') : 'text-muted'}`} data-testid="settle-person-part-amount">
                    {formatMoney(s * (a?.amount ?? 0), r.currency, { sign: true })}
                  </div>
                  <div className="text-muted text-[11px] tabular-nums">{a && a.left > 0 ? `${formatMoney(a.left, r.currency)} left` : 'clears'}</div>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-1 flex items-center gap-3 border-t border-slate-200 pt-2.5 dark:border-white/10">
          <span className="flex-1 font-bold">{even ? 'Net' : toMe ? `${p.label} pays you` : `You pay ${p.label}`}</span>
          <span className={`font-extrabold tabular-nums ${even ? 'text-muted' : toMe ? 'pos' : 'neg'}`} data-testid="settle-person-total">
            {formatMoney(Math.sign(p.net) * plan.payment, cur, { sign: !even })}
          </span>
        </div>
        {((mixed && !even) || (partial && optional)) && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
            {mixed && !even && (
              <HintText
                className=""
                hint={{
                  full: (
                    <>
                      <Lightbulb size={14} className="mb-0.5 mr-1 inline" aria-hidden />
                      Debts across groups cancel out. All are cleared and only {fmt(plan.payment)} changes hands.
                    </>
                  ),
                  short: `Debts across groups cancel out: only ${fmt(plan.payment)} changes hands.`,
                  tier: 'key',
                }}
              />
            )}
            {partial && (
              <HintText
                className=""
                hint={{
                  full: 'A part payment is split across groups by what’s owed in each. To waive the rest in one group, settle from that group.',
                  short: 'Split across groups by what’s owed.',
                }}
              />
            )}
          </div>
        )}
        {approx && Object.keys(tripDays).length > 0 && (
          <div className="mt-3" data-testid="settle-person-basis">
            <Segmented<RateBasis>
              value={basis}
              onChange={(b) => {
                setBasisPicked(b)
                setRefill(true)
              }}
              label="Which day’s exchange rate"
              options={[
                { value: 'trip', label: 'Trip rates' },
                { value: 'today', label: 'Today' },
              ]}
            />
          </div>
        )}
        {approx && (
          <p className="text-muted mt-3 text-xs" data-testid="settle-person-approx">
            <HintText
              as="span"
              className=""
              hint={
                basis === 'trip' && Object.keys(tripDays).length > 0
                  ? {
                      full: 'Trips convert at the rate on the day each ended, the rest at today’s ECB rate. Paying within 4% of the total clears it all. Each group records its own currency.',
                      short: 'Trips at their own rate, the rest at today’s. Within 4% clears it all.',
                      tier: 'key',
                    }
                  : {
                      full: 'Converted at today’s ECB rate. Paying within 4% of the total clears it all. Each group records its own currency.',
                      short: 'At today’s ECB rate. Within 4% clears it all.',
                      tier: 'key',
                    }
              }
            />
          </p>
        )}
        {waiting > 0 && (
          <p className="mt-3 text-xs text-sky-700 dark:text-sky-300" data-testid="settle-person-waiting">
            {formatMoney(waiting, cur)} you recorded waits for {p.label}’s OK and isn’t counted above.
          </p>
        )}
        {held.length > 0 && (
          <p className="text-muted mt-3 text-xs" data-testid="settle-person-held">
            Not included: what you owe {p.label} in {held.map((r) => r.groupName).join(', ')}, where payments need their OK. Settle it there.
          </p>
        )}
        {otherCur.length > 0 && (
          <p className="text-muted mt-3 text-xs">
            {p.label} also has balances in {otherCur.map((x) => x.currency).join(', ')}. Currencies never net together: settle those from Balances.
          </p>
        )}
      </div>

      {!even && (
        <PayWith
          key={toMe ? 'me' : p.key}
          cur={cur}
          toMe={toMe}
          payer={toMe ? p.label : 'You'}
          recipient={toMe ? 'You' : p.label}
          recipientJoined={!!recipientUid}
          payment={payee?.payment}
          payeeName={payee?.displayName ?? (toMe ? meName : p.name)}
          amount={tooMuch ? 0 : value}
          payNote="Split Now settle up"
          onPick={pickMethod}
        />
      )}

      <div className="card mt-3 space-y-3 p-4">
        {!even && optional && (
          <div>
            <div className="label" id="settle-person-method-label">
              Method
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="settle-person-method-label">
              {settleMethods(cur).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={m === method}
                  onClick={() => pickMethod(m)}
                  className={`chip min-h-10 ${m === method ? 'chip-on' : ''}`}
                >
                  {methodLabel(m)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={optional ? 'grid grid-cols-2 gap-2' : ''}>
          <DateField aria-label="Date" value={date} onChange={(v) => setDate(v || todayISO())} />
          {optional && <input className="input" placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />}
        </div>
      </div>

      {/* Pinned to the bottom of the screen (full screen, no tab bar), so Record is always in reach. */}
      <div className="pinned-action sticky bottom-0 z-20 -mx-4 mt-5 bg-gradient-to-t from-slate-50 from-70% to-slate-50/0 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-4 dark:from-ink-950 dark:to-ink-950/0">
        <button type="submit" className="btn-primary w-full" disabled={busy || tooMuch || (!even && value <= 0)} data-testid="settle-person-confirm">
          {even ? (
            <>
              <ChecksIcon size={18} aria-hidden /> Clear {n} groups
            </>
          ) : (
            <>
              <ChequeIcon size={22} /> Record {value > 0 ? fmt(value) : 'payment'}
            </>
          )}
        </button>
        <p className="text-muted mt-2 text-center text-xs">
          {recordCount > 0 && (
            <>
              Records a settlement in {recordCount} group{recordCount === 1 ? '' : 's'}
              {plan.clearsAll ? ', clearing every one' : ''}.
            </>
          )}
        </p>
      </div>
    </form>
  )
}

/**
 * A preview of the picked screenshot, drawn on a canvas (cropped to fill, like object-cover):
 * no URL is made from the file, so nothing from it ever reaches the DOM as markup or a link.
 */
function ProofThumb({ file }: { file: Blob }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live = true
    createImageBitmap(file)
      .then((bmp) => {
        const c = ref.current
        const ctx = c?.getContext('2d')
        if (!live || !c || !ctx) return bmp.close()
        const scale = Math.max(c.width / bmp.width, c.height / bmp.height)
        const w = bmp.width * scale,
          h = bmp.height * scale
        ctx.drawImage(bmp, (c.width - w) / 2, (c.height - h) / 2, w, h)
        bmp.close()
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [file])
  return <canvas ref={ref} width={96} height={128} role="img" aria-label="Payment screenshot" className="h-16 w-12 rounded-lg ring-1 ring-black/10" />
}
