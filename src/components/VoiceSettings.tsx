import { useFlag } from '@/hooks/useAppConfig'
import { useVoiceSetup } from '@/hooks/useVoice'
import type { AiSource } from '@/lib/ai-config'
import { HintText, InfoTip, type Hint } from './Hint'
import { Select } from './Select'
import { Switch } from './Switch'

const KEY_OPTIONS: Array<{ value: AiSource; label: string; hint: string }> = [
  { value: 'auto', label: 'Automatic', hint: 'Your key first, then Split Now’s' },
  { value: 'own', label: 'Own key', hint: 'Only your own Gemini key' },
  { value: 'app', label: 'Split Now’s key', hint: 'Only Split Now’s transcription key' },
]

/**
 * Settings → AI features → Voice: "Transcribe with AI", the one place for it (owner: not in
 * Preferences too), and which key it uses. Shown only while the admin's switch is on; with Split Now's
 * transcription key open to everyone anyone can turn it on, otherwise only someone with their own
 * Gemini key. Turning it off always works.
 */
export function VoiceAiSection({
  prefs,
  set,
}: {
  prefs: { aiTranscribe: boolean; aiTranscribeKey: AiSource }
  set: (p: { aiTranscribe?: boolean; aiTranscribeKey?: AiSource }) => void
}) {
  const flag = useFlag('aiTranscribe')
  const quickAdd = useFlag('quickAdd')
  const { offer } = useVoiceSetup()
  if (!flag || !quickAdd) return null
  const text: Hint = prefs.aiTranscribe
    ? {
        full: 'What you say to Quick add is recorded and written down by Google’s Flash-Lite, then waits in the box for you to send.',
        short: 'Flash-Lite writes down what you say',
        tier: 'help',
      }
    : { full: 'Off: your phone’s own speech recognition hears you, free.', short: 'Off: your phone listens', tier: 'help' }
  const can = offer.ai || prefs.aiTranscribe
  return (
    <div className="space-y-3" data-testid="ai-voice">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center font-semibold">
            Transcribe with AI
            <InfoTip hint={text} label="About transcribe with AI" />
          </div>
          <HintText hint={text} as="div" className="text-muted text-sm" />
          {!offer.ai && offer.why && (
            <p className="text-muted mt-1 text-xs" data-testid="ai-voice-why">
              {offer.why}
            </p>
          )}
        </div>
        <Switch checked={prefs.aiTranscribe} onChange={(v) => set({ aiTranscribe: v })} label="Transcribe with AI" testId="ai-transcribe" disabled={!can} />
      </div>
      {prefs.aiTranscribe && (
        <div>
          <div className="label">Which key</div>
          <Select
            aria-label="Which key for transcription"
            value={prefs.aiTranscribeKey}
            onChange={(v) => set({ aiTranscribeKey: v as AiSource })}
            options={KEY_OPTIONS}
          />
        </div>
      )}
    </div>
  )
}
