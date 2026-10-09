import { useEffect, useState } from 'react'
import { Bell, Database, Palette, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { repo } from '@/data'
import type { AiState, CaptureToken } from '@/data/repo'
import { useMe } from '@/hooks/auth'
import { useAiStatus } from '@/hooks/useAiStatus'
import { accentPreset, getAccent } from '@/lib/accent'
import { watchCapturePrefs } from '@/lib/capture-settings'
import { getTheme } from '@/lib/theme'
import { autoCaptureSummary, notificationSummary } from '@/lib/profileSummary'
import { isIOS, isStandalone, permission, pushSupported, type AllPrefs } from '@/lib/push'
import { notificationsAvailable } from '@/components/NotificationSettings'
import { SettingsPage, SettingsRow } from './common'

const THEME_LABEL = { system: 'Auto theme', light: 'Light', dark: 'Dark' } as const

/** /settings: one row per area, each with a one-line summary. */
export default function SettingsHome() {
  const { user, profile } = useMe()
  const aiStatus = useAiStatus()
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  const [tokens, setTokens] = useState<CaptureToken[] | null>(null)
  const [aiState, setAiState] = useState<AiState | null>(null)
  useEffect(() => watchCapturePrefs(user.uid, repo.mode, setPrefs), [user.uid])
  useEffect(() => repo.watchCaptureTokens(user.uid, setTokens), [user.uid])
  useEffect(() => (repo.mode === 'firebase' ? repo.watchAiState(user.uid, setAiState) : undefined), [user.uid])

  const notifications = !notificationsAvailable()
    ? repo.mode === 'demo'
      ? 'Not available in the demo'
      : 'Not available in this build'
    : notificationSummary({
        iosNeedsInstall: isIOS() && !isStandalone(),
        supported: pushSupported(),
        perm: permission(),
        prefs: prefs ?? { captures: true, unsorted: false, expenses: true, settlements: true, reminders: true, outsideTrips: false },
      })
  const automation = prefs?.capturePaused && tokens?.length ? 'Paused' : autoCaptureSummary(tokens)
  // The AI row's summary: on/off and what it's used for, and a warning only when no key can serve it.
  const ai = (() => {
    if (repo.mode !== 'firebase') return undefined
    if (!prefs) return 'Gemini reads bills, statements and hard-to-read SMS'
    if (!prefs.aiEnabled) return 'Off · bills are read on this phone'
    const uses = [prefs.aiImages && 'Bills & statements', prefs.aiSms && 'SMS'].filter(Boolean).join(', ')
    if (!uses) return 'On · nothing selected'
    const shared = prefs.aiSource !== 'own' && (aiStatus?.app.images === 'available' || aiStatus?.app.sms === 'available')
    const own = !!aiState?.hint && prefs.aiSource !== 'app'
    return `On · ${uses}${own || shared || aiStatus === undefined ? '' : ' · no key available'}`
  })()

  return (
    <SettingsPage title="Settings" back="/profile">
      <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" data-testid="settings-list">
        <SettingsRow
          to="/settings/preferences"
          icon={<Palette size={19} />}
          title="Preferences"
          testId="settings-preferences"
          summary={`${profile.currency} · ${THEME_LABEL[getTheme()]} · ${accentPreset(getAccent()).label}`}
        />
        <SettingsRow to="/settings/notifications" icon={<Bell size={19} />} title="Notifications" summary={notifications} testId="settings-notifications" />
        <SettingsRow
          to="/settings/automation"
          icon={<Zap size={19} />}
          title="Automation"
          summary={automation || 'Auto-capture and capture keys'}
          testId="settings-automation"
        />
        {repo.mode === 'firebase' && <SettingsRow to="/settings/ai" icon={<Sparkles size={19} />} title="AI features" summary={ai} testId="settings-ai" />}
        <SettingsRow
          to="/settings/data"
          icon={<Database size={19} />}
          title="Data"
          summary="Export, import from Splitwise, install the app"
          testId="settings-data"
        />
        {aiStatus?.admin && (
          <SettingsRow
            to="/admin"
            icon={<ShieldCheck size={19} />}
            title="Admin"
            summary="Switches, limits, usage, AI key and accounts"
            testId="settings-admin"
          />
        )}
      </div>
      <p className="text-muted mt-4 px-1 text-xs">Changes here save by themselves.</p>
    </SettingsPage>
  )
}
