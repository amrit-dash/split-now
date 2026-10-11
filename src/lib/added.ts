/*
 * "Added by Ananya on 7 Oct 2026, 6:45 pm · edited 8 Oct": when something was written into the
 * app (createdAt) and by whom, which can be days after the date it was spent. Shown on an
 * expense and an open item.
 */

/** An edit within this long of the add (the same sitting, a sync) isn't worth a mention. */
export const EDIT_QUIET_MS = 2 * 60_000

export function addedLine(
  x: { createdAt: number; updatedAt?: number },
  who: string | undefined,
  fmt: { dateTime: (ms: number) => string; date: (ms: number) => string },
): string {
  const by = who ? ` by ${who}` : ''
  const head = `Added${by} on ${fmt.dateTime(x.createdAt)}`
  return x.updatedAt && x.updatedAt - x.createdAt > EDIT_QUIET_MS ? `${head} · edited ${fmt.date(x.updatedAt)}` : head
}
