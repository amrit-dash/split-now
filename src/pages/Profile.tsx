import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ChevronRight, Download, ImagePlus, LogOut, Moon, Palette, Save, ShieldCheck, Sparkles, Sun, SunMoon, Trash2, Users, Wallet, X } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import type { PaymentHandles, UserProfile } from '@/types'
import { CURRENCIES } from '@/lib/money'
import { paymentRegion } from '@/lib/locale'
import { isIfsc, isUpiId } from '@/lib/payments'
import { applyTheme, getTheme, type Theme } from '@/lib/theme'
import { squareJpeg } from '@/lib/image'
import { paymentSummary } from '@/lib/profileSummary'
import { Avatar } from '@/components/Avatar'
import { AccentPicker } from '@/components/AccentPicker'
import { Collapsible } from '@/components/Collapsible'
import { IOSInstallSteps, useInstall } from '@/components/InstallBanner'
import { PageHeader, Segmented } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { Select, currencyOptions } from '@/components/Select'
import { useToast } from '@/components/Toast'
import { accentPreset, getAccent, getDuo } from '@/lib/accent'
import { AccountCard, RatesField } from '@/components/ProfileCards'
import { AiSettings } from '@/components/AiSettings'
import { AdminAi } from '@/components/AdminAi'
import type { AiStatusResult } from '@/data/repo'
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

const THEME_LABEL: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' }

export default function Profile() {
  const { profile, user } = useMe()
  const toast = useToast()
  const install = useInstall()
  const [aiStatus, setAiStatus] = useState<AiStatusResult | null>(null)
  const [name, setName] = useState(profile.displayName)
  const [phone, setPhone] = useState(profile.phone ?? '')
  // The mobile number also fills "Phone number for UPI apps" while that field is empty or still
  // mirrors the previous mobile number (a UPI number typed separately is left alone).
  const onPhone = (v: string) => {
    setPayment((p) => (!p.phone || p.phone === phone ? { ...p, phone: v || undefined } : p))
    setPhone(v)
  }
  const [currency, setCurrency] = useState(profile.currency)
  const [payment, setPayment] = useState<PaymentHandles>(profile.payment ?? {})
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [, setLook] = useState(0) // re-render the Appearance summary after accent changes
  const [iosOpen, setIosOpen] = useState(false)
  const [allHandles, setAllHandles] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)

  // Re-sync the form when the saved fields change (not on a photo change, which would drop unsaved edits).
  const paymentKey = JSON.stringify(profile.payment ?? {})
  useEffect(() => { setName(profile.displayName); setPhone(profile.phone ?? ''); setCurrency(profile.currency); setPayment(profile.payment ?? {}) }, [profile.displayName, profile.phone, profile.currency, paymentKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const region = paymentRegion(currency)
  const sections = SECTIONS[region]
  const listed = new Set(sections.flatMap((x) => x.keys))
  // Handles from other regions: shown when filled in, or when asked for.
  const extra = (Object.keys(H) as Array<keyof PaymentHandles>).filter((k) => !listed.has(k) && (allHandles || payment[k]))
  const shownSections = extra.length ? [...sections, { title: 'Other', keys: extra }] : sections

  const canInstall = !install.installed && (install.canPrompt || install.ios)

  // Edits not saved yet: keep a Save bar in view so they aren't lost by navigating away.
  const handles = (h: PaymentHandles | undefined) => JSON.stringify(Object.entries(h ?? {}).filter(([, v]) => v?.trim()).sort(([a], [b]) => a.localeCompare(b)))
  const dirty = (name.trim() || profile.displayName) !== profile.displayName
    || phone.replace(/[^\d+]/g, '') !== (profile.phone ?? '').replace(/[^\d+]/g, '')
    || currency !== profile.currency
    || handles(payment) !== handles(profile.payment)
  const [saving, setSaving] = useState(false)
  const discard = () => { setName(profile.displayName); setPhone(profile.phone ?? ''); setCurrency(profile.currency); setPayment(profile.payment ?? {}) }

  const save = async () => {
    const cleanPhone = phone.replace(/[^\d+]/g, '')
    // A new mobile number also fills the UPI phone field if that's empty.
    const pay = cleanPhone && !payment.phone ? { ...payment, phone: cleanPhone } : payment
    setSaving(true)
    try {
      await repo.saveProfile({ ...profile, displayName: name.trim() || profile.displayName, phone: cleanPhone || undefined, currency, payment: pay })
      toast('Profile saved')
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Profile" right={
        <button type="button" className="btn-ghost !px-3 !py-2 text-sm !text-rose-600 dark:!text-rose-400" onClick={() => setSignOutOpen(true)} data-testid="sign-out">
          <LogOut size={18} /> Sign out
        </button>
      } />
      <AccountCard
        name={name} setName={setName} phone={phone} setPhone={onPhone}
        photoURL={profile.photoURL} email={profile.email} onPhoto={() => setPhotoOpen(true)}
        currencyField={(
          <RatesField base={currency}>
            <Select aria-label="Default currency" value={currency} onChange={setCurrency} options={currencyOptions(CURRENCIES)} />
          </RatesField>
        )}
      />

      <Collapsible id="appearance" testId="section-appearance" title="Appearance" icon={<Palette size={20} />} summary={`${THEME_LABEL[theme]} · ${accentPreset(getAccent()).label}${getDuo() ? ' · Dual tone' : ''}`}>
        <div className="space-y-4">
          <Segmented<Theme> value={theme} onChange={(t) => { setTheme(t); applyTheme(t) }} options={[
            { value: 'system', label: <span className="inline-flex items-center gap-1"><SunMoon size={15} /> Auto</span> },
            { value: 'light', label: <span className="inline-flex items-center gap-1"><Sun size={15} /> Light</span> },
            { value: 'dark', label: <span className="inline-flex items-center gap-1"><Moon size={15} /> Dark</span> },
          ]} />
          <AccentPicker onChange={() => setLook((n) => n + 1)} />
        </div>
      </Collapsible>

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
      {repo.mode === 'firebase' && (
        <Collapsible id="ai" testId="section-ai" title="AI features" icon={<Sparkles size={20} />} summary="Gemini reads bills, statements and hard-to-read SMS">
          <AiSettings onStatus={setAiStatus} />
        </Collapsible>
      )}
      {aiStatus?.admin && (
        <Collapsible id="ai-admin" testId="section-ai-admin" title="Admin · AI features" icon={<ShieldCheck size={20} />} summary="Split Now’s Gemini key: access, model, limits">
          <AdminAi status={aiStatus} />
        </Collapsible>
      )}

      <Link to="/friends" className="card mt-3 flex items-center gap-3 p-4 font-medium transition active:scale-[0.99]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"><Users size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block">Friends &amp; balances</span>
          <span className="block text-xs font-normal text-slate-500">One balance per person, across every group</span>
        </span>
        <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
      </Link>
      {canInstall && (
        <button className="card mt-3 flex w-full items-center gap-3 p-4 text-left font-medium transition active:scale-[0.99]" onClick={() => (install.canPrompt ? install.prompt() : setIosOpen(true))}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"><Download size={19} /></span>
          <span className="flex-1">Install app on this device</span>
          <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
        </button>
      )}

      <button className="btn-primary mt-6 w-full" onClick={save} disabled={saving} data-testid="save-profile"><Save size={18} aria-hidden /> Save profile</button>
      {dirty && <div className="h-14" aria-hidden />}
      {dirty && (
        <div className="animate-pop fixed inset-x-0 bottom-[calc(var(--nav-h)+2rem)] z-30 mx-auto max-w-2xl px-4" data-testid="unsaved-bar">
          <div className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-4 shadow-xl shadow-black/15 ring-1 ring-slate-900/10 dark:bg-ink-800 dark:ring-white/10">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">Unsaved changes</span>
            <button className="btn-ghost !min-h-0 shrink-0 !px-3 !py-2 text-sm" onClick={discard}>Discard</button>
            <button className="btn-primary !min-h-0 shrink-0 !px-4 !py-2 text-sm" onClick={save} disabled={saving}><Save size={16} aria-hidden /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
      <p className="mt-6 text-center text-xs text-slate-400">Split Now v{__APP_VERSION__} · {repo.mode === 'demo' ? 'Demo mode' : 'Connected to Firebase'}</p>

      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title="Add to Home Screen"><IOSInstallSteps /></Sheet>
      <PhotoSheet open={photoOpen} onClose={() => setPhotoOpen(false)} profile={profile} googlePhotoURL={user.googlePhotoURL} />
      <Sheet open={signOutOpen} onClose={() => setSignOutOpen(false)} title="Sign out?">
        <p className="text-sm text-slate-500">
          {repo.mode === 'demo' ? 'Your demo data stays on this device.' : 'Your groups stay in your account. This device’s offline copy is cleared.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => setSignOutOpen(false)}><X size={18} aria-hidden /> Cancel</button>
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
