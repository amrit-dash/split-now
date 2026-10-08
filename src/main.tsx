import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './lib/theme'
import App from './App'
import { AuthProvider } from './hooks/auth'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './components/ConfirmSheet'
import { initRepo } from './data'
import { initLocale } from './lib/locale'

// Region → default currency (INR for India and anywhere unknown) and number/date locale (en-IN).
const locale = initLocale()
try { document.documentElement.lang = locale.locale } catch { /* ignore */ }

// Pick (and, for Firebase, lazily load) the data layer before anything reads `repo`.
initRepo().then(() => {
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
})
