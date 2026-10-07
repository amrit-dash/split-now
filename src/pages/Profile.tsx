import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ChevronRight, Download, ImagePlus, LayoutGrid, LogOut, Moon, ShieldCheck, Sun, SunMoon, Trash2, Users, Wallet } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import type { PaymentHandles, UserProfile } from '@/types'
import { CURRENCIES } from '@/lib/money'
import { paymentRegion } from '@/lib/locale'
import { isIfsc, isUpiId } from '@/lib/payments'
import { applyTheme, getTheme, type Theme } from '@/lib/theme'
import { squareJpeg } from '@/lib/image'
import { linksSummary, paymentSummary } from '@/lib/profileSummary'
import { Avatar } from '@/components/Avatar'
import { AccentPicker } from '@/components/AccentPicker'
import { Collapsible } from '@/components/Collapsible'
import { IOSInstallSteps, useInstall } from '@/components/InstallBanner'
import { PageHeader, Segmented } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { Select, currencyOptions } from '@/components/Select'
import { useToast } from '@/components/Toast'
import { AutoCapture } from '@/components/AutoCapture'
import { NotificationSettings } from '@/components/NotificationSettings'

type Handle = { key: keyof PaymentHandles; label: string; placeholder: string; hint?: (v: string) => string | undefined; inputMode?: 'tel' | 'email' | 'text' | 'numeric' }

const H: Record<keyof PaymentHandles, Handle> = {
  upi: { key: 'upi', label: 'UPI ID', placeholder: 'yourname@okaxis', inputMode: 'email', hint: (v) => (isUpiId(v) ? undefined : 'Looks like name@bank (find it in GPay / PhonePe / Paytm → profile)') },
  phone: { key: 'phone', label: 'Phone number for UPI apps', placeholder: '+91 98765 43210', inputMode: 'tel' },
  account: { key: 'account', label: 'Account number', placeholder: '123456789012', inputMode: 'numeric' },
  ifsc: { key: 'ifsc', label: 'IFSC', placeholder: 'HDFC0001234', hint: (v) => (isIfsc(v) ? undefined : '11 characters, like HDFC0001234') },
  payid: { key: 'payid', label: 'PayID (email / mobile / ABN)', placeholder: 'you@example.com or 04xx xxx xxx' },
  bsb: { key: 'bsb', label: 'BSB', placeholder: '062-000' },
  paypal: { key: 'paypal', label: 'PayPal.me username', placeholder: 'yourname' },
  revolut: { key: 'revolut', label: 'Revolut tag', placeholder: '@yourname' },
}

/** Payment handle sections by region (src/lib/locale.ts paymentRegion). */
const SECTIONS: Record<'IN' | 'AU' | 'INTL', Array<{ title: string; keys: Array<keyof PaymentHandles> }>> = {
  IN: [
    { title: 'UPI', keys: ['upi', 'phone'] },
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

export default function Profile() {
  const { profile, user } = useMe()
  const toast = useToast()
  const install = useInstall()
  const [name, setName] = useState(profile.displayName)
  const [currency, setCurrency] = useState(profile.currency)
  const [payment, setPayment] = useState<PaymentHandles>(profile.payment ?? {})
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [iosOpen, setIosOpen] = useState(false)
  const [allHandles, setAllHandles] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)

  // Re-sync the form when the saved fields change (not on a photo change, which would drop unsaved edits).
  const paymentKey = JSON.stringify(profile.payment ?? {})
  useEffect(() => { setName(profile.displayName); setCurrency(profile.currency); setPayment(profile.payment ?? {}) }, [profile.displayName, profile.currency, paymentKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const region = paymentRegion(currency)
  const sections = SECTIONS[region]
  const listed = new Set(sections.flatMap((x) => x.keys))
  // Handles from other regions: shown when filled in, or when asked for.
  const extra = (Object.keys(H) as Array<keyof PaymentHandles>).filter((k) => !listed.has(k) && (allHandles || payment[k]))
  const shownSections = extra.length ? [...sections, { title: 'Other', keys: extra }] : sections

  const canInstall = !install.installed && (install.canPrompt || install.ios)

  const save = async () => {
    await repo.saveProfile({ ...profile, displayName: name.trim() || profile.displayName, currency, payment })
    toast('Profile saved')
  }

  return (
    <div>
      <PageHeader title="Profile" right={
        <button type="button" className="btn-ghost !px-3 !py-2 text-sm !text-rose-600 dark:!text-rose-400" onClick={() => setSignOutOpen(true)} data-testid="sign-out">
          <LogOut size={18} /> Sign out
        </button>
      } />
      <div className="card flex items-center gap-4 p-5">
        <button type="button" className="relative shrink-0 rounded-full" onClick={() => setPhotoOpen(true)} aria-label="Change profile photo" data-testid="profile-photo">
          <Avatar name={name || '?'} photoURL={profile.photoURL} color="accent" size={64} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200 dark:bg-ink-800 dark:text-slate-300 dark:ring-ink-700">
            <Camera size={13} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <input className="w-full bg-transparent text-xl font-bold outline-none" value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
          <div className="truncate text-sm text-slate-500">{profile.email ?? (repo.mode === 'demo' ? 'Demo account (this device only)' : '')}</div>
        </div>
      </div>

      <div className="card mt-3 space-y-4 p-4">
        <div>
          <label className="label">Default currency</label>
          <Select aria-label="Default currency" value={currency} onChange={setCurrency} options={currencyOptions(CURRENCIES)} />
        </div>
        <div>
          <div className="label">Appearance</div>
          <Segmented<Theme> value={theme} onChange={(t) => { setTheme(t); applyTheme(t) }} options={[
            { value: 'system', label: <span className="inline-flex items-center gap-1"><SunMoon size={15} /> Auto</span> },
            { value: 'light', label: <span className="inline-flex items-center gap-1"><Sun size={15} /> Light</span> },
            { value: 'dark', label: <span className="inline-flex items-center gap-1"><Moon size={15} /> Dark</span> },
          ]} />
          <div className="mt-4"><div className="label">Accent colour</div><AccentPicker /></div>
        </div>
      </div>

      {/* Every section below starts collapsed each time Profile opens. */}
      <Collapsible id="payment" testId="section-payment" title="How friends can pay you" icon={<Wallet size={20} />} summary={paymentSummary(payment, region)}>
        <p className="mb-3 text-xs text-slate-500">Shown to people in your groups when they settle up: a UPI QR for the exact amount, app buttons and copy buttons.</p>
        <div className="space-y-4">
          {shownSections.map((sec) => (
            <div key={sec.title} className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{sec.title}</div>
              {sec.keys.map((k) => {
                const h = H[k]
                const v = payment[k] ?? ''
                const hint = v && h.hint?.(v)
                return (
                  <div key={k}>
                    <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor={`pay-${k}`}>{h.label}</label>
                    <input id={`pay-${k}`} className="input" placeholder={h.placeholder} inputMode={h.inputMode} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={v}
                      onChange={(e) => setPayment((p) => ({ ...p, [k]: e.target.value || undefined }))} />
                    {hint && <p className="mt-1 text-xs text-amber-600">{hint}</p>}
                  </div>
                )
              })}
            </div>
          ))}
          {!allHandles && <button className="text-sm font-semibold text-brand-600" onClick={() => setAllHandles(true)}>Show all payment options</button>}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0" /> Only members of groups you’re in can see these. Don’t add details you wouldn’t put on an invoice.</p>
      </Collapsible>

      <NotificationSettings />
      <AutoCapture />

      <Collapsible id="more" testId="section-more" title="More" icon={<LayoutGrid size={20} />} summary={linksSummary(['Friends & balances', canInstall ? 'Install app' : ''])}>
        <div className="-mx-4 -mb-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/5 dark:border-white/5">
          <Link to="/friends" className="flex items-center gap-3 px-4 py-3.5 font-medium">
            <Users size={20} className="text-brand-600 dark:text-brand-300" /> <span className="flex-1">Friends & cross-group balances</span>
            <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
          </Link>
          {canInstall && (
            <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium" onClick={() => (install.canPrompt ? install.prompt() : setIosOpen(true))}>
              <Download size={20} className="text-brand-600 dark:text-brand-300" /> Install app on this device
            </button>
          )}
        </div>
      </Collapsible>

      <button className="btn-primary mt-6 w-full" onClick={save} data-testid="save-profile">Save profile</button>
      <p className="mt-6 text-center text-xs text-slate-400">Split Now v{__APP_VERSION__} · {repo.mode === 'demo' ? 'Demo mode' : 'Connected to Firebase'}</p>

      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title="Add to Home Screen"><IOSInstallSteps /></Sheet>
      <PhotoSheet open={photoOpen} onClose={() => setPhotoOpen(false)} profile={profile} googlePhotoURL={user.googlePhotoURL} />
      <Sheet open={signOutOpen} onClose={() => setSignOutOpen(false)} title="Sign out?">
        <p className="text-sm text-slate-500">
          {repo.mode === 'demo' ? 'Your demo data stays on this device.' : 'Your groups stay in your account. This device’s offline copy is cleared.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => setSignOutOpen(false)}>Cancel</button>
          <button className="btn bg-rose-600 text-white" onClick={() => { setSignOutOpen(false); repo.signOut() }} data-testid="confirm-sign-out"><LogOut size={18} /> Sign out</button>
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
    await repo.saveProfile({ ...profile, ...patch })
    toast(msg)
    onClose()
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
      toast((e as Error).message || 'Couldn’t update your photo', 'err')
    } finally {
      setBusy(false)
      if (pick.current) pick.current.value = ''
      if (camera.current) camera.current.value = ''
    }
  }
  const row = 'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-medium hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-ink-800'

  return (
    <Sheet open={open} onClose={onClose} title="Profile photo">
      <div className="mb-3 flex justify-center"><Avatar name={profile.displayName || '?'} photoURL={profile.photoURL} color="accent" size={96} /></div>
      <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="photo-input" />
      <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="space-y-1">
        {coarsePointer() && (
          <button className={row} disabled={busy} onClick={() => camera.current?.click()}><Camera size={20} className="text-brand-600 dark:text-brand-300" /> Take photo</button>
        )}
        <button className={row} disabled={busy} onClick={() => pick.current?.click()}><ImagePlus size={20} className="text-brand-600 dark:text-brand-300" /> {busy ? 'Uploading…' : 'Choose photo'}</button>
        {googlePhotoURL && profile.photoURL !== googlePhotoURL && (
          <button className={row} disabled={busy} onClick={() => apply({ photoURL: googlePhotoURL, photoSource: 'google' }, 'Using your Google photo')}>
            <Avatar name={profile.displayName} photoURL={googlePhotoURL} color="accent" size={20} /> Use Google photo
          </button>
        )}
        {profile.photoURL && (
          <button className={`${row} text-rose-600 dark:text-rose-400`} disabled={busy} onClick={() => apply({ photoURL: undefined, photoSource: 'none' }, 'Photo removed')}>
            <Trash2 size={20} /> Remove photo
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">Your photo is shown to people in your groups.</p>
    </Sheet>
  )
}
