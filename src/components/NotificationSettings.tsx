import { useEffect, useState } from 'react'
import { Bell, BellOff, Share } from 'lucide-react'
import { Link } from 'react-router-dom'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { errText } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import {
  DEFAULT_ALL_PREFS, VAPID_KEY, disablePush, enablePush, isIOS, isStandalone, permission, pushSupported, savePrefs, watchPrefs,
  type AllPrefs, type NotificationPrefs,
} from '@/lib/push'
import { Switch } from './Switch'
import { useToast } from './Toast'

type TypeKey = Exclude<keyof NotificationPrefs, 'outsideTrips'>

/** The notification types, with an example in the user's own currency. */
function types(currency: string): Array<{ key: TypeKey; label: string; hint: string }> {
  return [
    { key: 'captures', label: 'Payments on a trip', hint: `“You spent ${formatMoney(84000, currency)} at Swiggy — add to Goa trip?” from forwarded bank SMS.` },
    { key: 'unsorted', label: 'Payments outside a trip', hint: 'Also tell you about captured payments that match no trip.' },
    { key: 'expenses', label: 'New expenses', hint: 'When someone adds an expense that includes you.' },
    { key: 'settlements', label: 'Someone pays you back', hint: 'When someone records a payment to you.' },
    { key: 'reminders', label: 'Settle-up reminders', hint: 'A gentle weekly nudge when you’ve owed someone for a week.' },
  ]
}

/** Whether this build can show the Notifications settings at all (push needs Firebase and a VAPID key). */
export const notificationsAvailable = () => repo.mode === 'firebase' && !!VAPID_KEY

/**
 * Settings → Notifications: turn on push for this device and choose which notifications to get.
 * Renders nothing without a VAPID key (the page explains instead).
 */
export function NotificationSettings() {
  const { user, profile } = useMe()
  const toast = useToast()
  const [perm, setPerm] = useState(permission())
  const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_ALL_PREFS)
  const [busy, setBusy] = useState(false)

  useEffect(() => (notificationsAvailable() ? watchPrefs(user.uid, setPrefs) : undefined), [user.uid])

  if (!notificationsAvailable()) return null

  const iosNeedsInstall = isIOS() && !isStandalone()
  const supported = pushSupported()

  const turnOn = async () => {
    setBusy(true)
    try {
      const p = await enablePush(user.uid)
      setPerm(p)
      toast(p === 'granted' ? 'Notifications are on for this device' : 'Notifications were not allowed', p === 'granted' ? 'ok' : 'err')
    } catch (e) {
      toast(errText(e), 'err')
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
  const toggle = (k: TypeKey, v: boolean) => {
    setPrefs({ ...prefs, [k]: v })
    savePrefs(user.uid, { [k]: v }).catch((e) => toast(errText(e), 'err'))
  }
  // Capture notifications depend on Settings → Automation: nothing outside trips is stored
  // unless "All bank & UPI payments" is chosen, and nothing at all while capture is paused.
  const blocked = (k: TypeKey): string | undefined =>
    (k === 'captures' || k === 'unsorted') && prefs.capturePaused ? 'Auto-capture is paused.'
      : k === 'unsorted' && !prefs.outsideTrips ? 'Only trip payments are captured. Choose “All bank & UPI payments” in Automation to use this.'
        : undefined

  return (
    <div data-testid="notification-settings">
      <div className="card p-4">
        {iosNeedsInstall ? (
          <p className="text-muted flex items-start gap-1.5 text-sm">
            <Share size={15} className="mt-0.5 shrink-0" aria-hidden />
            On iPhone, notifications need iOS 16.4 or later and the app installed: tap Share → Add to Home Screen, then open it from your home screen and come back here.
          </p>
        ) : !supported ? (
          <p className="text-muted text-sm">This browser can’t receive push notifications.</p>
        ) : perm === 'granted' ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted text-sm">On for this device.</p>
            <button type="button" className="btn-ghost btn-sm !px-2" onClick={turnOff} disabled={busy}><BellOff size={16} aria-hidden /> Turn off here</button>
          </div>
        ) : perm === 'denied' ? (
          <p className="text-muted text-sm">Notifications are blocked for this site. Allow them in your browser or system settings, then reload.</p>
        ) : (
          <>
            <p className="text-muted text-sm">Get a ping when a trip payment is captured, someone adds an expense with you, or pays you back.</p>
            <button type="button" className="btn-primary mt-3 w-full" onClick={turnOn} disabled={busy}><Bell size={18} aria-hidden /> Turn on notifications</button>
          </>
        )}
      </div>

      <h2 className="mb-2 mt-5 px-1 font-bold">What to tell you about</h2>
      <div className="space-y-2">
        {types(profile.currency).map((t) => {
          const why = blocked(t.key)
          const id = `notif-${t.key}-label`
          return (
            <div key={t.key} className={`card flex items-center justify-between gap-4 p-3 ${why ? 'opacity-60' : ''}`} data-testid={`notif-${t.key}`}>
              <div className="min-w-0">
                <div id={id} className="text-sm font-semibold">{t.label}</div>
                <div className="text-muted text-xs">{why ?? t.hint}</div>
              </div>
              <Switch checked={prefs[t.key] && !why} disabled={!!why} onChange={(v) => toggle(t.key, v)} label={t.label} testId={`notif-${t.key}-switch`} />
            </div>
          )
        })}
      </div>
      <p className="text-muted mt-3 px-1 text-xs">These choices apply to all your devices. Capture settings live in <Link to="/settings/automation" className="font-semibold text-brand-600 dark:text-brand-300">Automation</Link>.</p>
    </div>
  )
}
