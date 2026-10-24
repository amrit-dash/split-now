import { shownPaySections } from '@/lib/pay-sections'
import { useFeature } from '@/hooks/useMode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, X } from 'lucide-react'
import {
  CameraIcon,
  ExitIcon,
  ImageIcon,
  RowBalancesIcon,
  RowHelpIcon,
  RowInsightsIcon,
  RowPayIcon,
  RowSettingsIcon,
  RowSupportIcon,
  SettingsIcon,
  ShieldIcon,
  TrashIcon,
} from '@/components/icons'
import { useWhatsNew } from '@/hooks/useWhatsNew'
import { repo } from '@/data'
import { semverOf } from '@/lib/flags'
import { useMe } from '@/hooks/auth'
import type { PaymentHandles, UserProfile } from '@/types'
import { usePageTitle } from '@/lib/brand'
import { errText } from '@/lib/errors'
import { paymentRegion } from '@/lib/locale'
import { isIfsc, isUpiId } from '@/lib/payments'
import { squareJpeg } from '@/lib/image'
import { paymentSummary } from '@/lib/profileSummary'
import { Spinner } from '@/components/Misc'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { Detail, HintText, InfoTip, useShows, type Hint } from '@/components/Hint'
import { PageHeader } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { readoutOn, setReadoutOn } from '@/components/ViewportReadout'
import { tapsToToggle } from '@/lib/keyboard'
import { AccountCard } from '@/components/ProfileCards'
import { InstallRow } from '@/components/InstallBanner'
import { UpdateRow } from '@/components/UpdateRow'
import { SupportSheet } from '@/components/SupportSheet'
import { SavedPill, useSavedFlash } from './settings/common'
import { RowTile } from '@/components/RowTile'
import { ModeButton } from '@/components/ModeButton'

type Handle = {
  key: keyof PaymentHandles
  label: string
  placeholder: string
  hint?: (v: string) => string | undefined
  inputMode?: 'tel' | 'email' | 'text' | 'numeric'
}

const H: Record<Exclude<keyof PaymentHandles, 'phone'>, Handle> = {
  upi: {
    key: 'upi',
    label: 'UPI ID',
    placeholder: 'yourname@okaxis',
    inputMode: 'email',
    hint: (v) => (isUpiId(v) ? undefined : 'Looks like name@bank (find it in GPay / PhonePe / Paytm → profile)'),
  },
  account: { key: 'account', label: 'Account number', placeholder: '123456789012', inputMode: 'numeric' },
  ifsc: { key: 'ifsc', label: 'IFSC', placeholder: 'HDFC0001234', hint: (v) => (isIfsc(v) ? undefined : '11 characters, like HDFC0001234') },
  payid: { key: 'payid', label: 'PayID (email / mobile / ABN)', placeholder: 'you@example.com or 04xx xxx xxx' },
  bsb: { key: 'bsb', label: 'BSB', placeholder: '062-000' },
  paypal: { key: 'paypal', label: 'PayPal.me username', placeholder: 'yourname' },
  revolut: { key: 'revolut', label: 'Revolut tag', placeholder: '@yourname' },
}
type HandleKey = keyof typeof H

/** Payment handle sections by region (src/lib/locale.ts paymentRegion). The UPI phone number is the mobile number (a switch, not a second field). */
const SECTIONS: Record<'IN' | 'AU' | 'INTL', Array<{ title: string; keys: HandleKey[] }>> = {
  IN: [
    { title: 'UPI', keys: ['upi'] },
    { title: 'Bank transfer (IMPS / NEFT)', keys: ['account', 'ifsc'] },
    { title: 'International', keys: ['paypal', 'revolut'] },
  ],
  AU: [
    { title: 'Australia', keys: ['payid', 'bsb', 'account'] },
    { title: 'International', keys: ['paypal', 'revolut'] },
  ],
  INTL: [{ title: 'International', keys: ['paypal', 'revolut'] }],
}

const PAYMENT_HINT: Hint = {
  full: 'Friends see these when they settle up: a UPI QR for the exact amount, plus app and copy buttons.',
  short: 'Shown when friends settle up',
  tier: 'help',
}
// Privacy: what friends can see is never folded away.
const PAYMENT_PRIVACY_HINT: Hint = {
  full: 'Only people in your groups see these. Add only what you’d put on an invoice.',
  short: 'Only people in your groups see these',
  tier: 'key',
}
// The rows under the profile card: one line each, all 'help', so a detail level shows them all or none.
const SETTINGS_ROW_HINT: Hint = { full: 'Currency, theme, notifications, auto-capture, AI, data', short: 'Currency, theme and more', tier: 'help' }
const BALANCES_ROW_HINT: Hint = { full: 'Who owes whom, by person or by group', short: 'Who owes whom', tier: 'help' }
const SUPPORT_ROW_HINT: Hint = { full: 'Buy me a coffee or sponsor on GitHub', short: 'Coffee or GitHub sponsor', tier: 'help' }
const HELP_ROW_HINT: Hint = { full: 'How things work, and what’s new', short: 'How things work', tier: 'help' }
const INSIGHTS_ROW_HINT: Hint = { full: 'Where your money went, by month and category', short: 'Where your money went', tier: 'help' }
const PHOTO_HINT: Hint = { full: 'People in your groups see your photo.', tier: 'key' }

/** Old deep links into Profile sections now live under Settings. */
const HASH_ROUTES: Record<string, string> = {
  '#auto-capture': '/settings/automation',
  '#ai': '/settings/ai',
  '#ai-admin': '/settings/admin',
  '#notifications': '/settings/notifications',
  '#appearance': '/settings/preferences',
}

const cleanPhone = (v: string) => v.replace(/[^\d+]/g, '')
const handlesKey = (h: PaymentHandles | undefined) =>
  JSON.stringify(
    Object.entries(h ?? {})
      .filter(([, v]) => v?.trim())
      .map(([k, v]) => [k, v!.trim()])
      .sort(([a], [b]) => a.localeCompare(b)),
  )

/**
 * /profile: who you are to other people (photo, name, mobile number, how friends can pay you,
 * sign-in methods) and the way out. Everything saves by itself; how the app behaves lives in
 * Settings (the gear).
 */
export default function Profile() {
  usePageTitle('Profile')
  const { profile, user } = useMe()
  const toast = useToast()
  const nav = useNavigate()
  const loc = useLocation()
  // Five taps on the version line: screen measurements on or off (components/ViewportReadout).
  const versionTaps = useRef<number[]>([])
  const tapVersion = () => {
    const r = tapsToToggle(versionTaps.current, Date.now())
    versionTaps.current = r.taps
    if (!r.toggle) return
    const on = !readoutOn()
    setReadoutOn(on)
    toast(on ? 'Screen measurements on' : 'Screen measurements off')
  }
  useEffect(() => {
    const to = HASH_ROUTES[loc.hash]
    if (to) nav(to, { replace: true })
  }, [loc.hash, nav])

  const [name, setName] = useState(profile.displayName)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [payment, setPayment] = useState<PaymentHandles>(profile.payment ?? {})
  const [allHandles, setAllHandles] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const whatsNew = useWhatsNew()
  const [saved, flash] = useSavedFlash()
  const showAll = useShows(2)
  const morePayMethods = useFeature('morePayMethods')
  const showBackend = useShows(3)

  // Re-sync the form when the saved fields change (not on a photo change, which would drop unsaved edits).
  const paymentKey = handlesKey(profile.payment)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync only when the saved fields change, not on every profile object
  useEffect(() => {
    setName(profile.displayName)
    setPhone(profile.phone ?? '')
    setPayment(profile.payment ?? {})
  }, [profile.displayName, profile.phone, paymentKey])

  // The mobile number doubles as the UPI number while the switch is on.
  const upiPhoneOn = !!payment.phone
  const onPhone = (v: string) => {
    setPhone(v)
    if (upiPhoneOn) setPayment((p) => ({ ...p, phone: cleanPhone(v) || undefined }))
  }
  const setUpiPhone = (on: boolean) => setPayment((p) => ({ ...p, phone: on ? cleanPhone(phone) || undefined : undefined }))

  // Autosave: 800 ms after the last edit, when a field loses focus, and when leaving the screen.
  const latest = useRef({ profile, name, phone, payment })
  latest.current = { profile, name, phone, payment }
  const commit = useCallback(async () => {
    const { profile: p, name: n, phone: ph, payment: pay } = latest.current
    const next: UserProfile = { ...p, displayName: n.trim() || p.displayName, phone: cleanPhone(ph) || undefined, payment: pay }
    const same = next.displayName === p.displayName && (next.phone ?? '') === (p.phone ?? '') && handlesKey(next.payment) === handlesKey(p.payment)
    if (same) return
    try {
      await repo.saveProfile(next)
      flash()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }, [flash, toast])
  const dirty =
    (name.trim() || profile.displayName) !== profile.displayName || cleanPhone(phone) !== (profile.phone ?? '') || handlesKey(payment) !== paymentKey
  // biome-ignore lint/correctness/useExhaustiveDependencies: the fields are the debounce trigger; commit reads them from the ref
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => {
      void commit()
    }, 800)
    return () => clearTimeout(t)
  }, [dirty, name, phone, payment, commit])
  useEffect(
    () => () => {
      void commit()
    },
    [commit],
  )

  const region = paymentRegion(profile.currency)
  // The region's ways to pay; Simple keeps UPI ID, bank transfer and PayPal (src/lib/pay-sections.ts).
  const shownSections = shownPaySections(SECTIONS[region], {
    simple: !morePayMethods,
    showAll,
    allHandles,
    allKeys: Object.keys(H) as HandleKey[],
    filled: (k) => !!payment[k]?.trim(),
  })

  return (
    <div>
      <PageHeader
        title="Profile"
        right={
          // Two round buttons side by side, bigger icons, no gap (owner): each keeps its own 44 px target.
          <div className="-mr-1.5 flex items-center">
            <span className="mr-1">
              <SavedPill on={saved} />
            </span>
            <ModeButton />
            <Link
              to="/settings"
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-ink-800"
              aria-label="Settings"
              data-testid="open-settings"
            >
              <SettingsIcon size={26} />
            </Link>
          </div>
        }
      />
      <AccountCard
        name={name}
        setName={setName}
        phone={phone}
        setPhone={onPhone}
        onBlur={() => {
          void commit()
        }}
        photoURL={profile.photoURL}
        email={profile.email}
        onPhoto={() => setPhotoOpen(true)}
        phoneHint={
          region === 'IN' && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
              <div className="min-w-0">
                {/* Simple: one line, the subtext's words as the title (owner). */}
                <div className="text-sm font-semibold">{morePayMethods ? 'Friends can pay this number with UPI' : 'Show as UPI number'}</div>
                {morePayMethods && (
                  <div className="text-muted text-xs">
                    {upiPhoneOn
                      ? `Shown as a UPI number${payment.phone && payment.phone !== cleanPhone(phone) ? ` (${payment.phone})` : ''}`
                      : 'Off: only your UPI ID is shared'}
                  </div>
                )}
              </div>
              <Switch
                checked={upiPhoneOn}
                onChange={setUpiPhone}
                label="Friends can pay this number with UPI"
                testId="upi-phone-switch"
                disabled={!cleanPhone(phone) && !upiPhoneOn}
              />
            </div>
          )
        }
      />

      <Collapsible
        id="payment"
        testId="section-payment"
        label="How friends can pay you"
        title={
          <>
            <span className="min-[400px]:hidden">How to pay you</span>
            <span className="hidden min-[400px]:inline">How friends can pay you</span>
          </>
        }
        icon={
          // The same tile as the rows below (Settings, Balances…), so the icons line up and match.
          <RowTile>
            <RowPayIcon size={22} />
          </RowTile>
        }
        summary={paymentSummary(payment, region)}
      >
        <HintText hint={PAYMENT_HINT} className="text-muted mb-3 text-xs" />
        <div className="space-y-4">
          {shownSections.map((sec) => (
            <div key={sec.title} className="space-y-3">
              <div className="text-muted text-xs font-bold uppercase tracking-wide">{sec.title}</div>
              {sec.keys.map((k) => {
                const h = H[k]
                const v = payment[k] ?? ''
                const hint = v && h.hint?.(v)
                return (
                  <div key={k}>
                    <label className="text-muted mb-1 block text-xs font-medium" htmlFor={`pay-${k}`}>
                      {h.label}
                    </label>
                    <input
                      id={`pay-${k}`}
                      className="input"
                      placeholder={h.placeholder}
                      inputMode={h.inputMode}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={v}
                      onChange={(e) => setPayment((p) => ({ ...p, [k]: e.target.value || undefined }))}
                      onBlur={() => {
                        void commit()
                      }}
                    />
                    {hint && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{hint}</p>}
                  </div>
                )
              })}
            </div>
          ))}
          {!allHandles && showAll && morePayMethods && (
            <button type="button" className="min-h-9 text-sm font-semibold text-brand-600 dark:text-brand-300" onClick={() => setAllHandles(true)}>
              Show all payment options
            </button>
          )}
        </div>
        <p className="text-muted mt-3 flex items-start gap-1.5 text-xs">
          <ShieldIcon size={14} className="mt-0.5 shrink-0" aria-hidden />{' '}
          <span>
            <HintText hint={PAYMENT_PRIVACY_HINT} as="span" className="" />
            <InfoTip hint={PAYMENT_PRIVACY_HINT} label="About who can see these" />
          </span>
        </p>
      </Collapsible>

      <div className="card mt-3 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Link
          to="/settings"
          className="flex items-center gap-3 p-4 font-medium transition active:bg-slate-50 dark:active:bg-ink-800"
          data-testid="profile-settings"
        >
          <RowTile>
            <RowSettingsIcon size={22} />
          </RowTile>
          <span className="min-w-0 flex-1">
            <span className="block">Settings</span>
            <HintText hint={SETTINGS_ROW_HINT} as="span" className="text-muted block text-xs font-normal" />
          </span>
          <ChevronRight size={18} className="text-slate-400" aria-hidden />
        </Link>
        <Link to="/help" className="flex items-center gap-3 p-4 font-medium transition active:bg-slate-50 dark:active:bg-ink-800" data-testid="profile-help">
          <RowTile>
            <RowHelpIcon size={22} />
          </RowTile>
          <span className="min-w-0 flex-1">
            <span className="block">Help</span>
            <HintText hint={HELP_ROW_HINT} as="span" className="text-muted block text-xs font-normal" />
          </span>
          {whatsNew.unseen.length > 0 && (
            <span className="rounded-full bg-fill px-2 py-0.5 text-[0.65rem] font-bold text-on-fill" data-testid="profile-help-new">
              New
            </span>
          )}
          <ChevronRight size={18} className="text-slate-400" aria-hidden />
        </Link>
        {/* Insights left the tab bar for Live table; it opens from here. */}
        <Link
          to="/insights"
          className="flex items-center gap-3 p-4 font-medium transition active:bg-slate-50 dark:active:bg-ink-800"
          data-testid="profile-insights"
        >
          <RowTile>
            <RowInsightsIcon size={22} />
          </RowTile>
          <span className="min-w-0 flex-1">
            <span className="block">Insights</span>
            <HintText hint={INSIGHTS_ROW_HINT} as="span" className="text-muted block text-xs font-normal" />
          </span>
          <ChevronRight size={18} className="text-slate-400" aria-hidden />
        </Link>
        <Link to="/settle" className="flex items-center gap-3 p-4 font-medium transition active:bg-slate-50 dark:active:bg-ink-800">
          <RowTile>
            <RowBalancesIcon size={22} />
          </RowTile>
          <span className="min-w-0 flex-1">
            <span className="block">Balances</span>
            <HintText hint={BALANCES_ROW_HINT} as="span" className="text-muted block text-xs font-normal" />
          </span>
          <ChevronRight size={18} className="text-slate-400" aria-hidden />
        </Link>
        {/* A downloaded new version, still on offer after Later on the banner. */}
        <UpdateRow />
        {/* Shown until the app is installed, on phones and computers that can install it (the banner can be dismissed for good). */}
        <InstallRow className="" testId="profile-install" />
        <Detail min={2}>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="flex w-full items-center gap-3 p-4 text-left font-medium transition active:bg-slate-50 dark:active:bg-ink-800"
            data-testid="profile-support"
          >
            <RowTile>
              <RowSupportIcon size={22} />
            </RowTile>
            <span className="min-w-0 flex-1">
              <span className="block">Support the developer</span>
              <HintText hint={SUPPORT_ROW_HINT} as="span" className="text-muted block text-xs font-normal" />
            </span>
            <ChevronRight size={18} className="text-slate-400" aria-hidden />
          </button>
        </Detail>
      </div>

      <button type="button" className="btn-secondary mt-6 w-full text-rose-700 dark:text-rose-400" onClick={() => setSignOutOpen(true)} data-testid="sign-out">
        <ExitIcon size={18} aria-hidden /> Sign out
      </button>
      <Detail min={2}>
        <p className="mt-6 text-center text-xs font-semibold text-brand-600/80 dark:text-brand-300/80">Spending is wise, splitting is free. Split Now!</p>
      </Detail>
      <p className={`text-muted mb-10 text-center text-xs ${showAll ? 'mt-1' : 'mt-6'}`} data-testid="profile-version">
        <button type="button" onClick={tapVersion} className="min-h-6 px-1">
          Split Now v{semverOf(__APP_VERSION__)}
        </button>
        {repo.mode === 'demo' ? ' · Demo mode' : showBackend ? ' · Connected to Firebase' : ''}
      </p>

      <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />
      <PhotoSheet open={photoOpen} onClose={() => setPhotoOpen(false)} profile={profile} googlePhotoURL={user.googlePhotoURL} />
      <Sheet open={signOutOpen} onClose={() => setSignOutOpen(false)} title="Sign out?">
        <HintText
          className="text-muted text-sm"
          hint={
            repo.mode === 'demo'
              ? { full: 'Your demo data stays on this device.', tier: 'key' }
              : { full: 'Your groups stay in your account. This device’s offline copy is cleared.', tier: 'key' }
          }
        />
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={() => setSignOutOpen(false)}>
            <X size={18} aria-hidden /> Cancel
          </button>
          <button
            type="button"
            className="btn bg-rose-600 text-white"
            onClick={() => {
              setSignOutOpen(false)
              repo.signOut()
            }}
            data-testid="confirm-sign-out"
          >
            <ExitIcon size={18} aria-hidden /> Sign out
          </button>
        </div>
      </Sheet>
    </div>
  )
}

const coarsePointer = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches)

/** Tap the avatar: take / choose a photo (center-cropped to 256×256), use the Google photo, or remove it. */
function PhotoSheet({ open, onClose, profile, googlePhotoURL }: { open: boolean; onClose: () => void; profile: UserProfile; googlePhotoURL?: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const apply = async (patch: Pick<UserProfile, 'photoURL' | 'photoSource'>, msg: string) => {
    try {
      await repo.saveProfile({ ...profile, ...patch })
      toast(msg)
      onClose()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('That isn’t an image', 'err')
    setBusy(true)
    try {
      const jpeg = await squareJpeg(file, 256, 0.85)
      const url = await repo.uploadAvatar(profile.uid, jpeg)
      await apply({ photoURL: url, photoSource: 'upload' }, 'Photo updated')
    } catch (e) {
      toast(errText(e, 'Couldn’t update your photo'), 'err')
    } finally {
      setBusy(false)
      if (pick.current) pick.current.value = ''
      if (camera.current) camera.current.value = ''
    }
  }
  const actions = 1 + (coarsePointer() ? 1 : 0) + (googlePhotoURL && profile.photoURL !== googlePhotoURL ? 1 : 0) + (profile.photoURL ? 1 : 0)
  // One row: the photo on the left, its actions as icon tiles beside it (owner, 24 Oct 2026: icons
  // alone; each keeps its name for screen readers and as a tooltip).
  const tile = 'flex h-14 min-w-11 flex-1 items-center justify-center rounded-2xl bg-slate-100 transition active:scale-95 disabled:opacity-50 dark:bg-ink-800'

  return (
    <Sheet open={open} onClose={onClose} title="Profile photo">
      <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="photo-input" />
      <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="flex items-center gap-4 pt-3">
        {/* four actions on a 320px phone need the photo's room */}
        <Avatar name={profile.displayName || '?'} photoURL={profile.photoURL} color="accent" size={actions > 3 ? 56 : 72} />
        {/* the photo apart from what you can do with it (owner, 23 Oct 2026) */}
        <span aria-hidden className="h-12 w-px shrink-0 bg-slate-200 dark:bg-ink-700" />
        <div className="flex min-w-0 flex-1 gap-2">
          {coarsePointer() && (
            <button
              type="button"
              className={tile}
              disabled={busy}
              onClick={() => camera.current?.click()}
              aria-label="Take photo"
              title="Take photo"
              data-testid="photo-camera"
            >
              <CameraIcon size={24} className="text-brand-600 dark:text-brand-300" aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={tile}
            disabled={busy}
            onClick={() => pick.current?.click()}
            aria-label="Choose photo"
            title="Choose photo"
            data-testid="photo-choose"
          >
            {busy ? <Spinner className="!h-5 !w-5" label="Uploading" /> : <ImageIcon size={24} className="text-brand-600 dark:text-brand-300" aria-hidden />}
          </button>
          {googlePhotoURL && profile.photoURL !== googlePhotoURL && (
            <button
              type="button"
              className={tile}
              disabled={busy}
              onClick={() => apply({ photoURL: googlePhotoURL, photoSource: 'google' }, 'Using your Google photo')}
              aria-label="Use Google photo"
              title="Use Google photo"
              data-testid="photo-google"
            >
              <Avatar name={profile.displayName} photoURL={googlePhotoURL} color="accent" size={26} />
            </button>
          )}
          {profile.photoURL && (
            <button
              type="button"
              className={`${tile} text-rose-700 dark:text-rose-400`}
              disabled={busy}
              onClick={() => apply({ photoURL: undefined, photoSource: 'none' }, 'Photo removed')}
              aria-label="Remove photo"
              title="Remove photo"
              data-testid="photo-remove"
            >
              <TrashIcon size={24} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <HintText hint={PHOTO_HINT} className="text-muted mt-6 text-center text-xs" />
    </Sheet>
  )
}
