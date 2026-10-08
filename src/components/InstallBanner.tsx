import { useEffect, useState } from 'react'
import { Download, PlusSquare, Share, X } from 'lucide-react'
import { useAllGroupData } from '@/hooks/data'
import { countVisit, dismissInstall, isInstallDismissed, shouldOfferInstall } from '@/lib/install'
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
    subs.forEach((s) => s())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    subs.forEach((s) => s())
  })
}

const storage = (kind: 'localStorage' | 'sessionStorage') => { try { return window[kind] } catch { return undefined } }

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
    return () => { subs.delete(s) }
  }, [])
  const installed = isStandalone()
  const ios = isIOS()
  return {
    installed,
    canPrompt: !!deferred,
    ios,
    available: !installed && (!!deferred || ios),
    async prompt() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      subs.forEach((x) => x())
      return outcome === 'accepted'
    },
  }
}

export function IOSInstallSteps() {
  return (
    <ol className="space-y-4">
      <li className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><Share size={20} aria-hidden /></span>
        <span>Tap the <b>Share</b> button in Safari’s toolbar (bottom of the screen on iPhone, top on iPad).</span>
      </li>
      <li className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><PlusSquare size={20} aria-hidden /></span>
        <span>Scroll down and choose <b>Add to Home Screen</b>.</span>
      </li>
      <li className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-2xl dark:bg-brand-900/40" aria-hidden>✅</span>
        <span>Tap <b>Add</b>. Split Now then opens full-screen from your home screen, and can send you notifications.</span>
      </li>
      <li className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        Using Chrome or another browser on iPhone? The same <b>Share → Add to Home Screen</b> option is in its menu on iOS 16.4+. If it’s missing, open this page in Safari.
      </li>
    </ol>
  )
}

/**
 * "Install Split Now" above the tab bar: offered on the second visit or once the first expense
 * exists (src/lib/install.ts), and gone for good after a dismiss. Settings → Data keeps a row to
 * install later. iOS gets the reason that matters there: notifications need the installed app.
 */
export function InstallBanner() {
  const install = useInstall()
  const data = useAllGroupData()
  const [visits] = useState(() => countVisit(storage('localStorage'), storage('sessionStorage')))
  const [hidden, setHidden] = useState(() => isInstallDismissed(storage('localStorage')))
  const [iosOpen, setIosOpen] = useState(false)

  const hasExpense = !!data?.some((d) => d.expenses.length > 0)
  if (hidden || !install.available || !shouldOfferInstall({ visits, hasExpense, dismissed: hidden })) return null

  const dismiss = () => {
    dismissInstall(storage('localStorage'))
    setHidden(true)
  }

  return (
    <>
      <div className="install-banner animate-pop fixed inset-x-3 bottom-[calc(var(--nav-h)+2rem)] z-40 mx-auto max-w-md" data-testid="install-banner">
        <div className="flex items-center gap-2.5 rounded-3xl bg-slate-900 p-2.5 pl-3 text-white shadow-2xl shadow-brand-900/40 dark:bg-ink-800 dark:ring-1 dark:ring-white/10">
          <img src="/pwa-192.png" alt="" className="h-10 w-10 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">Install Split Now</div>
            <div className="truncate text-xs text-slate-300">{install.ios ? 'Add to Home Screen for notifications and offline use' : 'Full-screen, faster, works offline'}</div>
          </div>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-2xl bg-white px-3.5 py-2 text-sm font-bold text-slate-900"
            onClick={async () => {
              if (install.canPrompt) { if (await install.prompt()) setHidden(true) }
              else setIosOpen(true)
            }}
          >
            <span className="inline-flex items-center gap-1.5"><Download size={16} aria-hidden /> Install</span>
          </button>
          <button type="button" onClick={dismiss} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 hover:text-white" aria-label="Don’t ask again"><X size={18} /></button>
        </div>
      </div>
      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title="Add to Home Screen">
        <IOSInstallSteps />
      </Sheet>
    </>
  )
}
