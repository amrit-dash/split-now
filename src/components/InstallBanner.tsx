import { useEffect, useState } from 'react'
import { Download, PlusSquare, Share, X } from 'lucide-react'
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

const DISMISS_KEY = 'splitit-install-dismissed'
const SNOOZE_MS = 7 * 86400000

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function snoozed() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < SNOOZE_MS } catch { return false }
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
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><Share size={20} /></span>
        <span>Tap the <b>Share</b> button in Safari’s toolbar (bottom of the screen on iPhone, top on iPad).</span>
      </li>
      <li className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"><PlusSquare size={20} /></span>
        <span>Scroll down and choose <b>Add to Home Screen</b>.</span>
      </li>
      <li className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-2xl dark:bg-brand-900/40">✅</span>
        <span>Tap <b>Add</b>. Split It now opens full-screen from your home screen, like a native app.</span>
      </li>
      <li className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        Using Chrome or another browser on iPhone? The same <b>Share → Add to Home Screen</b> option is in its menu on iOS 16.4+. If it’s missing, open this page in Safari.
      </li>
    </ol>
  )
}

export function InstallBanner() {
  const install = useInstall()
  const [hidden, setHidden] = useState(snoozed())
  const [iosOpen, setIosOpen] = useState(false)

  if (hidden || !install.available) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setHidden(true)
  }

  return (
    <>
      <div className="animate-pop fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md">
        <div className="flex items-center gap-3 rounded-3xl bg-slate-900 p-3 pl-4 text-white shadow-2xl shadow-brand-900/40 dark:bg-ink-800 dark:ring-1 dark:ring-white/10">
          <img src="/pwa-192.png" alt="" className="h-11 w-11 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Install Split It</div>
            <div className="truncate text-xs text-slate-300">Full-screen, faster, works offline</div>
          </div>
          <button
            className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900"
            onClick={async () => {
              if (install.canPrompt) { if (await install.prompt()) setHidden(true) }
              else setIosOpen(true)
            }}
          >
            <span className="inline-flex items-center gap-1.5"><Download size={16} /> Install</span>
          </button>
          <button onClick={dismiss} className="rounded-full p-1.5 text-slate-400 hover:text-white" aria-label="Dismiss"><X size={18} /></button>
        </div>
      </div>
      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title="Add to Home Screen">
        <IOSInstallSteps />
      </Sheet>
    </>
  )
}
