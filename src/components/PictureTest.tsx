import { useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { repo } from '@/data'
import { errText } from '@/lib/errors'
import { pictureTestLine, pictureTestNote } from '@/lib/icon-ai'
import type { PictureTestResult } from '../../shared/icon-ai'

/**
 * Test pictures, under Model for pictures (Settings → AI features for one's own key, Admin → AI
 * for Split Now's): draws one real picture with exactly the chosen model, no fallback, and shows
 * it with the model, the time and the cost, or why Google refused in its own words. It says first
 * that the picture is billed.
 */
export function PictureTest({ which, model }: { which: 'own' | 'app'; model: string }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PictureTestResult | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    setResult(null)
    setFailed(null)
    try {
      setResult(await repo.pictureTest(which, model))
    } catch (e) {
      setFailed(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-3 space-y-2" data-testid={`picture-test-${which}`}>
      <p className="text-muted text-xs">{pictureTestNote(model, which === 'own' ? 'your' : 'Split Now’s')}</p>
      <button type="button" className="chip min-h-11" onClick={run} disabled={busy} data-testid="picture-test-run">
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImageIcon size={14} aria-hidden />}
        {busy ? 'Drawing a test picture…' : 'Test pictures'}
      </button>
      <div role="status" aria-live="polite">
        {result?.ok && (
          <div className="flex items-center gap-3" data-testid="picture-test-ok">
            <img
              src={`data:${result.mimeType};base64,${result.image}`}
              alt="A ferry, drawn as a test"
              className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-white/10"
            />
            <span className="text-sm">{pictureTestLine(result)}</span>
          </div>
        )}
        {result && !result.ok && (
          <div className="text-sm" data-testid="picture-test-failed">
            <p>{pictureTestLine(result)}</p>
            {result.detail && <p className="text-muted mt-1 text-xs">Google said: “{result.detail}”</p>}
          </div>
        )}
        {failed && (
          <p className="text-sm" data-testid="picture-test-failed">
            {failed}
          </p>
        )}
      </div>
    </div>
  )
}
