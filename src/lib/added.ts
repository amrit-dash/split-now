/*
 * "Added by Ananya on 7 Oct 2026, 6:45 pm · edited by Rahul on 8 Oct": when something was written
 * into the app (createdAt) and by whom, which can be days after the date it was spent, and who
 * changed it last. Shown on an expense and an open item.
 */

/** An edit by the person who added it, within this long of the add (the same sitting, a sync), isn't worth a mention. */
export const EDIT_QUIET_MS = 2 * 60_000

/**
 * `who` names the person who added it; `editor` the one who edited it last (expenses record it as
 * updatedBy; older ones and open items don't, and then the edit is mentioned without a name).
 * Someone else's edit is always mentioned, however soon after: it's the one people need to know.
 */
export function addedLine(
  x: { createdAt: number; updatedAt?: number; createdBy?: string; updatedBy?: string },
  who: string | undefined,
  fmt: { dateTime: (ms: number) => string; date: (ms: number) => string },
  editor?: string,
): string {
  const by = who ? ` by ${who}` : ''
  const head = `Added${by} on ${fmt.dateTime(x.createdAt)}`
  if (!x.updatedAt || x.updatedAt <= x.createdAt) return head
  const someoneElse = !!x.updatedBy && !!x.createdBy && x.updatedBy !== x.createdBy
  if (!someoneElse && x.updatedAt - x.createdAt <= EDIT_QUIET_MS) return head
  return editor ? `${head} · edited by ${editor} on ${fmt.date(x.updatedAt)}` : `${head} · edited ${fmt.date(x.updatedAt)}`
}
