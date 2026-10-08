import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { aiAvailability } from '@/lib/ai-copy'
import { aiScanEnabled, aiScanPossible, setAiScan } from '@/lib/ai'
import { savePrefs, watchPrefs, type AllPrefs } from '@/lib/push'
import { Switch } from './Switch'

/**
 * "Read with AI" switch under the scan buttons. It only moves the bills switch (`aiImages`),
 * never the master switch: someone who turned AI off in Settings to keep SMS on the phone must
 * not get SMS reading back from here. Hidden in demo mode and when nothing can read with AI.
 */
export function AiScanToggle({ className = '' }: { className?: string }) {
  const { user } = useMe()
  const status = useAiStatus()
  const aiImages = useFlag('aiImages')
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  const [on, setOn] = useState(aiScanEnabled)
  const [hasKey, setHasKey] = useState(false)
  // Follow the account's choice as it arrives (the local flag is only a synchronous mirror).
  useEffect(
    () =>
      aiScanPossible()
        ? watchPrefs(user.uid, (p) => {
            setPrefs(p)
            setOn(p.aiEnabled && p.aiImages)
          })
        : undefined,
    [user.uid],
  )
  useEffect(() => (aiScanPossible() ? repo.watchAiState(user.uid, (s) => setHasKey(!!s?.hint)) : undefined), [user.uid])
  if (!aiScanPossible()) return null

  // The admin's switch (config/app flags.aiImages): the server answers "off" too; this is the clearer line, not a gate.
  if (!aiImages) {
    return (
      <p className={`text-muted flex items-center gap-2 text-xs ${className}`} data-testid="ai-scan-off">
        <Sparkles size={14} className="shrink-0 text-brand-500" aria-hidden />
        <span>Reading bills with AI is switched off for everyone right now</span>
      </p>
    )
  }

  const avail = aiAvailability({ status, hasOwnKey: hasKey, enabled: true })
  if (status !== undefined && !avail.images) {
    return (
      <p className={`text-muted flex items-center gap-2 text-xs ${className}`}>
        <Sparkles size={14} className="shrink-0 text-brand-500" aria-hidden />
        <span>
          Read on this phone.{' '}
          {status?.admin ? (
            <Link to="/settings/admin" className="font-semibold text-brand-600 dark:text-brand-300">
              Set up AI reading
            </Link>
          ) : (
            <Link to="/settings/ai" className="font-semibold text-brand-600 dark:text-brand-300">
              AI settings
            </Link>
          )}
        </span>
      </p>
    )
  }
  if (prefs && !prefs.aiEnabled) {
    return (
      <p className={`text-muted flex items-center gap-2 text-xs ${className}`}>
        <Sparkles size={14} className="shrink-0 text-brand-500" aria-hidden />
        <span>
          AI reading is off in{' '}
          <Link to="/settings/ai" className="font-semibold text-brand-600 dark:text-brand-300">
            Settings
          </Link>
          , so bills are read on this phone.
        </span>
      </p>
    )
  }
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Sparkles size={16} className="shrink-0 text-brand-500" aria-hidden />
      <div className="text-muted min-w-0 flex-1 text-xs leading-snug">
        <span className="font-semibold text-slate-700 dark:text-slate-200">Read with AI</span>
        {on ? ' · the photo is sent to Google Gemini to read items and taxes' : ' · off, read on this phone only (less accurate)'}
      </div>
      <Switch
        checked={on}
        label="Read bills with AI"
        testId="ai-scan"
        onChange={(v) => {
          setAiScan(v)
          setOn(v)
          void savePrefs(user.uid, { aiImages: v })
        }}
      />
    </div>
  )
}
