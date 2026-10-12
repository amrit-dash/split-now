import { useEffect, useState } from 'react'
import { Bell, BellOff, Share } from 'lucide-react'
import { Link } from 'react-router-dom'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useCaptureTokens } from '@/hooks/data'
import { errText } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import {
  DEFAULT_ALL_PREFS,
  IOS_INSTALL_FOR_PUSH,
  VAPID_KEY,
  disablePush,
  enablePush,
  isIOS,
  isStandalone,
  permission,
  pushSupported,
  savePrefs,
  watchPrefs,
  type AllPrefs,
  type NotificationPrefs,
} from '@/lib/push'
import { HintText, InfoTip, useShows, type Hint } from './Hint'
import { Switch } from './Switch'
import { useToast } from './Toast'

type TypeKey = Exclude<keyof NotificationPrefs, 'outsideTrips'>

/** The notification types, with an example in the user's own currency. */
function types(currency: string): Array<{ key: TypeKey; label: string; hint: Hint }> {
  return [
    {
      key: 'captures',
      label: 'Payments on a trip',
      hint: {
        full: `“You spent ${formatMoney(84000, currency)} at Swiggy — add to Goa trip?” from forwarded bank SMS.`,
        short: 'Captured payments that match a trip',
        tier: 'help',
      },
    },
    {
      key: 'unsorted',
      label: 'Payments outside a trip',
      hint: { full: 'Also tell you about captured payments that match no trip.', short: 'Captured payments that match no trip', tier: 'help' },
    },
    {
      key: 'approvals',
      label: 'Needs your OK',
      hint: {
        full: 'When an expense or a payment waits for your approval, or an edit needs your OK again. It doesn’t count in balances until you answer.',
        short: 'An expense or payment waits for your OK',
        tier: 'help',
      },
    },
    { key: 'expenses', label: 'New expenses', hint: { full: 'When someone adds an expense that includes you.', tier: 'help' } },
    { key: 'settlements', label: 'Someone pays you back', hint: { full: 'When someone records a payment to you.', tier: 'help' } },
    {
      key: 'reminders',
      label: 'Settle-up reminders',
      hint: { full: 'A gentle weekly nudge when you’ve owed someone for a week.', short: 'A weekly nudge when you owe someone', tier: 'help' },
    },
    {
      key: 'chat',
      label: 'Group chat',
      hint: { full: 'New messages in your groups’ chats. Mute one chat from its group’s ⋯ menu.', short: 'New messages in your groups’ chats', tier: 'help' },
    },
    {
      key: 'openItems',
      label: 'Open items',
      hint: { full: 'When someone thinks you paid for something nobody has added yet.', short: 'When someone thinks you paid for something', tier: 'help' },
    },
  ]
}

const TURN_ON_HINT: Hint = {
  full: 'Get a ping when a trip payment is captured, someone adds an expense with you, or pays you back.',
  short: 'A ping for new expenses and payments to you',
  tier: 'help',
}

/** Whether this build can show the Notifications settings at all (push needs Firebase and a VAPID key). */
export const notificationsAvailable = () => repo.mode === 'firebase' && !!VAPID_KEY

/**
 * Settings → Notifications: turn on push for this device and choose which notifications to get.
 * Renders nothing without a VAPID key (the page explains instead).
 */
/**
 * "Turn on notifications" for this device: asks for permission (call `turnOn` from a tap) and
 * registers the browser. Shared by Settings → Notifications and the reminder card (NudgeCards).
 */
export function useTurnOnPush() {
  const { user } = useMe()
  const toast = useToast()
  const [perm, setPerm] = useState(permission())
  const [busy, setBusy] = useState(false)
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
  return { perm, setPerm, busy, setBusy, turnOn }
}

export function NotificationSettings() {
  const { user, profile } = useMe()
  const toast = useToast()
  const { perm, setPerm, busy, setBusy, turnOn } = useTurnOnPush()
  const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_ALL_PREFS)
  const tokens = useCaptureTokens()
  const showAll = useShows(2)

  useEffect(() => (notificationsAvailable() ? watchPrefs(user.uid, setPrefs) : undefined), [user.uid])

  if (!notificationsAvailable()) return null

  const iosNeedsInstall = isIOS() && !isStandalone()
  const supported = pushSupported()

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
    (k === 'captures' || k === 'unsorted') && prefs.capturePaused
      ? 'Auto-capture is paused.'
      : k === 'unsorted' && !prefs.outsideTrips
        ? 'Only trip payments are captured. Choose “All bank & UPI payments” in Automation to use this.'
        : undefined

  return (
    <div data-testid="notification-settings">
      <div className="card p-4">
        {iosNeedsInstall ? (
          <p className="text-muted flex items-start gap-1.5 text-sm">
            <Share size={15} className="mt-0.5 shrink-0" aria-hidden />
            {IOS_INSTALL_FOR_PUSH} and come back here.
          </p>
        ) : !supported ? (
          <p className="text-muted text-sm">This browser can’t receive push notifications.</p>
        ) : perm === 'granted' ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted text-sm">On for this device.</p>
            <button type="button" className="btn-ghost btn-sm !px-2" onClick={turnOff} disabled={busy}>
              <BellOff size={16} aria-hidden /> Turn off here
            </button>
          </div>
        ) : perm === 'denied' ? (
          <p className="text-muted text-sm">Notifications are blocked for this site. Allow them in your browser or system settings, then reload.</p>
        ) : (
          <>
            <HintText hint={TURN_ON_HINT} className="text-muted text-sm" />
            <button type="button" className="btn-primary mt-3 w-full" onClick={turnOn} disabled={busy}>
              <Bell size={18} aria-hidden /> Turn on notifications
            </button>
          </>
        )}
      </div>

      <h2 className="mb-2 mt-5 px-1 font-bold">What to tell you about</h2>
      <div className="space-y-2">
        {types(profile.currency)
          // Minimal leaves out the capture rows until auto-capture is set up (a capture key exists): they'd never fire.
          .filter((t) => showAll || !!tokens?.length || (t.key !== 'captures' && t.key !== 'unsorted'))
          .map((t) => {
            const why = blocked(t.key)
            const id = `notif-${t.key}-label`
            return (
              <div key={t.key} className={`card flex items-center justify-between gap-4 p-3 ${why ? 'opacity-60' : ''}`} data-testid={`notif-${t.key}`}>
                <div className="min-w-0">
                  <div id={id} className="flex items-center text-sm font-semibold">
                    {t.label}
                    {!why && <InfoTip hint={t.hint} label={`About ${t.label.toLowerCase()}`} />}
                  </div>
                  {/* Why a row is off is status, always shown; the row's own description follows the look. */}
                  {why ? <div className="text-muted text-xs">{why}</div> : <HintText hint={t.hint} as="div" />}
                </div>
                <Switch checked={prefs[t.key] && !why} disabled={!!why} onChange={(v) => toggle(t.key, v)} label={t.label} testId={`notif-${t.key}-switch`} />
              </div>
            )
          })}
      </div>
      <HintText
        className="text-muted mt-3 px-1 text-xs"
        hint={{
          full: (
            <>
              These choices apply to all your devices. Capture settings live in{' '}
              <Link to="/settings/automation" className="font-semibold text-brand-600 dark:text-brand-300">
                Automation
              </Link>
              .
            </>
          ),
          short: 'These apply to all your devices',
          tier: 'help',
        }}
      />
    </div>
  )
}
