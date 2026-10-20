import { useEffect, useState } from 'react'
import { ChevronRight, Download, MoreVertical, PlusSquare, Share, Smartphone, X } from 'lucide-react'
import { useAllGroupData } from '@/hooks/data'
import { countVisit, dismissInstall, installMethod, isInstallDismissed, shouldOfferInstall, type InstallMethod } from '@/lib/install'
import { useSwipeDismiss } from '@/hooks/useSwipeDismiss'
import { HintText } from './Hint'
import { Sheet } from './Sheet'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Capture as early as possible — the event can fire before React mounts.
let deferred: BeforeInstallPromptEvent | null = null
const subs = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    for (const s of subs) s()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    for (const s of subs) s()
  })
}

const storage = (kind: 'localStorage' | 'sessionStorage') => {
  try {
    return window[kind]
  } catch {
    return undefined
  }
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const s = () => force((n) => n + 1)
    subs.add(s)
    return () => {
      subs.delete(s)
    }
  }, [])
  const installed = isStandalone()
  const ios = isIOS()
  const method = installMethod({
    installed,
    canPrompt: !!deferred,
    ua: navigator.userAgent,
    platform: navigator.platform,
    touchPoints: navigator.maxTouchPoints,
  })
  return {
    installed,
    canPrompt: !!deferred,
    ios,
    /** how this browser installs the app (src/lib/install.ts), null when it can't */
    method,
    available: !installed && (!!deferred || ios),
    async prompt() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      for (const s of subs) s()
      return outcome === 'accepted'
    },
  }
}

export function IOSInstallSteps() {
  return (
    <ol className="space-y-4">
      <li className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <Share size={20} aria-hidden />
        </span>
        <span>
          Tap the <b>Share</b> button in Safari’s toolbar (bottom of the screen on iPhone, top on iPad).
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <PlusSquare size={20} aria-hidden />
        </span>
        <span>
          Scroll down and choose <b>Add to Home Screen</b>.
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-2xl dark:bg-brand-900/40" aria-hidden>
          ✅
        </span>
        <span>
          Tap <b>Add</b>. Split Now then opens full-screen from your home screen, and can send you notifications.
        </span>
      </li>
      <li className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        Using Chrome or another browser on iPhone? The same <b>Share → Add to Home Screen</b> option is in its menu on iOS 16.4+. If it’s missing, open this
        page in Safari.
      </li>
    </ol>
  )
}

const STEP = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'

/** The steps for a browser that installs from its own menu: Safari on a Mac, or Chrome / Edge / Firefox (Android) without their dialog. */
export function MenuInstallSteps({ method }: { method: Exclude<InstallMethod, 'prompt' | 'ios'> }) {
  const android = /Android/.test(navigator.userAgent)
  if (method === 'mac')
    return (
      <ol className="space-y-4">
        <li className="flex items-center gap-3">
          <span className={STEP} aria-hidden>
            <Share size={20} />
          </span>
          <span>
            In Safari’s menu bar, choose <b>File → Add to Dock</b> (or the <b>Share</b> button → <b>Add to Dock</b>).
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className={`${STEP} text-2xl`} aria-hidden>
            ✅
          </span>
          <span>
            Click <b>Add</b>. Split Now opens in its own window from the Dock and Launchpad.
          </span>
        </li>
      </ol>
    )
  return (
    <ol className="space-y-4">
      <li className="flex items-center gap-3">
        <span className={STEP} aria-hidden>
          <MoreVertical size={20} />
        </span>
        <span>
          {android ? (
            <>
              Open the browser menu (<b>⋮</b>) and choose <b>Install app</b> or <b>Add to Home screen</b>.
            </>
          ) : (
            <>
              Click the install icon at the right of the address bar, or open the browser menu (<b>⋮</b> or <b>…</b>) and choose <b>Install Split Now</b> (in
              Chrome it can be under <b>Cast, save and share</b>; in Edge under <b>Apps</b>).
            </>
          )}
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span className={`${STEP} text-2xl`} aria-hidden>
          ✅
        </span>
        <span>
          {android
            ? 'Split Now then opens full-screen from your home screen.'
            : 'Split Now then opens in its own window, from your Start menu, Dock or desktop.'}
        </span>
      </li>
    </ol>
  )
}

/**
 * "Install Split Now on this device": a row (Profile, Settings → Data) for whenever the banner
 * was dismissed or never shown. Phones and computers alike, wherever this browser can install;
 * hidden in the installed app and in browsers that can't (Firefox on a computer).
 */
export function InstallRow({ className = 'card', testId = 'install-row' }: { className?: string; testId?: string }) {
  const install = useInstall()
  const [steps, setSteps] = useState(false)
  const method = install.method
  if (!method) return null
  const phone = method === 'ios' || /Android|Mobi/.test(navigator.userAgent)
  const hint =
    method === 'ios'
      ? 'Add to Home Screen for notifications and offline use'
      : phone
        ? 'Full-screen, faster, works offline'
        : 'Its own window, notifications, works offline'
  return (
    <>
      <button
        type="button"
        className={`${className} flex w-full items-center gap-3 p-4 text-left font-medium transition active:bg-slate-50 dark:active:bg-ink-800`}
        onClick={() => (method === 'prompt' ? void install.prompt() : setSteps(true))}
        data-testid={testId}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
          aria-hidden
        >
          {phone ? <Smartphone size={19} /> : <Download size={19} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block">Install Split Now {phone ? 'on this phone' : 'on this computer'}</span>
          {/* 'help' like the rows it sits among (Profile, Settings → Data). */}
          <HintText
            hint={{ full: hint, short: method === 'ios' ? 'For notifications and offline use' : undefined, tier: 'help' }}
            as="span"
            className="text-muted block text-xs font-normal"
          />
        </span>
        <ChevronRight size={18} className="text-slate-400" aria-hidden />
      </button>
      <Sheet
        open={steps}
        onClose={() => setSteps(false)}
        title={method === 'ios' ? 'Add to Home Screen' : method === 'mac' ? 'Add to Dock' : 'Install Split Now'}
      >
        {method === 'ios' ? <IOSInstallSteps /> : method === 'prompt' ? null : <MenuInstallSteps method={method} />}
      </Sheet>
    </>
  )
}

/**
 * The dark "Install Split Now" bar: the app icon, why, Install (the browser's own dialog, or the
 * steps where there is none) and ✕, which stops the offer for good. Shared by the banner above the
 * tab bar and the sign-in screen.
 */
function InstallBar({ hint, onDone, className, wrap = false }: { hint: string; onDone: () => void; className: string; wrap?: boolean }) {
  const install = useInstall()
  const [steps, setSteps] = useState(false)
  const method = install.method
  const dismiss = () => {
    dismissInstall(storage('localStorage'))
    onDone()
  }
  // A sideways swipe is the same as ✕ (Don't ask again).
  const swipe = useSwipeDismiss(dismiss)
  const installButton = (
    <button
      type="button"
      className="min-h-11 shrink-0 rounded-2xl bg-white px-3.5 py-2 text-sm font-bold text-slate-900"
      onClick={async () => {
        if (install.canPrompt) {
          if (await install.prompt()) onDone()
        } else setSteps(true)
      }}
      data-testid="install-banner-install"
    >
      <span className="inline-flex items-center gap-1.5">
        <Download size={16} aria-hidden /> Install
      </span>
    </button>
  )
  return (
    <>
      <div className={className} data-testid="install-banner">
        {/* wrap (the sign-in screen): the words get the full width and Install sits under them. */}
        <div
          {...swipe.bind}
          className={`flex gap-2.5 rounded-3xl bg-slate-900 py-2.5 pl-3 pr-1 text-white shadow-2xl shadow-brand-900/40 dark:bg-ink-800 dark:ring-1 dark:ring-white/10 ${wrap ? 'items-start' : 'items-center'}`}
        >
          <img src="/pwa-192.png" alt="" className={`h-10 w-10 shrink-0 rounded-2xl ${wrap ? 'mt-1' : ''}`} />
          <div className={`min-w-0 flex-1 ${wrap ? 'pt-1' : ''}`}>
            <div className={`${wrap ? '' : 'truncate '}text-sm font-semibold`}>Install Split Now</div>
            <HintText as="div" className={`${wrap ? '' : 'truncate '}text-xs text-slate-300`} hint={{ full: hint, tier: 'help' }} />
            {wrap && <div className="mt-2.5">{installButton}</div>}
          </div>
          {!wrap && installButton}
          <button
            type="button"
            onClick={dismiss}
            className="-ml-1.5 flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-slate-300 hover:text-white"
            aria-label="Don’t ask again"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <Sheet
        open={steps}
        onClose={() => setSteps(false)}
        title={method === 'mac' ? 'Add to Dock' : method === 'ios' || !method ? 'Add to Home Screen' : 'Install Split Now'}
      >
        {method && method !== 'ios' && method !== 'prompt' ? <MenuInstallSteps method={method} /> : <IOSInstallSteps />}
      </Sheet>
    </>
  )
}

/**
 * "Install Split Now" above the tab bar: offered on the second visit or once the first expense
 * exists (src/lib/install.ts), and gone for good after a dismiss. Settings → Data keeps a row to
 * install later, and so does Profile (InstallRow). iOS gets the reason that matters there: notifications need the installed app.
 */
export function InstallBanner() {
  const install = useInstall()
  const data = useAllGroupData()
  const [visits] = useState(() => countVisit(storage('localStorage'), storage('sessionStorage')))
  const [hidden, setHidden] = useState(() => isInstallDismissed(storage('localStorage')))

  const hasExpense = !!data?.some((d) => d.expenses.length > 0)
  if (hidden || !install.available || !shouldOfferInstall({ visits, hasExpense, dismissed: hidden })) return null
  return (
    <InstallBar
      hint={install.ios ? 'Add to Home Screen for notifications and offline use' : 'Full-screen, faster, works offline'}
      onDone={() => setHidden(true)}
      className="install-banner animate-pop fixed inset-x-3 bottom-[var(--lane)] z-40 mx-auto max-w-md"
    />
  )
}

/**
 * The same offer on the sign-in screen, from the first visit: installing before signing in means
 * signing in once. On an iPhone the Home Screen app keeps its own sign-in, apart from Safari's.
 * In the flow of the page (not floating), so it never covers the sign-in buttons.
 */
export function LoginInstallBanner() {
  const install = useInstall()
  const [hidden, setHidden] = useState(() => isInstallDismissed(storage('localStorage')))
  if (hidden || !install.method) return null
  const phone = install.ios || /Android|Mobi/.test(navigator.userAgent)
  return (
    <InstallBar
      hint={
        install.ios
          ? 'Add it to your Home Screen, then sign in there'
          : phone
            ? 'Install first, then sign in once'
            : 'Its own window, notifications, works offline'
      }
      onDone={() => setHidden(true)}
      className="animate-pop mt-8"
      wrap
    />
  )
}
