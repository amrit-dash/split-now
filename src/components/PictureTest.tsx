import { type ReactNode, useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { repo } from '@/data'
import { errText } from '@/lib/errors'
import { pictureTestLine, pictureTestNote } from '@/lib/icon-ai'
import type { PictureTestResult } from '../../shared/icon-ai'

/**
 * Model for pictures with its Test beside it (Settings → AI features for one's own key, Admin → AI
 * for Split Now's; owner, 22 Oct 2026: the button sat alone under a paragraph): the dropdown
 * (`children`), a Test button on its right, and after a test the picture itself at the end of the
 * row (tap it to see it bigger). One line under says what a test costs, then how it went: the
 * model, the time and the cost, or why Google refused in its own words. One real picture, with
 * exactly the chosen model, no fallback.
 */
export function PictureTest({ which, model, children }: { which: 'own' | 'app'; model: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PictureTestResult | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [big, setBig] = useState(false)
  const run = async () => {
    setBusy(true)
    setResult(null)
    setFailed(null)
    setBig(false)
    try {
      setResult(await repo.pictureTest(which, model))
    } catch (e) {
      setFailed(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const src = result?.ok ? `data:${result.mimeType};base64,${result.image}` : null
  return (
    <div data-testid={`picture-test-${which}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          className="chip h-12 shrink-0 !rounded-2xl px-3.5"
          onClick={run}
          disabled={busy}
          aria-label={busy ? 'Drawing a test picture' : `Test pictures with ${model}`}
          data-testid="picture-test-run"
        >
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ImageIcon size={18} aria-hidden />}
          Test
        </button>
        {src && (
          <button
            type="button"
            onClick={() => setBig((b) => !b)}
            aria-label={big ? 'Show the test picture smaller' : 'Show the test picture bigger'}
            aria-expanded={big}
            className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl ring-1 ring-slate-200 transition active:scale-95 dark:ring-white/10"
            data-testid="picture-test-thumb"
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
          </button>
        )}
      </div>
      <div role="status" aria-live="polite" className="mt-1.5 text-xs">
        {busy ? (
          <p className="text-muted">Drawing a test picture…</p>
        ) : result?.ok ? (
          <p data-testid="picture-test-ok">{pictureTestLine(result)}</p>
        ) : result ? (
          <div data-testid="picture-test-failed">
            <p>{pictureTestLine(result)}</p>
            {result.detail && <p className="text-muted mt-0.5">Google said: “{result.detail}”</p>}
          </div>
        ) : failed ? (
          <p data-testid="picture-test-failed">{failed}</p>
        ) : (
          <p className="text-muted">{pictureTestNote(model, which === 'own' ? 'your' : 'Split Now’s')}</p>
        )}
      </div>
      {src && big && (
        <img
          src={src}
          alt="A ferry, drawn as a test"
          className="animate-fade mt-2 aspect-square w-40 rounded-2xl object-cover ring-1 ring-slate-200 dark:ring-white/10"
        />
      )}
    </div>
  )
}
