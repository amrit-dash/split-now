/*
 * What the tab bar's + does on each screen. Inside a group it's for that group: a tap opens Add
 * expense for it straight away (what people do there nearly every time). Elsewhere a tap opens the
 * Create sheet (Quick add, New group, Scan). Press and hold talks to Quick add where the phone can
 * hear (src/components/PlusButton.tsx); without voice a hold opens the sheet, as it used to.
 */

/** The group a screen belongs to: /groups/:id and everything under it (not New group or Import). */
export function groupOfPath(pathname: string): string | undefined {
  const m = pathname.match(/^\/groups\/([^/]+)/)
  if (!m || m[1] === 'new' || m[1] === 'import') return undefined
  try {
    return decodeURIComponent(m[1])
  } catch {
    return undefined
  }
}

export type PlusAction = { kind: 'add'; to: string } | { kind: 'sheet' }

/** A tap on + on this screen. */
export function plusTap(pathname: string): PlusAction {
  const g = groupOfPath(pathname)
  return g ? { kind: 'add', to: `/add?group=${encodeURIComponent(g)}` } : { kind: 'sheet' }
}
