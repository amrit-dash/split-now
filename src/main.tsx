import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './fonts.css'
import './index.css'
import './lib/theme'
import App from './App'
import { AuthProvider } from './hooks/auth'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './components/ConfirmSheet'
import { initRepo } from './data'
import { initLocale } from './lib/locale'
import { fieldScrollDelta, opensKeyboard } from './lib/keyboard'

// Region → default currency (INR for India and anywhere unknown) and number/date locale (en-IN).
// <html lang> stays "en" (index.html): the copy is English; only numbers and dates follow the locale.
initLocale()

// A tab that outlived its build (a deploy replaced the hashed chunks it would lazy-load) reloads
// once instead of showing a blank screen; once only, so a genuinely missing file can't loop.
window.addEventListener('vite:preloadError', (e) => {
  const key = 'splitit-preload-reload'
  try {
    if (sessionStorage.getItem(key) === __APP_VERSION__) return
    sessionStorage.setItem(key, __APP_VERSION__)
  } catch {
    /* no sessionStorage: still reload this once */
  }
  e.preventDefault()
  location.reload()
})

// Keyboard: once it has opened, move the focused field to the middle of what is still visible
// (browsers park it right above the keyboard). Touch screens only; src/lib/keyboard.ts.
if (window.matchMedia?.('(pointer: coarse)').matches) {
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null
    if (!opensKeyboard(el as HTMLInputElement | null)) return
    // Wait for the keyboard: the visual viewport resizes once it is up (fallback after 350 ms).
    const vv = window.visualViewport
    let done = false
    const settle = () => {
      if (done || document.activeElement !== el || !el) return
      done = true
      vv?.removeEventListener('resize', settle)
      const r = el.getBoundingClientRect()
      const dy = fieldScrollDelta({ top: r.top, bottom: r.bottom, viewTop: vv?.offsetTop ?? 0, viewHeight: vv?.height ?? window.innerHeight })
      if (dy) window.scrollBy({ top: dy, behavior: 'smooth' })
    }
    vv?.addEventListener('resize', settle)
    setTimeout(settle, 350)
  })
}

// So a console screenshot in a bug report says which build it is.
console.info(`Split Now ${__APP_VERSION__}`)

// The data layer is a static import picked at build time (src/data/index.ts), so render at once:
// the HTML splash (index.html) hands over to <Splash/> in App, which carries on its animation while the sign-in state is read.
initRepo()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
