import { useToast } from '@/components/Toast'
import { repo } from '@/data'
import { errText } from '@/lib/errors'
import type { Group } from '@/types'

/**
 * Archive or unarchive a group for the signed-in person only (shared/archive.ts), with Undo on the
 * message after archiving: the group's menu and the Groups screen's swipe say the same.
 */
export function useGroupArchive() {
  const toast = useToast()
  const fail = (e: unknown) => toast(errText(e), 'err')
  return async (group: Group, archived: boolean) => {
    try {
      await repo.setArchived(group, archived)
      toast(
        archived ? `${group.name} archived for you` : `${group.name} restored`,
        'ok',
        archived ? { action: { label: 'Undo', run: () => void repo.setArchived(group, false).catch(fail) } } : undefined,
      )
    } catch (e) {
      fail(e)
    }
  }
}
