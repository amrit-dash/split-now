import { useEffect, useState } from 'react'
import { Bell, BellOff, Share } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import {
  DEFAULT_PREFS, VAPID_KEY, disablePush, enablePush, isIOS, isStandalone, permission, pushSupported, savePrefs, watchPrefs,
  type NotificationPrefs,
} from '@/lib/push'
import { useToast } from './Toast'

const TYPES: Array<{ key: keyof NotificationPrefs; label: string; hint: string }> = [
  { key: 'captures', label: 'Payments on a trip', hint: '“You spent ₹840 at Swiggy — add to Goa Trip?” from forwarded bank SMS.' },
  { key: 'unsorted', label: 'Payments outside a trip', hint: 'Also ask about captured payments that match no trip dates.' },
  { key: 'expenses', label: 'New expenses', hint: 'When someone adds an expense that includes you.' },
  { key: 'settlements', label: 'Payments to me', hint: 'When someone records paying you back.' },
  { key: 'reminders', label: 'Settle-up reminders', hint: 'A gentle weekly nudge if you’ve owed over ₹500 for a week.' },
]

/** Profile section: turn on push for this device and choose which notifications to get. Hidden without a VAPID key. */
export function NotificationSettings() {
  const { user } = useMe()
  const toast = useToast()
  const [perm, setPerm] = useState(permission())
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [busy, setBusy] = useState(false)

  useEffect(() => (repo.mode === 'firebase' && VAPID_KEY ? watchPrefs(user.uid, setPrefs) : undefined), [user.uid])

  if (repo.mode !== 'firebase' || !VAPID_KEY) return null

  const iosNeedsInstall = isIOS() && !isStandalone()
  const supported = pushSupported()

  const turnOn = async () => {
    setBusy(true)
    try {
      const p = await enablePush(user.uid)
      setPerm(p)
      toast(p === 'granted' ? 'Notifications are on for this device' : 'Notifications were not allowed', p === 'granted' ? 'ok' : 'err')
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }
  const turnOff = async () => {
    setBusy(true)
    await disablePush(user.uid)
    setBusy(false)
    toast('This device won’t get notifications')
    setPerm('default')
  }
  const toggle = (k: keyof NotificationPrefs, v: boolean) => {
    const next = { ...prefs, [k]: v }
    setPrefs(next)
    savePrefs(user.uid, next).catch((e) => toast((e as Error).message, 'err'))
  }

  return (
    <div id="notifications" className="card mt-4 p-4">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-brand-600 dark:text-brand-300" />
        <div className="label !mb-0">Notifications</div>
      </div>

      {iosNeedsInstall ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-500">
          <Share size={15} className="mt-0.5 shrink-0" />
          On iPhone, notifications need iOS 16.4 or later and the app installed: tap Share → Add to Home Screen, then open it from your home screen and come back here.
        </p>
      ) : !supported ? (
        <p className="mt-2 text-sm text-slate-500">This browser can’t receive push notifications.</p>
      ) : perm === 'granted' ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">On for this device.</p>
          <button className="btn-ghost !px-2 text-sm" onClick={turnOff} disabled={busy}><BellOff size={16} /> Turn off here</button>
        </div>
      ) : perm === 'denied' ? (
        <p className="mt-2 text-sm text-slate-500">Notifications are blocked for this site. Allow them in your browser or system settings, then reload.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-500">Get a ping when a trip payment is captured, someone adds an expense with you, or pays you back.</p>
          <button className="btn-primary mt-3 w-full" onClick={turnOn} disabled={busy}><Bell size={18} /> Turn on notifications</button>
        </>
      )}

      <div className="mt-3 space-y-2">
        {TYPES.map((t) => (
          <label key={t.key} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
            <div>
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-xs text-slate-500">{t.hint}</div>
            </div>
            <input type="checkbox" className="h-6 w-11 shrink-0 accent-brand-600" checked={prefs[t.key]} onChange={(e) => toggle(t.key, e.target.checked)} />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">These choices apply to all your devices.</p>
    </div>
  )
}
