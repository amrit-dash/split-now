import { type ReactNode, useEffect, useState } from 'react'
import { MoreVertical, RefreshCw, ToggleRight, X } from 'lucide-react'
import { BellIcon, BellRingingIcon, ChatIcon, HandCoinsIcon, LockIcon, PhoneIcon, ReceiptIcon, SettingsIcon } from '@/components/icons'
import { useGroups } from '@/hooks/data'
import { useFlag } from '@/hooks/useAppConfig'
import { isIOS, isStandalone, permission, pushSupported } from '@/lib/push'
import { closedPlaces, pushDevice, pushPromptStep, type PushPromptPlace } from '@/lib/push-prompt'
import { notificationsAvailable, useTurnOnPush } from './NotificationSettings'
import { Sheet } from './Sheet'

const KEY = 'sn-push-prompt-closed'
const STEP = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'

function readClosed(): PushPromptPlace[] {
  try {
    return closedPlaces(localStorage.getItem(KEY))
  } catch {
    return []
  }
}

function Step({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className={STEP} aria-hidden>
        {icon}
      </span>
      <span>{children}</span>
    </li>
  )
}

/** How to allow notifications again once they were blocked: they live in the phone's or the browser's own settings. */
function UnblockSteps() {
  const host = window.location.host
  const device = pushDevice(navigator.userAgent, isIOS())
  const installed = isStandalone()
  if (device === 'iphone')
    return (
      <ol className="space-y-4">
        <Step icon={<SettingsIcon size={20} />}>
          Open the <b>Settings</b> app and tap <b>Notifications</b>.
        </Step>
        <Step icon={<PhoneIcon size={20} />}>
          Find <b>Split Now</b> in the list and tap it.
        </Step>
        <Step icon={<ToggleRight size={20} />}>
          Turn on <b>Allow Notifications</b>, then come back here.
        </Step>
      </ol>
    )
  if (device === 'android')
    return installed ? (
      <ol className="space-y-4">
        <Step icon={<PhoneIcon size={20} />}>
          Touch and hold the <b>Split Now</b> icon on your home screen and tap <b>App info</b>.
        </Step>
        <Step icon={<BellIcon size={20} />}>
          Tap <b>Notifications</b>.
        </Step>
        <Step icon={<ToggleRight size={20} />}>
          Turn on <b>All Split Now notifications</b>, then come back here.
        </Step>
      </ol>
    ) : (
      <ol className="space-y-4">
        <Step icon={<MoreVertical size={20} />}>
          In Chrome, tap <b>⋮</b> → <b>Settings</b> → <b>Site settings</b> → <b>Notifications</b>.
        </Step>
        <Step icon={<ToggleRight size={20} />}>
          Find <b>{host}</b> and set it to <b>Allow</b>.
        </Step>
        <Step icon={<RefreshCw size={20} />}>Come back here and reload the page.</Step>
      </ol>
    )
  if (device === 'mac-safari')
    return (
      <ol className="space-y-4">
        <Step icon={<SettingsIcon size={20} />}>
          Open <b>System Settings</b> → <b>Notifications</b>.
        </Step>
        <Step icon={<PhoneIcon size={20} />}>
          Find <b>Split Now</b> in the list and turn on <b>Allow notifications</b>.
        </Step>
        <Step icon={<RefreshCw size={20} />}>Come back here.</Step>
      </ol>
    )
  if (device === 'firefox')
    return (
      <ol className="space-y-4">
        <Step icon={<LockIcon size={20} />}>Click the lock icon at the left of the address bar.</Step>
        <Step icon={<X size={20} />}>
          Next to <b>Send notifications</b>, click <b>✕</b> to clear the block.
        </Step>
        <Step icon={<RefreshCw size={20} />}>
          Reload this page and tap <b>Turn on</b> again.
        </Step>
      </ol>
    )
  return (
    <ol className="space-y-4">
      <Step icon={<MoreVertical size={20} />}>
        In the Split Now window, click <b>⋮</b> at the top right, then <b>App info</b> (or the icon by <b>{host}</b>).
      </Step>
      <Step icon={<ToggleRight size={20} />}>
        Turn on <b>Notifications</b> (or set them to <b>Allow</b>).
      </Step>
      <Step icon={<RefreshCw size={20} />}>Reload this page.</Step>
    </ol>
  )
}

/**
 * "Turn on notifications", on Home and at the top of Settings (src/lib/push-prompt.ts): only once
 * the person is in a group, never in the demo, and gone once notifications are on. Closing it hides
 * it in that place only. Allow is one tap; adding the app (iPhone) or unblocking get step-by-step help.
 */
export function PushPrompt({ place, className = '' }: { place: PushPromptPlace; className?: string }) {
  const on = useFlag('pushPrompt')
  const groups = useGroups()
  const push = useTurnOnPush()
  const [closed, setClosed] = useState(readClosed)
  const [open, setOpen] = useState(false)
  const { perm, setPerm, turnOn } = push

  // Back from the phone's or the browser's settings: pick up the change, and register this device once allowed there.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== 'visible') return
      const now = permission()
      if (now === perm) return
      setPerm(now)
      if (now === 'granted') {
        setOpen(false)
        void turnOn()
      }
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [perm, setPerm, turnOn])

  const step = on
    ? pushPromptStep({
        available: notificationsAvailable(),
        standalone: isStandalone(),
        supported: pushSupported(),
        perm,
        inGroup: (groups?.length ?? 0) > 0,
      })
    : null
  if (!step || closed.includes(place)) return null

  const close = () => {
    const next = [...closed, place]
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
    setClosed(next)
  }
  const line =
    step === 'blocked'
      ? 'Notifications are blocked on this device. It takes a minute to turn them back on.'
      : 'Know when someone adds an expense with you, pays you back or writes in a group.'

  return (
    <section className={`card flex items-start gap-3 p-4 ${className}`} aria-labelledby={`push-prompt-${place}`} data-testid={`push-prompt-${place}`}>
      <span className={STEP} aria-hidden>
        <BellRingingIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={`push-prompt-${place}`} className="font-semibold">
          Turn on notifications
        </h2>
        <p className="text-muted text-sm">{line}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {step === 'allow' ? (
            <button
              type="button"
              onClick={turnOn}
              disabled={push.busy}
              className="btn-primary !min-h-10 !rounded-full !px-4 !py-0 text-sm"
              data-testid="push-prompt-on"
            >
              <BellIcon size={16} aria-hidden /> Turn on
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${step === 'allow' ? 'btn-ghost' : 'btn-primary'} !min-h-10 !rounded-full !px-4 !py-0 text-sm`}
            data-testid="push-prompt-how"
          >
            {step === 'allow' ? 'What you get' : 'Show me how'}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="text-muted -mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-ink-800"
        data-testid="push-prompt-close"
      >
        <X size={18} aria-hidden />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Turn on notifications" testId="push-prompt-sheet">
        <ul className="mb-5 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <ReceiptIcon size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden /> Someone adds an expense with you
          </li>
          <li className="flex items-center gap-2">
            <HandCoinsIcon size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden /> Someone pays you back, or reminds you to settle up
          </li>
          <li className="flex items-center gap-2">
            <ChatIcon size={16} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden /> New messages in your groups’ chats
          </li>
        </ul>
        {step === 'blocked' ? (
          <>
            <p className="text-muted mb-4 text-sm">Split Now can’t ask again once notifications are blocked, so they are turned back on in settings:</p>
            <UnblockSteps />
          </>
        ) : (
          <>
            <ol className="space-y-4">
              <Step icon={<BellIcon size={20} />}>
                Tap <b>Allow notifications</b> below.
              </Step>
              <Step icon={<ToggleRight size={20} />}>
                When your {isIOS() ? 'iPhone' : 'device'} asks, tap <b>Allow</b>.
              </Step>
              <Step icon={<SettingsIcon size={20} />}>
                Choose what you hear about any time in <b>Settings</b> → <b>Notifications</b>.
              </Step>
            </ol>
            <button
              type="button"
              className="btn-primary mt-5 w-full"
              disabled={push.busy}
              onClick={() => {
                setOpen(false)
                void turnOn()
              }}
            >
              <BellIcon size={18} aria-hidden /> Allow notifications
            </button>
          </>
        )}
      </Sheet>
    </section>
  )
}
