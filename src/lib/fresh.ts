/**
 * Groups created on this device moments ago. Firestore writes are fire-and-forget, so a screen
 * opened right after a create can start its server listen before the create lands; the rules
 * (which read the group doc) then refuse it, the SDK ends the listener and the group reads as
 * "not found" (lists as empty) for good. For a fresh group we don't trust that and listen again.
 */
type Unsub = () => void

export const FRESH_MS = 30_000
// Re-listens for list watchers (expenses, payments, activity), in ms after the create.
const REWATCH_AT = [1_500, 5_000, 15_000]

const created = new Map<string, number>()

export function markCreated(id: string, at = Date.now()) { created.set(id, at) }

const ageOf = (id: string) => { const t = created.get(id); return t === undefined ? Infinity : Date.now() - t }
export const isFresh = (id: string) => ageOf(id) < FRESH_MS

/** Watches one group; while it's fresh, a `null` (missing or refused) retries with backoff instead of being passed on. */
export function watchGroupSettled<G>(watch: (id: string, cb: (g: G | null) => void) => Unsub, id: string, cb: (g: G | null) => void): Unsub {
  let unsub: Unsub | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let gen = 0
  let tries = 0
  const start = () => {
    const mine = ++gen
    unsub = watch(id, (g) => {
      if (mine !== gen) return
      if (g === null && isFresh(id)) {
        gen++ // ignore this listener; the timer replaces it
        timer = setTimeout(() => { unsub?.(); start() }, Math.min(250 * 2 ** tries++, 4_000))
        return
      }
      cb(g)
    })
  }
  start()
  return () => { gen++; clearTimeout(timer); unsub?.() }
}

/** Runs a list watcher; for a fresh group it's restarted a few times, as its first listens may have been refused. */
export function rewatchWhileFresh(id: string, start: () => Unsub): Unsub {
  let unsub = start()
  const age = ageOf(id)
  const timers = age < FRESH_MS ? REWATCH_AT.filter((t) => t > age).map((t) => setTimeout(() => { unsub(); unsub = start() }, t - age)) : []
  return () => { timers.forEach(clearTimeout); unsub() }
}
