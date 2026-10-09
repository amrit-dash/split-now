import type { ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, CircleCheck, Copy, Share2, XCircle } from 'lucide-react'
import { repo } from '@/data'
import { useAuth } from '@/hooks/auth'
import { useGroup, usePayLink } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { demoGuestId, useAnonymousSignIn } from '@/hooks/useGuest'
import type { PaymentHandles } from '@/types'
import { usePageTitle } from '@/lib/brand'
import { errText } from '@/lib/errors'
import { uid as newId } from '@/lib/id'
import { formatDate } from '@/lib/locale'
import { formatMoney } from '@/lib/money'
import { needsHostConfirm, parsePayLinkCode, payLinkFeatures, payLinkUrl, payLinkView, settleUpPath, statusLine, type PayLink } from '@/lib/paylinks'
import { payOptions } from '@/lib/payments'
import { copy, shareOrCopy } from '@/lib/share'
import { firstName } from '@/lib/share-card'
import { useConfirm } from '@/components/ConfirmSheet'
import { ClaimReview, useProofUrl } from '@/components/ClaimReview'
import { GuestPay } from '@/components/GuestPay'
import { MarkPaid } from '@/components/MarkPaid'
import { Empty, Loading } from '@/components/Misc'
import { useToast } from '@/components/Toast'

/*
 * /r/{code}: a Pay me link. Works without an account (an anonymous sign-in, as live tables do):
 * the debtor sees what they owe and the payee's UPI QR, app buttons and handles, pays, and taps
 * "I've paid". A member of the link's group goes to their prefilled Settle up instead; the person
 * who made the link sees its status and the payment screenshot.
 */

interface Viewer {
  uid?: string
  anonymous: boolean
  /** demo: a second "phone" in this browser (?guest=demo, or signed out) */
  guestMode: boolean
  error?: string
}

function useViewer(): Viewer {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const error = useAnonymousSignIn()
  if (repo.mode === 'demo' && (params.get('guest') === 'demo' || !user)) return { uid: demoGuestId(() => newId('guest_')), anonymous: true, guestMode: true }
  return { uid: user?.uid, anonymous: !user || !!user.isAnonymous, guestMode: false, error }
}

export default function PayLinkPage() {
  const { code: raw = '' } = useParams()
  const code = parsePayLinkCode(raw)
  const viewer = useViewer()
  const link = usePayLink(code || null, viewer.uid)
  // Membership decides between the in-app Settle up and this page; only asked of signed-in people.
  const askGroup = !!link?.groupId && !viewer.anonymous && !viewer.guestMode
  const group = useGroup(askGroup ? link?.groupId : undefined)
  const member = askGroup ? (group === undefined ? undefined : !!group && !!viewer.uid && group.memberUids.includes(viewer.uid)) : false
  const guestPages = payLinkFeatures(useFlag('payLinks')).guestPages
  const view = !code ? 'missing' : payLinkView(link, { uid: viewer.uid, anonymous: viewer.anonymous, member, guestMode: viewer.guestMode }, Date.now())
  usePageTitle(view === 'loading' ? undefined : 'Pay me link')

  if (viewer.error)
    return (
      <Shell>
        <Empty emoji="🔌" title="Couldn’t open the link">
          {viewer.error}
        </Empty>
      </Shell>
    )
  if (view === 'loading' || (!viewer.uid && code)) return <Loading />
  if (view === 'missing' || !link)
    return (
      <Shell>
        <Empty emoji="🔍" title="This Pay me link doesn’t exist">
          Check the link, or ask for a new one.
        </Empty>
      </Shell>
    )
  const payee = firstName(link.payeeName)
  if (view === 'settle') return <Navigate to={settleUpPath(link)} replace />
  if (view === 'payee') return <PayeeView link={link} />
  if (view === 'expired')
    return (
      <Shell>
        <Empty emoji="⌛" title="This Pay me link has expired">
          Links work for 30 days. Ask {payee} for a new one.
        </Empty>
      </Shell>
    )
  if (view === 'cancelled')
    return (
      <Shell>
        <Empty emoji="🚫" title={`${payee} cancelled this link`}>
          Nothing to pay here. Ask {payee} if you’re not sure.
        </Empty>
      </Shell>
    )
  if (view === 'notYours')
    return (
      <Shell>
        <Empty emoji="🔒" title="This link is for someone else">
          Ask {payee} for your own Pay me link.
        </Empty>
      </Shell>
    )
  if (view === 'claimed')
    return (
      <Shell>
        <Hero link={link} title={`Waiting for ${payee} to confirm`} emoji="⏳" />
        <div className="card mt-6 p-5 text-center" data-testid="paylink-claimed">
          <div className="text-4xl font-extrabold tabular-nums">{formatMoney(link.amount, link.currency)}</div>
          <p className="mt-3 text-sm">
            Marked paid{link.paidAt ? ` ${formatDate(link.paidAt)}` : ''}. {payee} checks it and confirms
            {link.groupId ? `, then it’s recorded as a payment in ${link.groupName}` : ''}.
          </p>
        </div>
        {viewer.anonymous && <GetApp />}
      </Shell>
    )
  if (view === 'paid') return <PaidView link={link} signedIn={!viewer.anonymous} />
  if (!guestPages)
    return (
      <Shell>
        <Empty emoji="🔕" title="Pay me links are off for now">
          Ask {payee} for their UPI ID, or settle up in the app.
        </Empty>
      </Shell>
    )
  return <PayView link={link} signedIn={!viewer.anonymous} />
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-md px-4 pb-10 pt-[calc(var(--safe-top)+4rem)]">{children}</div>
}

function Hero({ link, title, emoji }: { link: PayLink; title: string; emoji?: string }) {
  return (
    <div className="text-center">
      <div
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-100 to-duo-100 text-5xl dark:from-brand-900/50 dark:to-duo-900/30"
        aria-hidden
      >
        {emoji ?? link.emoji ?? '💸'}
      </div>
      <p className="text-muted mt-4 text-sm font-semibold">{link.groupName}</p>
      <h1 className="text-2xl font-extrabold">{title}</h1>
    </div>
  )
}

/** For people without the app: a gentle pointer, never a wall. */
function GetApp() {
  return (
    <p className="text-muted mt-6 text-center text-sm">
      Split bills like this with your own friends:{' '}
      <a className="font-semibold text-brand-600 dark:text-brand-300" href="/">
        get Split Now
      </a>
      .
    </p>
  )
}

function PayView({ link, signedIn }: { link: PayLink; signedIn: boolean }) {
  const payee = firstName(link.payeeName)
  const payer = firstName(link.payerName)
  const money = formatMoney(link.amount, link.currency)
  const options = payOptions(link.payment as PaymentHandles, link.amount, link.currency, `Split Now ${link.groupName}`, link.payeeName)
  return (
    <Shell>
      <Hero link={link} title={`Pay ${payee}`} />
      <div className="card mt-6 p-5 text-center">
        <div className="text-muted text-sm">
          {payer} owes {payee}
        </div>
        <div className="text-4xl font-extrabold tabular-nums" data-testid="paylink-amount">
          {money}
        </div>
        {options.length > 0 ? (
          <GuestPay options={options} amount={link.amount} currency={link.currency} />
        ) : (
          <p className="text-muted mt-3 text-sm">Ask {payee} how they’d like to be paid, then tap “I’ve paid”.</p>
        )}
        <div className="mt-4">
          <MarkPaid
            code={link.code}
            payee={payee}
            amount={link.amount}
            currency={link.currency}
            groupName={link.groupId ? link.groupName : undefined}
            confirmFirst={needsHostConfirm(link)}
          />
        </div>
      </div>
      <p className="text-muted mt-4 text-center text-xs">
        Split Now never moves money. Pay in your UPI or banking app, then tap “I’ve paid” and {payee} sees it at once. No account needed.
      </p>
      {!signedIn && <GetApp />}
    </Shell>
  )
}

function PaidView({ link, signedIn }: { link: PayLink; signedIn: boolean }) {
  const payee = firstName(link.payeeName)
  return (
    <Shell>
      <Hero link={link} title="Marked paid" emoji="✅" />
      <div className="card mt-6 p-5 text-center" data-testid="paylink-paid">
        <div className="text-4xl font-extrabold tabular-nums">{formatMoney(link.amount, link.currency)}</div>
        <div className="text-muted mt-1 text-sm">
          {link.paidAt ? `Paid ${formatDate(link.paidAt)}` : 'Paid'}
          {link.method ? ` · ${link.method}` : ''}
        </div>
        <p className="mt-3 text-sm">
          {payee} can see it now.{link.groupId ? ` It’s recorded as a payment in ${link.groupName}.` : ''}
        </p>
      </div>
      {!signedIn && <GetApp />}
    </Shell>
  )
}

/** The person who made the link: where it stands, the screenshot, and Share again / Cancel while it is open. */
function PayeeView({ link }: { link: PayLink }) {
  const toast = useToast()
  const confirm = useConfirm()
  const payer = firstName(link.payerName)
  const money = formatMoney(link.amount, link.currency)
  const url = payLinkUrl(location.origin, link.code)
  const proof = useProofUrl(link.status === 'claimed' ? undefined : link.proofPath)
  const open = link.status === 'open' && Date.now() < link.expiresAt
  const cancel = async () => {
    const ok = await confirm({
      title: 'Cancel this Pay me link?',
      message: `${payer} will see that it was cancelled and can’t mark it paid any more.`,
      confirmLabel: 'Cancel link',
      tone: 'danger',
    })
    if (!ok) return
    repo.cancelPayLink(link.code).catch((e) => toast(errText(e), 'err'))
  }
  return (
    <Shell>
      <Hero link={link} title="Your Pay me link" />
      <div className="card mt-6 p-5 text-center">
        <div className="text-muted text-sm">{payer} owes you</div>
        <div className="text-4xl font-extrabold tabular-nums">{money}</div>
        <div
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
            link.status === 'paid'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
              : link.status === 'claimed'
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                : 'bg-slate-100 text-slate-700 dark:bg-ink-800 dark:text-slate-200'
          }`}
          data-testid="paylink-status"
        >
          {link.status === 'paid' ? <CircleCheck size={16} aria-hidden /> : link.status === 'cancelled' ? <XCircle size={16} aria-hidden /> : null}
          {statusLine(link, Date.now(), (ms) => formatDate(ms))}
        </div>
        {link.status === 'paid' && link.method && <p className="text-muted mt-2 text-sm">{`${payer} says they paid by ${link.method}.`}</p>}
        {link.status === 'claimed' && (
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/5">
            <ClaimReview link={link} />
          </div>
        )}
        {link.proofPath && link.status !== 'claimed' && (
          <div className="mt-4">
            {proof ? (
              <a href={proof} target="_blank" rel="noreferrer" className="inline-block">
                <img src={proof} alt={`${payer}’s payment screenshot`} className="max-h-80 rounded-2xl ring-1 ring-slate-200 dark:ring-white/10" />
              </a>
            ) : proof === null ? (
              <p className="text-muted text-sm">The screenshot couldn’t be loaded.</p>
            ) : (
              <p className="text-muted text-sm">Loading the screenshot…</p>
            )}
          </div>
        )}
        {link.status === 'paid' && link.groupId && (
          <p className="text-muted mt-3 text-xs">Not right? Delete the payment in the group and it counts as owed again.</p>
        )}
      </div>
      {open && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => copy(url).then((ok) => toast(ok ? 'Link copied' : 'Couldn’t copy', ok ? 'ok' : 'err'))}
          >
            <Copy size={16} aria-hidden /> Copy link
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              shareOrCopy({ title: `Split Now · ${link.groupName}`, text: `${payer}, you owe me ${money} for “${link.groupName}”. Pay here:`, url }).then(
                (r) => r === 'copied' && toast('Link copied'),
              )
            }
          >
            <Share2 size={16} aria-hidden /> Share again
          </button>
        </div>
      )}
      {link.groupId && (
        <Link to={`/groups/${link.groupId}`} className="btn-secondary mt-2 w-full">
          <ArrowRight size={16} aria-hidden /> Open {link.groupName}
        </Link>
      )}
      {open && (
        <button type="button" className="btn-ghost mt-2 w-full text-rose-600 dark:text-rose-400" onClick={cancel} data-testid="paylink-cancel">
          Cancel this link
        </button>
      )}
    </Shell>
  )
}
