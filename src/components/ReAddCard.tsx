import { useEffect, useState } from 'react'
import { Maximize2, PlusSquare, Share, X } from 'lucide-react'
import { TrashIcon } from '@/components/icons'
import { needsReAdd } from '@/lib/keyboard'
import { isIOS, isStandalone } from '@/lib/push'
import { repo } from '@/data'
import { Sheet } from './Sheet'

const KEY = 'sn-readd-dismissed'
/** Set the first time a launch reads the screen right: an install can't go back to the old status bar, so it never asks again. */
const OK_KEY = 'sn-readd-ok'

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function readFlag(k: string): boolean {
  try {
    return localStorage.getItem(k) === '1'
  } catch {
    return false
  }
}
function writeFlag(k: string) {
  try {
    localStorage.setItem(k, '1')
  } catch {
    /* private mode */
  }
}

/** The top safe area in CSS px, read off a hidden element. */
function safeTop(): number {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;padding-top:env(safe-area-inset-top)'
  document.body.appendChild(el)
  const top = Number.parseFloat(getComputedStyle(el).paddingTop) || 0
  el.remove()
  return top
}

const STEP = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'

/**
 * The installed iPhone app added before 6.2.7 keeps the see-through status bar, and with it iOS 26's
 * band at the bottom of the screen (src/lib/keyboard.ts): iOS reads the status bar only when the app
 * is added to the Home Screen. Once, on Home, this says so and shows how to add it again.
 */
export function ReAddCard() {
  const [show, setShow] = useState(false)
  // Read twice, a second apart, and only shown when both say so (owner, 23 Oct 2026: it came up once
  // on an app reopened mid-update, when iOS reported the screen wrongly for a moment, and was gone on
  // the next launch). A launch that reads the screen right marks this install fine for good.
  useEffect(() => {
    if (dismissed() || readFlag(OK_KEY)) return
    const check = () => needsReAdd({ ios: isIOS(), standalone: isStandalone(), portrait: window.innerHeight > window.innerWidth, safeTop: safeTop() })
    if (!check()) {
      if (isIOS() && isStandalone() && window.innerHeight > window.innerWidth) writeFlag(OK_KEY)
      return
    }
    const t = setTimeout(() => {
      if (check()) setShow(true)
      else writeFlag(OK_KEY)
    }, 1200)
    return () => clearTimeout(t)
  }, [])
  const [open, setOpen] = useState(false)
  if (!show) return null
  const close = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {}
    setShow(false)
    setOpen(false)
  }
  return (
    <section className="card mb-5 flex items-start gap-3 p-4" aria-labelledby="readd-title" data-testid="readd-card">
      <span className={STEP} aria-hidden>
        <Maximize2 size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="readd-title" className="font-semibold">
          Use the whole screen
        </h2>
        <p className="text-muted text-sm">Add Split Now to your Home Screen again to remove the empty strip at the bottom of the screen.</p>
        <button type="button" onClick={() => setOpen(true)} className="btn-primary mt-3 !min-h-10 !rounded-full !px-4 !py-0 text-sm" data-testid="readd-how">
          Show me how
        </button>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="text-muted -mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-ink-800"
        data-testid="readd-dismiss"
      >
        <X size={18} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add Split Now again" testId="readd-sheet">
        <p className="text-muted mb-4 text-sm">
          iOS 26 leaves an empty strip at the bottom of apps added with the old status bar. iOS only picks up the new one when the app is added again.
        </p>
        <ol className="space-y-4">
          <li className="flex items-center gap-3">
            <span className={STEP} aria-hidden>
              <TrashIcon size={20} />
            </span>
            <span>
              Touch and hold the <b>Split Now</b> icon, tap <b>Remove App</b>, then <b>Delete</b>.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className={STEP} aria-hidden>
              <Share size={20} />
            </span>
            <span>
              Open <b>{window.location.host}</b> in Safari and tap <b>Share</b>.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className={STEP} aria-hidden>
              <PlusSquare size={20} />
            </span>
            <span>
              Choose <b>Add to Home Screen</b>, then <b>Add</b>, and open Split Now from the new icon.
            </span>
          </li>
          <li className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            {repo.mode === 'demo'
              ? 'This is demo mode: the demo data on this phone goes with the app.'
              : 'You will need to sign in again. Your groups and expenses stay as they are.'}
          </li>
        </ol>
        <button type="button" onClick={close} className="btn-secondary mt-5 w-full">
          Done, don’t show again
        </button>
      </Sheet>
    </section>
  )
}
