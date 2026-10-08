import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { aiScanEnabled, aiScanPossible, setAiScan } from '@/lib/ai'
import { savePrefs } from '@/lib/push'
import { Switch } from './Switch'

/** "Read bills with AI" switch shown under the scan buttons. Hidden in demo mode. */
export function AiScanToggle({ className = '' }: { className?: string }) {
  const { user } = useMe()
  const [on, setOn] = useState(aiScanEnabled)
  if (!aiScanPossible()) return null
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Sparkles size={16} className="shrink-0 text-brand-500" aria-hidden />
      <div className="min-w-0 flex-1 text-xs leading-snug text-slate-500">
        <span className="font-semibold text-slate-700 dark:text-slate-200">Read with AI</span>
        {on ? ' · the photo is sent to Google Gemini to read items and taxes' : ' · off, read on this phone only (less accurate)'}
      </div>
      <Switch checked={on} label="Read bills with AI" testId="ai-scan" onChange={(v) => { setAiScan(v); setOn(v); void savePrefs(user.uid, { aiImages: v }) }} />
    </div>
  )
}
