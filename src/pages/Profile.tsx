import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, LogOut, Moon, ShieldCheck, Sun, SunMoon, Users } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import type { PaymentHandles } from '@/types'
import { CURRENCIES } from '@/lib/money'
import { applyTheme, getTheme, type Theme } from '@/lib/theme'
import { Avatar } from '@/components/Avatar'
import { IOSInstallSteps, useInstall } from '@/components/InstallBanner'
import { PageHeader, Segmented } from '@/components/Misc'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'

const HANDLES: Array<{ key: keyof PaymentHandles; label: string; placeholder: string }> = [
  { key: 'payid', label: 'PayID (email / mobile / ABN)', placeholder: 'you@example.com or 04xx xxx xxx' },
  { key: 'bsb', label: 'BSB', placeholder: '062-000' },
  { key: 'account', label: 'Account number', placeholder: '12345678' },
  { key: 'paypal', label: 'PayPal.me username', placeholder: 'yourname' },
  { key: 'upi', label: 'UPI ID', placeholder: 'name@okbank' },
  { key: 'revolut', label: 'Revolut tag', placeholder: '@yourname' },
]

export default function Profile() {
  const { profile } = useMe()
  const toast = useToast()
  const install = useInstall()
  const [name, setName] = useState(profile.displayName)
  const [currency, setCurrency] = useState(profile.currency)
  const [payment, setPayment] = useState<PaymentHandles>(profile.payment ?? {})
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [iosOpen, setIosOpen] = useState(false)

  useEffect(() => { setName(profile.displayName); setCurrency(profile.currency); setPayment(profile.payment ?? {}) }, [profile])

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
        <p className="mb-3 text-xs text-slate-500">Shown to people in your groups when they settle up, with copy buttons and app links.</p>
        <div className="space-y-3">
          {HANDLES.map((h) => (
            <div key={h.key}>
              <label className="mb-1 block text-xs font-medium text-slate-500">{h.label}</label>
              <input className="input" placeholder={h.placeholder} value={payment[h.key] ?? ''} onChange={(e) => setPayment((p) => ({ ...p, [h.key]: e.target.value || undefined }))} />
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0" /> Only people signed in to Split It can read these, and only if they know your account. Don’t add details you wouldn’t put on an invoice.</p>
      </div>

      <button className="btn-primary mt-4 w-full" onClick={save}>Save profile</button>

      <div className="card mt-4 divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
        <Link to="/friends" className="flex items-center gap-3 px-4 py-3.5 font-medium"><Users size={20} className="text-brand-600" /> Friends & cross-group balances</Link>
        {!install.installed && (install.canPrompt || install.ios) && (
          <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium" onClick={() => (install.canPrompt ? install.prompt() : setIosOpen(true))}>
            <Download size={20} className="text-brand-600" /> Install app on this device
          </button>
        )}
        <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium text-rose-600" onClick={() => repo.signOut()}><LogOut size={20} /> Sign out</button>
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">Split It v{__APP_VERSION__} · {repo.mode === 'demo' ? 'Demo mode' : 'Connected to Firebase'}</p>

      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title="Add to Home Screen"><IOSInstallSteps /></Sheet>
    </div>
  )
}
