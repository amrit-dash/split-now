/*
 * A new version that's downloaded and waiting (src/components/UpdatePrompt.tsx registers the
 * service worker and reports it here). The banner above the tab bar offers it once; Later hides
 * the banner, not the update: Profile keeps an Update row until the app reloads into it. Pure
 * state and a tiny subscribe, so the banner and Profile read the same thing.
 */

export interface UpdateState {
  /** a new version is downloaded and waiting */
  ready: boolean
  /** the banner was put off with Later (or a swipe); Profile still offers it */
  later: boolean
}

let state: UpdateState = { ready: false, later: false }
const listeners = new Set<() => void>()
let run: (() => void) | null = null

export const getUpdate = () => state
export function subscribeUpdate(cb: () => void) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}
function set(next: UpdateState) {
  if (next.ready === state.ready && next.later === state.later) return
  state = next
  for (const l of listeners) l()
}

/** The worker says whether a version is waiting; a new one shows the banner again. */
export const setUpdateReady = (ready: boolean) => set({ ready, later: ready ? state.later : false })
/** Later: the banner goes, the update stays on offer in Profile. */
export const putUpdateOff = () => set({ ...state, later: true })
/** How to apply it (the banner registers its skip-waiting handshake). */
export const registerUpdater = (fn: (() => void) | null) => {
  run = fn
}
export const applyUpdate = () => run?.()

/** The banner shows while a version waits and hasn't been put off. */
export const bannerShown = (s: UpdateState) => s.ready && !s.later
/** Profile's row shows while a version waits, put off or not. */
export const profileRowShown = (s: UpdateState) => s.ready
