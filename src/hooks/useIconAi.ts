import { repo } from '@/data'
import { useAiState } from '@/hooks/data'
import { useAiStatus } from '@/hooks/useAiStatus'
import { useFlag } from '@/hooks/useAppConfig'
import { useCapturePrefs } from '@/hooks/useCapturePrefs'
import { useOnline } from '@/hooks/useOnline'
import { iconAiOffered } from '@/lib/icon-ai'

/** Whether the icon sheet offers "Suggest with AI" here (src/lib/icon-ai.ts iconAiOffered); never in a private group. */
export function useIconAiOffered(vault: boolean): boolean {
  const flag = useFlag('aiIcons')
  const online = useOnline()
  const firebase = repo.mode === 'firebase'
  const prefs = useCapturePrefs()
  const aiState = useAiState(firebase)
  const status = useAiStatus()
  return iconAiOffered({ mode: firebase ? 'firebase' : 'demo', flag, online, vault, prefs, status, hasOwnKey: !!aiState?.hint })
}
