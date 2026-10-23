import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAiState } from '@/hooks/data'
import { useMe } from '@/hooks/auth'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useSimple } from '@/hooks/useMode'
import { aiAvailability } from '@/lib/ai-copy'
import { aiScanEnabled, aiScanPossible, setAiScan } from '@/lib/ai'
import { savePrefs, watchPrefs, type AllPrefs } from '@/lib/push'
import { type ScanCardKind, scanAiButton, scanAiTitle, scanAiToggledText, scanAiWhyLink, scanAiWhyText, scanReader } from '@/lib/scan-ai'
import { AiReadIcon } from './icons'
import { type Hint, HintText, InfoTip } from './Hint'
import { Switch } from './Switch'
import { useToast } from './Toast'

/**
 * The "Read with AI" setting as the scan screens see it. It only moves the bills switch
 * (`aiImages`), never the master switch: someone who turned AI off in Settings to keep SMS on the
 * phone must not get SMS reading back from here.
 */
function useAiScanSetting() {
  const { user } = useMe()
  const status = useAiStatus()
  const aiImages = useFlag('aiImages')
  const [prefs, setPrefs] = useState<AllPrefs | null>(null)
  const [on, setOn] = useState(aiScanEnabled)
  const aiState = useAiState(aiScanPossible())
  const hasKey = !!aiState?.hint
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
  // A broken own key can't read anything: count it out, as Statement always did.
  const avail = aiAvailability({ status, hasOwnKey: hasKey, ownKeyBroken: !!aiState?.lastError, enabled: true, freeOk: prefs?.aiFreeOk })
  const set = (v: boolean) => {
    setAiScan(v)
    setOn(v)
    void savePrefs(user.uid, { aiImages: v })
  }
  return { status, aiImages, prefs, on, set, avail, available: status === undefined ? undefined : avail.images }
}

/**
 * One Scan card's view of Read with AI: the corner button and who reads what is picked. The card,
 * its corner button and the line under its buttons share this one instance, so switching the
 * button changes the line at once. A card reads with AI only when the button would be 'on'.
 */
export function useScanAi(kind: ScanCardKind, deviceFirst = false) {
  const s = useAiScanSetting()
  const simple = useSimple()
  const input = {
    kind,
    demo: !aiScanPossible(),
    adminOn: s.aiImages,
    available: s.available,
    masterOn: s.prefs ? s.prefs.aiEnabled : undefined,
    on: s.on,
  }
  return { kind, s, button: scanAiButton({ ...input, simple }), reader: scanReader({ ...input, deviceFirst }) }
}

export type ScanAi = ReturnType<typeof useScanAi>

/**
 * Read with AI as an icon button in the top-right corner of a Scan card. A real toggle
 * (aria-pressed, a filled brain with "AI on" vs a line one with "AI off"); when AI can't read here
 * it stays, and a tap says why. Hidden on Payment (read on the phone only) and in Simple.
 */
export function ScanAiCorner({ ai, disabled }: { ai: ScanAi; disabled?: boolean }) {
  const { s, kind, button: b } = ai
  const toast = useToast()
  const nav = useNavigate()
  if (!b.show) return null
  const on = b.state === 'on'
  const onClick = () => {
    if (b.state === 'unavailable') {
      const link = scanAiWhyLink(b.why, !!s.status?.admin)
      toast(scanAiWhyText(b.why, kind), 'ok', link ? { action: { label: link.label, run: () => nav(link.to) } } : {})
      return
    }
    s.set(!on)
    toast(scanAiToggledText(!on))
  }
  // Top-right inside the card's padding: the state in words on the left (never colour alone), the
  // switch itself a round icon button, filled in the accent when on.
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={b.state === 'unavailable' ? 'Read with AI, not available here' : 'Read with AI'}
      title={scanAiTitle(b)}
      disabled={disabled}
      onClick={onClick}
      data-testid="scan-ai"
      data-state={b.state}
      className="group absolute top-2 right-2 z-10 flex h-11 items-center gap-1.5 rounded-full pl-2 disabled:opacity-40"
    >
      <span aria-hidden className={`text-xs font-semibold ${on ? 'text-brand-700 dark:text-brand-300' : 'text-muted'}`}>
        {on ? 'AI on' : 'AI off'}
      </span>
      <span
        aria-hidden
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 group-active:scale-95 motion-reduce:transition-none ${
          on
            ? 'bg-fill text-on-fill shadow-sm'
            : `bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-ink-800 dark:text-slate-400 dark:ring-white/10 ${b.state === 'unavailable' ? 'opacity-60' : ''}`
        }`}
      >
        <AiReadIcon size={20} solid={on} />
      </span>
    </button>
  )
}

/**
 * "Read with AI" switch under the scan buttons of a Live table's bill (SplitBill). Scan itself uses
 * ScanAiCorner. Hidden in demo mode and when nothing can read with AI.
 */
export function AiScanToggle({ className = '' }: { className?: string }) {
  const { status, aiImages, prefs, on, set, avail } = useAiScanSetting()
  if (!aiScanPossible()) return null

  // The admin's switch (config/app flags.aiImages): the server answers "off" too; this is the clearer line, not a gate.
  if (!aiImages) {
    return (
      <p className={`text-muted flex items-center gap-2 text-xs ${className}`} data-testid="ai-scan-off">
        <Sparkles size={14} className="shrink-0 text-brand-500" aria-hidden />
        <span>Reading bills with AI is off for everyone right now</span>
      </p>
    )
  }

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
  // Key: where the photo goes is a privacy line, so every look keeps a short form of it.
  const hint: Hint = on
    ? { full: 'the photo goes to Google Gemini to read items and taxes', short: 'the photo goes to Google Gemini', tier: 'key' }
    : { full: 'off, read on this phone only, less accurately', short: 'off, read on this phone', tier: 'key' }
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Sparkles size={16} className="shrink-0 text-brand-500" aria-hidden />
      <div className="text-muted min-w-0 flex-1 text-xs leading-snug">
        <span className="font-semibold text-slate-700 dark:text-slate-200">Read with AI</span>
        <InfoTip hint={hint} label="About reading with AI" />
        {' · '}
        <HintText hint={hint} as="span" />
      </div>
      <Switch checked={on} label="Read bills with AI" testId="ai-scan" onChange={set} />
    </div>
  )
}
