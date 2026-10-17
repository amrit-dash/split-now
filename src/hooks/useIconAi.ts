import { repo } from '@/data'
import { useAiState } from '@/hooks/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useOnline } from '@/hooks/useOnline'
import { autoPickOffered, iconAiOffered, pictureCostFor, pictureOffer } from '@/lib/icon-ai'

/**
 * What the icon sheet offers here: "Suggest with AI" (src/lib/icon-ai.ts iconAiOffered),
 * "Draw a picture" with whose key pays (pictureOffer), and whether the automatic icon may ask AI
 * (autoPickOffered); none in a private group.
 */
export function useIconAi(vault: boolean): { suggest: boolean; picture: 'own' | 'app' | null; pictureCost: string; auto: boolean } {
  const flag = useFlag('aiIcons')
  const autoFlag = useFlag('aiIconAuto')
  const online = useOnline()
  const firebase = repo.mode === 'firebase'
  const prefs = useCapturePrefs()
  const aiState = useAiState(firebase)
  const status = useAiStatus()
  const o = { mode: firebase ? ('firebase' as const) : ('demo' as const), flag, online, vault, prefs, status, hasOwnKey: !!aiState?.hint }
  // A picture is offered only where suggestions are (its keys are a subset), so the sheet shows both in one box.
  const picture = pictureOffer(o)
  // What the sheet says a picture costs: the model the paying key draws with.
  const pictureCost = pictureCostFor({ via: picture, ownModel: prefs?.aiPictureModel, appModel: status?.app.pictureModel })
  return { suggest: iconAiOffered(o), picture, pictureCost, auto: autoPickOffered({ ...o, flag: autoFlag }) }
}
