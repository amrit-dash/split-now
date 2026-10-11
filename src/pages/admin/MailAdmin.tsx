import { useEffect, useState } from 'react'
import { Loader2, Send, Trash2 } from 'lucide-react'
import { Segmented } from '@/components/Misc'
import { useConfirm } from '@/components/ConfirmSheet'
import { useToast } from '@/components/Toast'
import { errText } from '@/lib/errors'
import { adminMail, type MailProvider, type MailSettings } from './api'

const PROVIDERS: Array<{ value: MailProvider; label: string; help: string }> = [
  {
    value: 'brevo',
    label: 'Brevo',
    help: 'Works without a domain: verify one sender address in Brevo (Senders & IP → Senders), then create an API key (SMTP & API → API keys). Free for 300 emails a day.',
  },
  {
    value: 'resend',
    label: 'Resend',
    help: 'Needs a domain you own, verified in Resend (Domains). The sender must be an address on it, e.g. codes@yourdomain.com. Free for 100 emails a day.',
  },
]

/**
 * Admin → Email: the service the 6-digit codes go out through (confirming a new account's email,
 * adding another email). Without it, new email accounts confirm with Firebase's own link and
 * adding emails is off. The key is sealed on the server; only its last characters come back.
 */
export default function MailAdmin() {
  const toast = useToast()
  const confirm = useConfirm()
  const [s, setS] = useState<MailSettings | null>(null)
  const [provider, setProvider] = useState<MailProvider>('brevo')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('Split Now')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null)

  const load = async () => {
    try {
      const r = await adminMail.get()
      setS(r)
      if (r.provider) setProvider(r.provider)
      setFromEmail(r.fromEmail)
      setFromName(r.fromName || 'Split Now')
    } catch (e) {
      toast(errText(e), 'err')
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the tab opens
  useEffect(() => {
    void load()
  }, [])

  const run = async (kind: 'save' | 'test' | 'remove', fn: () => Promise<void>) => {
    setBusy(kind)
    try {
      await fn()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }
  const help = PROVIDERS.find((p) => p.value === provider)!.help

  return (
    <div className="mb-[calc(var(--lane)-var(--nav-h))] card space-y-4 p-4" data-testid="admin-mail">
      <div>
        <h2 className="font-bold">Email codes</h2>
        <p className="text-muted mt-1 text-sm">
          New email accounts confirm their address with a 6-digit code, and people add more emails to their account the same way. The codes go out through this
          service. {s === null ? '' : s.ready ? <b className="text-emerald-700 dark:text-emerald-400">Set up and sending.</b> : <b>Not set up:</b>}
          {s && !s.ready && ' new accounts get Firebase’s confirmation link instead, and adding emails is off.'}
        </p>
      </div>
      <div>
        <div className="label" id="mail-provider-label">
          Service
        </div>
        <Segmented<MailProvider>
          label="Email service"
          value={provider}
          onChange={setProvider}
          options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <p className="text-muted mt-1.5 text-xs">{help}</p>
      </div>
      <div>
        <label htmlFor="mail-from" className="label">
          Sender address
        </label>
        <input
          id="mail-from"
          className="input"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={provider === 'brevo' ? 'you@gmail.com' : 'codes@yourdomain.com'}
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="mail-name" className="label">
          Sender name
        </label>
        <input id="mail-name" className="input" maxLength={60} value={fromName} onChange={(e) => setFromName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="mail-key" className="label">
          API key
        </label>
        <input
          id="mail-key"
          className="input font-mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={s?.hint ? `Saved (${s.hint}). Paste a new one to replace it` : 'Paste the API key'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={!!busy}
          onClick={() =>
            run('save', async () => {
              await adminMail.save({ provider, fromEmail: fromEmail.trim(), fromName: fromName.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) })
              setApiKey('')
              await load()
              toast('Saved. Send a test to check it')
            })
          }
          data-testid="admin-mail-save"
        >
          {busy === 'save' && <Loader2 size={16} className="animate-spin" aria-hidden />} Save
        </button>
        <button
          type="button"
          className="btn-secondary flex-1"
          disabled={!!busy || !s?.ready}
          onClick={() =>
            run('test', async () => {
              const r = await adminMail.test()
              toast(`Test code sent to ${r.sentTo}`)
            })
          }
        >
          {busy === 'test' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />} Send a test
        </button>
      </div>
      {s?.ready && (
        <button
          type="button"
          className="btn-ghost w-full text-rose-700 dark:text-rose-400"
          disabled={!!busy}
          onClick={async () => {
            const ok = await confirm({
              title: 'Stop sending codes?',
              message: 'New email accounts get Firebase’s confirmation link instead, and nobody can add another email until this is set up again.',
              confirmLabel: 'Stop',
              tone: 'danger',
            })
            if (ok)
              await run('remove', async () => {
                await adminMail.remove()
                await load()
              })
          }}
        >
          <Trash2 size={16} aria-hidden /> Remove the email service
        </button>
      )}
    </div>
  )
}
