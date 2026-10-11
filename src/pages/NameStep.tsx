import { useState } from 'react'
import { Loader2, Smile } from 'lucide-react'
import { repo } from '@/data'
import { useToast } from '@/components/Toast'
import { usePageTitle } from '@/lib/brand'
import { errText } from '@/lib/errors'
import { AuthShell } from './Login'

/**
 * Once, right after signing up with an email link (which carries no name): what friends see in
 * groups. Google accounts bring their name and never see this.
 */
export default function NameStep() {
  usePageTitle('Your name')
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60)
  return (
    <AuthShell>
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/15">
        <Smile size={30} className="text-duo-300" aria-hidden />
      </div>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">What should friends call you?</h1>
      <p className="mt-3 text-slate-300">Your name in groups. Add your last name too, so two people called Rahul stay apart.</p>
      <form
        className="mt-8 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!clean) return
          setBusy(true)
          try {
            await repo.setDisplayName?.(clean)
          } catch (err) {
            toast(errText(err), 'err')
          } finally {
            setBusy(false)
          }
        }}
      >
        <label htmlFor="name-step" className="sr-only">
          Your name
        </label>
        <input
          id="name-step"
          className="input !bg-white/10 !text-white placeholder:!text-slate-400"
          placeholder="Your name"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="done"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="name-step-input"
        />
        <button type="submit" className="btn-primary w-full" disabled={busy || !clean} data-testid="name-step-save">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Continue
        </button>
      </form>
    </AuthShell>
  )
}
