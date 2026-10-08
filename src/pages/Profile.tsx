import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Camera, ChevronRight, ImagePlus, LogOut, Settings as SettingsIcon, ShieldCheck, Trash2, Users, Wallet, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import type { PaymentHandles, UserProfile } from '@/types'
import { usePageTitle } from '@/lib/brand'
import { errText } from '@/lib/errors'
import { paymentRegion } from '@/lib/locale'
import { isIfsc, isUpiId } from '@/lib/payments'
import { squareJpeg } from '@/lib/image'
import { paymentSummary } from '@/lib/profileSummary'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { PageHeader } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { AccountCard } from '@/components/ProfileCards'
import { SavedPill, useSavedFlash } from './settings/common'

type Handle = { key: keyof PaymentHandles; label: string; placeholder: string; hint?: (v: string) => string | undefined; inputMode?: 'tel' | 'email' | 'text' | 'numeric' }

const H: Record<Exclude<keyof PaymentHandles, 'phone'>, Handle> = {
  upi: { key: 'upi', label: 'UPI ID', placeholder: 'yourname@okaxis', inputMode: 'email', hint: (v) => (isUpiId(v) ? undefined : 'Looks like name@bank (find it in GPay / PhonePe / Paytm → profile)') },
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
  INTL: [
    { title: 'International', keys: ['paypal', 'revolut'] },
  ],
}

/** Old deep links into Profile sections now live under Settings. */
const HASH_ROUTES: Record<string, string> = {
  '#auto-capture': '/settings/automation',
  '#ai': '/settings/ai',
  '#ai-admin': '/settings/admin',
  '#notifications': '/settings/notifications',
  '#appearance': '/settings/preferences',
}

const cleanPhone = (v: string) => v.replace(/[^\d+]/g, '')
const handlesKey = (h: PaymentHandles | undefined) => JSON.stringify(Object.entries(h ?? {}).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v!.trim()]).sort(([a], [b]) => a.localeCompare(b)))

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
  useEffect(() => { const to = HASH_ROUTES[loc.hash]; if (to) nav(to, { replace: true }) }, [loc.hash, nav])

  const [name, setName] = useState(profile.displayName)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [payment, setPayment] = useState<PaymentHandles>(profile.payment ?? {})
  const [allHandles, setAllHandles] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [saved, flash] = useSavedFlash()

  // Re-sync the form when the saved fields change (not on a photo change, which would drop unsaved edits).
  const paymentKey = handlesKey(profile.payment)
  useEffect(() => { setName(profile.displayName); setPhone(profile.phone ?? ''); setPayment(profile.payment ?? {}) }, [profile.displayName, profile.phone, paymentKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const dirty = (name.trim() || profile.displayName) !== profile.displayName || cleanPhone(phone) !== (profile.phone ?? '') || handlesKey(payment) !== paymentKey
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => { void commit() }, 800)
    return () => clearTimeout(t)
  }, [dirty, name, phone, payment, commit])
  useEffect(() => () => { void commit() }, [commit])

  const region = paymentRegion(profile.currency)
  const sections = SECTIONS[region]
  const listed = new Set(sections.flatMap((x) => x.keys))
  // Handles from other regions: shown when filled in, or when asked for.
  const extra = (Object.keys(H) as HandleKey[]).filter((k) => !listed.has(k) && (allHandles || payment[k]))
  const shownSections = extra.length ? [...sections, { title: 'Other', keys: extra }] : sections

  return (
    <div>
      <PageHeader title="Profile" right={
        <div className="flex items-center gap-2">
          <SavedPill on={saved} />
          <Link to="/settings" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-ink-800" aria-label="Settings" data-testid="open-settings"><SettingsIcon size={22} /></Link>
        </div>
      } />
      <AccountCard
        name={name} setName={setName} phone={phone} setPhone={onPhone} onBlur={() => { void commit() }}
        photoURL={profile.photoURL} email={profile.email} onPhoto={() => setPhotoOpen(true)}
        phoneHint={region === 'IN' && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Friends can pay this number with UPI</div>
              <div className="text-muted text-xs">{upiPhoneOn ? `Shown as a UPI number${payment.phone && payment.phone !== cleanPhone(phone) ? ` (${payment.phone})` : ''}` : 'Off: only your UPI ID is shared'}</div>
            </div>
            <Switch checked={upiPhoneOn} onChange={setUpiPhone} label="Friends can pay this number with UPI" testId="upi-phone-switch" disabled={!cleanPhone(phone) && !upiPhoneOn} />
          </div>
        )}
      />

      <Collapsible id="payment" testId="section-payment" title="How friends can pay you" icon={<Wallet size={20} />} summary={paymentSummary(payment, region)}>
        <p className="text-muted mb-3 text-xs">Shown to people in your groups when they settle up: a UPI QR for the exact amount, app buttons and copy buttons.</p>
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
                    <label className="text-muted mb-1 block text-xs font-medium" htmlFor={`pay-${k}`}>{h.label}</label>
                    <input id={`pay-${k}`} className="input" placeholder={h.placeholder} inputMode={h.inputMode} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={v}
                      onChange={(e) => setPayment((p) => ({ ...p, [k]: e.target.value || undefined }))} onBlur={() => { void commit() }} />
                    {hint && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{hint}</p>}
                  </div>
                )
              })}
            </div>
          ))}
          {!allHandles && <button type="button" className="min-h-9 text-sm font-semibold text-brand-600 dark:text-brand-300" onClick={() => setAllHandles(true)}>Show all payment options</button>}
        </div>
        <p className="text-muted mt-3 flex items-start gap-1.5 text-xs"><ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden /> Only members of groups you’re in can see these. Don’t add details you wouldn’t put on an invoice.</p>
      </Collapsible>

      <div className="card mt-3 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Link to="/settings" className="flex items-center gap-3 p-4 font-medium transition active:bg-slate-50 dark:active:bg-ink-800" data-testid="profile-settings">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300" aria-hidden><SettingsIcon size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block">Settings</span>
            <span className="text-muted block text-xs font-normal">Currency, theme, notifications, auto-capture, AI, data</span>
          </span>
          <ChevronRight size={18} className="text-slate-400" aria-hidden />
        </Link>
        <Link to="/friends" className="flex items-center gap-3 p-4 font-medium transition active:bg-slate-50 dark:active:bg-ink-800">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300" aria-hidden><Users size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block">Friends &amp; balances</span>
            <span className="text-muted block text-xs font-normal">One balance per person, across every group</span>
          </span>
          <ChevronRight size={18} className="text-slate-400" aria-hidden />
        </Link>
      </div>

      <button type="button" className="btn-secondary mt-6 w-full text-rose-700 dark:text-rose-400" onClick={() => setSignOutOpen(true)} data-testid="sign-out">
        <LogOut size={18} aria-hidden /> Sign out
      </button>

      <PhotoSheet open={photoOpen} onClose={() => setPhotoOpen(false)} profile={profile} googlePhotoURL={user.googlePhotoURL} />
      <Sheet open={signOutOpen} onClose={() => setSignOutOpen(false)} title="Sign out?">
        <p className="text-muted text-sm">
          {repo.mode === 'demo' ? 'Your demo data stays on this device.' : 'Your groups stay in your account. This device’s offline copy is cleared.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={() => setSignOutOpen(false)}><X size={18} aria-hidden /> Cancel</button>
          <button type="button" className="btn bg-rose-600 text-white" onClick={() => { setSignOutOpen(false); repo.signOut() }} data-testid="confirm-sign-out"><LogOut size={18} aria-hidden /> Sign out</button>
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
  const row = 'flex w-full min-h-11 items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-ink-800'

  return (
    <Sheet open={open} onClose={onClose} title="Profile photo">
      <div className="mb-3 flex justify-center"><Avatar name={profile.displayName || '?'} photoURL={profile.photoURL} color="accent" size={96} /></div>
      <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="photo-input" />
      <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="space-y-1">
        {coarsePointer() && (
          <button type="button" className={row} disabled={busy} onClick={() => camera.current?.click()}><Camera size={20} className="text-brand-600 dark:text-brand-300" aria-hidden /> Take photo</button>
        )}
        <button type="button" className={row} disabled={busy} onClick={() => pick.current?.click()}><ImagePlus size={20} className="text-brand-600 dark:text-brand-300" aria-hidden /> {busy ? 'Uploading…' : 'Choose photo'}</button>
        {googlePhotoURL && profile.photoURL !== googlePhotoURL && (
          <button type="button" className={row} disabled={busy} onClick={() => apply({ photoURL: googlePhotoURL, photoSource: 'google' }, 'Using your Google photo')}>
            <Avatar name={profile.displayName} photoURL={googlePhotoURL} color="accent" size={20} /> Use Google photo
          </button>
        )}
        {profile.photoURL && (
          <button type="button" className={`${row} text-rose-700 dark:text-rose-400`} disabled={busy} onClick={() => apply({ photoURL: undefined, photoSource: 'none' }, 'Photo removed')}>
            <Trash2 size={20} aria-hidden /> Remove photo
          </button>
        )}
      </div>
      <p className="text-muted mt-3 text-xs">Your photo is shown to people in your groups.</p>
    </Sheet>
  )
}
