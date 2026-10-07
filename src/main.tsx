import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './lib/theme'
import App from './App'
import { AuthProvider } from './hooks/auth'
import { ToastProvider } from './components/Toast'
import { initRepo } from './data'

// Pick (and, for Firebase, lazily load) the data layer before anything reads `repo`.
initRepo().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>,
  )
})
