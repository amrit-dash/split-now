/*
 * The admin console's Logs tab (src/pages/admin/Logs.tsx): the functions to pick from, how each
 * level looks, and the app error reports' filters. Pure. The server side is
 * functions/src/logs.ts (Cloud Logging) and the appErrors collection (src/lib/app-errors.ts).
 */

/** Every Cloud Function, as exported by functions/src/index.ts (a test keeps the two equal). */
export const FUNCTION_NAMES = [
  'adminBlockUser',
  'adminLogs',
  'adminPurgeGroup',
  'adminSetAdmin',
  'adminStats',
  'adminUsers',
  'adoptGuest',
  'aiKey',
  'aiModels',
  'aiStatus',
  'capture',
  'claimEmail',
  'claimGuestLinks',
  'cleanupCaptures',
  'dailyReminders',
  'decideMerge',
  'deleteAccount',
  'fxDaily',
  'fxMorning',
  'iconPickAi',
  'iconPictureAi',
  'iconsAi',
  'joinApproval',
  'linkMyInvites',
  'linkPreview',
  'mergeAccount',
  'mergeMembers',
  'nudge',
  'onAdminMarkChanged',
  'onChatMessageCreated',
  'onExpenseCreated',
  'onExpenseUpdated',
  'onGroupDeleted',
  'onGroupJoined',
  'onGroupMembersLink',
  'onGroupTrashed',
  'onOpenItemWritten',
  'onPayLinkPaid',
  'onProfileShared',
  'onPushTokenCreated',
  'onSettlementCreated',
  'onSettlementUpdated',
  'parseReceiptAi',
  'pictureTest',
  'purgeDeletedGroups',
  'quickAddAi',
  'refreshFx',
  'removeEmail',
  'transcribeAi',
  'vault',
] as const

/** Cloud Run names a service after the function, lower-cased: back to the function's own name. */
export const functionLabel = (service: string): string => FUNCTION_NAMES.find((f) => f.toLowerCase() === service) ?? service

export type LevelTone = 'error' | 'warn' | 'info' | 'debug'

export function levelTone(severity: string): LevelTone {
  if (/^(ERROR|CRITICAL|ALERT|EMERGENCY)$/.test(severity)) return 'error'
  if (severity === 'WARNING') return 'warn'
  if (/^(INFO|NOTICE)$/.test(severity)) return 'info'
  return 'debug'
}

export const TIME_RANGES = [
  { hours: 1, label: 'Last hour' },
  { hours: 24, label: 'Last day' },
  { hours: 168, label: 'Last 7 days' },
  { hours: 720, label: 'Last 30 days' },
] as const

export interface AppErrorRow {
  id: string
  uid: string
  at: number
  kind: string
  message: string
  stack?: string
  route?: string
  version?: string
  ua?: string
  mode?: string
}

/** Words anywhere in a report (message, stack, screen, version, browser, account). */
export function matchesText(r: AppErrorRow, text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return true
  return [r.message, r.stack, r.route, r.version, r.ua, r.uid, r.kind].some((v) => v?.toLowerCase().includes(t))
}

/** An entry as text, to copy into a bug report. */
export const asCopyText = (v: unknown): string => {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
