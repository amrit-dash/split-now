import { repo } from '@/data'
import { useAiState } from '@/hooks/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useOnline } from '@/hooks/useOnline'
import { iconAiOffered, pictureOffer } from '@/lib/icon-ai'

/**
 * What the icon sheet offers here: "Suggest with AI" (src/lib/icon-ai.ts iconAiOffered) and
 * "Draw a picture" with whose key pays (pictureOffer); neither in a private group.
 */
export function useIconAi(vault: boolean): { suggest: boolean; picture: 'own' | 'app' | null } {
  const flag = useFlag('aiIcons')
  const online = useOnline()
  const firebase = repo.mode === 'firebase'
  const prefs = useCapturePrefs()
  const aiState = useAiState(firebase)
  const status = useAiStatus()
  const o = { mode: firebase ? ('firebase' as const) : ('demo' as const), flag, online, vault, prefs, status, hasOwnKey: !!aiState?.hint }
  // A picture is offered only where suggestions are (its keys are a subset), so the sheet shows both in one box.
  return { suggest: iconAiOffered(o), picture: pictureOffer(o) }
}
