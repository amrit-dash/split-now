import { useFlag } from '@/hooks/useAppConfig'
import { useVoiceSetup } from '@/hooks/useVoice'
import { HintText, InfoTip, type Hint } from './Hint'
import { Segmented } from './Misc'
import { useToast } from './Toast'

type Listener = 'phone' | 'ai'

/**
 * Settings → AI features → Voice: who turns speech into text, the phone or AI, as one choice (the one
 * place for it; owner: not in Preferences too). No "which key": AI uses the person's own Gemini key
 * first, then Split Now's transcription key (shared/transcribe.ts); with neither, AI can't be picked
 * and the line under says to add their own key. Shown only while the admin's switch is on. Phone
 * always works, and keeps showing the words live as they talk.
 */
export function VoiceAiSection({ prefs, set }: { prefs: { aiTranscribe: boolean }; set: (p: { aiTranscribe?: boolean }) => void }) {
  const flag = useFlag('aiTranscribe')
  const quickAdd = useFlag('quickAdd')
  const { offer } = useVoiceSetup()
  const toast = useToast()
  if (!flag || !quickAdd) return null
  const value: Listener = prefs.aiTranscribe ? 'ai' : 'phone'
  const text: Hint =
    value === 'ai'
      ? {
          full: 'What you say to Quick add is recorded and written down by Google’s Flash-Lite, with your own Gemini key first, then Split Now’s. It waits in the box for you to send.',
          short: 'Flash-Lite writes it down, your key first',
          tier: 'help',
        }
      : { full: 'Your phone’s own speech recognition hears you, free, and shows the words as you talk.', short: 'Your phone listens, free', tier: 'help' }
  const pick = (v: Listener) => {
    if (v === 'ai' && !offer.ai && !prefs.aiTranscribe) {
      // Not available to them: the choice stays on Phone and says why.
      toast(offer.why ?? 'AI transcription isn’t available right now.', 'err')
      return
    }
    set({ aiTranscribe: v === 'ai' })
  }
  return (
    <div className="space-y-2" data-testid="ai-voice">
      <div className="flex items-center font-semibold">
        Turn speech into text with
        <InfoTip hint={text} label="About voice" />
      </div>
      <Segmented<Listener>
        value={value}
        onChange={pick}
        label="Turn speech into text with"
        testId="ai-transcribe"
        options={[
          { value: 'phone', label: 'Phone' },
          { value: 'ai', label: 'AI' },
        ]}
      />
      <HintText hint={text} as="div" className="text-muted text-sm" />
      {!offer.ai && offer.why && value === 'phone' && (
        <p className="text-muted text-xs" data-testid="ai-voice-why">
          {offer.why}
        </p>
      )}
    </div>
  )
}
