import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useVoiceSetup } from '@/hooks/useVoice'
import type { AiSource } from '@/lib/ai-config'
import { savePrefs } from '@/lib/push'
import { transcriptionView, type Transcription } from '@/lib/voice'
import { HintText, InfoTip, type Hint } from './Hint'
import { MicIcon, SparkleIcon } from './icons'
import { Segmented } from './Misc'
import { Select } from './Select'
import { Switch } from './Switch'

const TRANSCRIPTION_HINT: Record<Transcription, Hint> = {
  native: { full: 'Your phone’s own speech recognition hears you. Free.', short: 'Your phone listens, free', tier: 'help' },
  ai: {
    full: 'Your voice is recorded and sent to Google’s Flash-Lite to be written down. Better with names and mixed languages.',
    short: 'Flash-Lite writes down what you say',
    tier: 'help',
  },
}

const KEY_OPTIONS: Array<{ value: AiSource; label: string; hint: string }> = [
  { value: 'auto', label: 'Automatic', hint: 'Your key first, then Split Now’s' },
  { value: 'own', label: 'Own key', hint: 'Only your own Gemini key' },
  { value: 'app', label: 'Split Now’s key', hint: 'Only Split Now’s transcription key' },
]

/**
 * Settings → Preferences → Voice: Transcription, Native or AI (src/lib/voice.ts transcriptionView).
 * Native is the default, free. AI is offered only when the admin's switch is on and a key can serve
 * this person; otherwise Native shows alone with the reason. One setting with Settings → AI features
 * → Transcribe with AI (aiTranscribe). In both Simple and Advanced: voice follows Quick add.
 */
export function TranscriptionSetting({ onSaved }: { onSaved?: () => void }) {
  const { user } = useMe()
  const quickAdd = useFlag('quickAdd')
  const prefs = useCapturePrefs()
  const { offer, aiChosen, nativeOk } = useVoiceSetup()
  if (!quickAdd) return null
  const view = transcriptionView({ offer, aiChosen, nativeOk })
  const pick = (v: Transcription) => {
    if (v === view.value || repo.mode !== 'firebase' || !prefs) return
    void savePrefs(user.uid, { aiTranscribe: v === 'ai' }).then(onSaved)
  }
  return (
    <div data-testid="transcription">
      <div className="label flex items-center" id="transcription-label">
        Transcription
        <InfoTip hint={TRANSCRIPTION_HINT[view.value]} label="About transcription" />
      </div>
      <Segmented<Transcription>
        label="Transcription"
        testId="transcription-choice"
        value={view.value}
        onChange={pick}
        options={view.options.map((o) => ({
          value: o,
          label: (
            <span className="inline-flex items-center gap-1">
              {o === 'native' ? <MicIcon size={16} aria-hidden /> : <SparkleIcon size={16} aria-hidden />} {o === 'native' ? 'Native' : 'AI'}
            </span>
          ),
        }))}
      />
      <HintText hint={TRANSCRIPTION_HINT[view.value]} className="text-muted mt-1.5 text-xs" />
      {view.note && (
        <p className="text-muted mt-1 text-xs" data-testid="transcription-note">
          {view.note}
        </p>
      )}
    </div>
  )
}

/**
 * Settings → AI features → Voice: "Transcribe with AI" (the same setting as Preferences →
 * Transcription) and which key it uses. Shown only while the admin's switch is on; with Split Now's
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
