import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, KeyRound, Smartphone, Trash2, Zap } from 'lucide-react'
import { firebaseProject, repo } from '@/data'
import type { CaptureToken } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { copy } from '@/lib/share'
import { useToast } from './Toast'

/** Profile section: capture tokens and ready-to-paste iOS Shortcut / Android automation settings. */
export function AutoCapture() {
  const { user } = useMe()
  const toast = useToast()
  const [tokens, setTokens] = useState<CaptureToken[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => repo.watchCaptureTokens(user.uid, setTokens), [user.uid])

  const token = tokens?.[0]
  const firebase = repo.mode === 'firebase' && firebaseProject.projectId
  const restUrl = firebase
    ? `https://firestore.googleapis.com/v1/projects/${firebaseProject.projectId}/databases/(default)/documents/captureInbox?key=${firebaseProject.apiKey}`
    : ''
  const body = token
    ? JSON.stringify({
      fields: {
        token: { stringValue: token.token },
        uid: { stringValue: user.uid },
        raw: { stringValue: '[Amount]' },
        merchant: { stringValue: '[Merchant]' },
        card: { stringValue: '[Card or Pass]' },
        ts: { stringValue: '[Formatted Date]' },
        src: { stringValue: 'ios-shortcut' },
      },
    }, null, 2)
    : ''
  const openUrl = `${location.origin}/capture?v=1&raw=[Amount]&merchant=[Merchant]&card=[Card or Pass]&src=ios-shortcut${token ? `&t=${token.token}&u=${user.uid}` : ''}`

  const create = async () => {
    setBusy(true)
    try { await repo.createCaptureToken(user.uid); toast('Capture key created') } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  const revoke = async (t: string) => {
    if (!confirm('Revoke this key? Shortcuts using it will stop working.')) return
    await repo.revokeCaptureToken(t)
    toast('Key revoked')
  }
  const copyIt = async (text: string, what: string) => toast((await copy(text)) ? `${what} copied` : 'Couldn’t copy', 'ok')

  return (
    <div id="auto-capture" className="card mt-4 p-4">
      <div className="flex items-center gap-2">
        <Zap size={18} className="text-brand-600 dark:text-brand-300" />
        <div className="label !mb-0">Auto-capture</div>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Send card payments to your <Link to="/inbox" className="font-semibold text-brand-600 dark:text-brand-300">inbox</Link> automatically, then pick a group with one tap. Nothing is ever added without your OK.
      </p>

      {tokens === null ? null : !token ? (
        <button className="btn-secondary mt-3 w-full" onClick={create} disabled={busy}><KeyRound size={18} /> Create a capture key</button>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
            <KeyRound size={16} className="shrink-0 text-slate-400" />
            <code className="min-w-0 flex-1 truncate text-xs">{token.token}</code>
            <button className="rounded-full p-1.5 text-slate-500" onClick={() => copyIt(token.token, 'Key')} aria-label="Copy key"><Copy size={16} /></button>
            <button className="rounded-full p-1.5 text-rose-500" onClick={() => revoke(token.token)} aria-label="Revoke key"><Trash2 size={16} /></button>
          </div>
          <p className="text-xs text-slate-500">Anyone with this key can add items to your inbox (never read your data). Revoke it if it leaks.</p>
        </div>
      )}

      <details className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800" open={!!token}>
        <summary className="cursor-pointer font-semibold"><Smartphone size={15} className="mr-1 inline" /> iPhone: Apple Pay Shortcut (iOS 17+)</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
          <li>Shortcuts → <b>Automation</b> → <b>+</b> → <b>Transaction</b>. Pick your cards, choose <b>Run Immediately</b>.</li>
          <li>Add <b>Format Date</b>: Current Date, ISO 8601, include time.</li>
          <li>Add <b>Text</b> and paste the body below. Replace each <code>[…]</code> with the matching variable (Amount, Merchant, Card or Pass, Formatted Date).</li>
          <li>Add <b>Get Contents of URL</b>: paste the URL, Method <b>POST</b>, Header <code>Content-Type: application/json</code>, Request Body <b>File</b> → the Text.</li>
        </ol>
        {firebase && token ? (
          <div className="mt-3 space-y-2">
            <CopyBlock label="URL" value={restUrl} onCopy={() => copyIt(restUrl, 'URL')} />
            <CopyBlock label="Body" value={body} onCopy={() => copyIt(body, 'Body')} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">{firebase ? 'Create a capture key to get your URL and body.' : 'Background capture needs Firebase. In demo mode, use the Open URL link below instead.'}</p>
        )}
        <p className="mt-3 text-xs text-slate-500">Prefer to confirm straight away? Use <b>Open URL</b> with the link below instead (it opens Safari).</p>
        <CopyBlock label="Open URL" value={openUrl} onCopy={() => copyIt(openUrl, 'Link')} />
      </details>

      <details className="mt-2 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-ink-800">
        <summary className="cursor-pointer font-semibold"><Smartphone size={15} className="mr-1 inline" /> Android</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
          <li>Install Split It, then <b>Share</b> a payment screenshot, receipt or bank message to it.</li>
          <li>Tasker / MacroDroid: on a Google Wallet or bank notification, open
            <code className="break-all"> {location.origin}/capture?v=1&amp;amount=%amount&amp;merchant=%merchant&amp;src=android-auto</code></li>
        </ul>
      </details>
      <Link to={`/capture?v=1&amount=4.50&merchant=Test%20Cafe&src=manual&ref=test-${user.uid.slice(0, 6)}-${new Date().toISOString().slice(0, 10)}`} className="btn-ghost mt-2 w-full">Try a test capture</Link>
    </div>
  )
}

function CopyBlock({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
        {label}
        <button className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300" onClick={onCopy}><Copy size={13} /> Copy</button>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-white p-2 font-mono text-[11px] dark:bg-ink-900">{value}</pre>
    </div>
  )
}
