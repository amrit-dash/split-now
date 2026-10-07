import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, LogOut, Moon, ShieldCheck, Sun, SunMoon, Users } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import type { PaymentHandles } from '@/types'
import { CURRENCIES } from '@/lib/money'
import { paymentRegion } from '@/lib/locale'
import { isIfsc, isUpiId } from '@/lib/payments'
import { applyTheme, getTheme, type Theme } from '@/lib/theme'
import { Avatar } from '@/components/Avatar'
import { IOSInstallSteps, useInstall } from '@/components/InstallBanner'
import { PageHeader, Segmented } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
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
  const { profile } = useMe()
  const toast = useToast()
  const install = useInstall()
  const [name, setName] = useState(profile.displayName)
  const [currency, setCurrency] = useState(profile.currency)
  const [payment, setPayment] = useState<PaymentHandles>(profile.payment ?? {})
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [iosOpen, setIosOpen] = useState(false)
  const [allHandles, setAllHandles] = useState(false)

  useEffect(() => { setName(profile.displayName); setCurrency(profile.currency); setPayment(profile.payment ?? {}) }, [profile])

  const region = paymentRegion(currency)
  const sections = SECTIONS[region]
  const listed = new Set(sections.flatMap((x) => x.keys))
  // Handles from other regions: shown when filled in, or when asked for.
  const extra = (Object.keys(H) as Array<keyof PaymentHandles>).filter((k) => !listed.has(k) && (allHandles || payment[k]))
  const shownSections = extra.length ? [...sections, { title: 'Other', keys: extra }] : sections

  const save = async () => {
    await repo.saveProfile({ ...profile, displayName: name.trim() || profile.displayName, currency, payment })
    toast('Profile saved')
  }

  return (
    <div>
      <PageHeader title="Profile" />
      <div className="card flex items-center gap-4 p-5">
        <Avatar name={name || '?'} color="#7c3aed" size={64} />
        <div className="min-w-0 flex-1">
          <input className="w-full bg-transparent text-xl font-bold outline-none" value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
          <div className="truncate text-sm text-slate-500">{profile.email ?? (repo.mode === 'demo' ? 'Demo account (this device only)' : '')}</div>
        </div>
      </div>

      <div className="card mt-3 space-y-4 p-4">
        <div>
          <label className="label">Default currency</label>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div>
          <div className="label">Appearance</div>
          <Segmented<Theme> value={theme} onChange={(t) => { setTheme(t); applyTheme(t) }} options={[
            { value: 'system', label: <span className="inline-flex items-center gap-1"><SunMoon size={15} /> Auto</span> },
            { value: 'light', label: <span className="inline-flex items-center gap-1"><Sun size={15} /> Light</span> },
            { value: 'dark', label: <span className="inline-flex items-center gap-1"><Moon size={15} /> Dark</span> },
          ]} />
        </div>
      </div>

      <div className="card mt-3 p-4">
        <div className="label">How friends can pay you</div>
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
      </div>

      <button className="btn-primary mt-4 w-full" onClick={save}>Save profile</button>

      <AutoCapture />
      <NotificationSettings />

      <div className="card mt-4 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Link to="/friends" className="flex items-center gap-3 px-4 py-3.5 font-medium"><Users size={20} className="text-brand-600" /> Friends & cross-group balances</Link>
        {!install.installed && (install.canPrompt || install.ios) && (
          <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium" onClick={() => (install.canPrompt ? install.prompt() : setIosOpen(true))}>
            <Download size={20} className="text-brand-600" /> Install app on this device
          </button>
        )}
        <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium text-rose-600" onClick={() => repo.signOut()}><LogOut size={20} /> Sign out</button>
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">Split Now v{__APP_VERSION__} · {repo.mode === 'demo' ? 'Demo mode' : 'Connected to Firebase'}</p>

      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title="Add to Home Screen"><IOSInstallSteps /></Sheet>
    </div>
  )
}
