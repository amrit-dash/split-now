import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useMe } from '@/hooks/auth'
import { setAiScan } from '@/lib/ai'
import { DEFAULT_ALL_PREFS, savePrefs, watchPrefs, type AllPrefs } from '@/lib/push'
import { Switch } from './Switch'

/** Profile → AI reading: Gemini for bill photos / statements and for SMS the parser can't read. */
export function AiSettings() {
  const { user } = useMe()
  const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_ALL_PREFS)
  useEffect(() => watchPrefs(user.uid, setPrefs), [user.uid])
  const set = (patch: Partial<AllPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }))
    if (patch.aiImages !== undefined) setAiScan(patch.aiImages)
    void savePrefs(user.uid, patch)
  }
  return (
    <div className="space-y-4">
      <Row title="Bills & statements" testId="ai-images" checked={prefs.aiImages} onChange={(v) => set({ aiImages: v })}
        text={prefs.aiImages ? 'Photos are sent to Google Gemini to read items, taxes and transactions.' : 'Bills are read on this phone (less accurate). Statement import needs AI.'} />
      <Row title="Bank SMS the app can’t read" testId="ai-sms" checked={prefs.aiSms} onChange={(v) => set({ aiSms: v })}
        text={prefs.aiSms ? 'Only messages the built-in reader misses go to Gemini.' : 'Unreadable messages are skipped.'} />
      <p className="flex items-start gap-1.5 text-xs text-slate-500"><Sparkles size={12} className="mt-0.5 shrink-0 text-brand-500" />Nothing is stored by the AI step; results show up for you to check before anything is saved.</p>
    </div>
  )
}

function Row({ title, text, checked, onChange, testId }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-slate-500">{text}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} testId={testId} />
    </div>
  )
}
