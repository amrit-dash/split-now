import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => {
  addEventListener('online', cb)
  addEventListener('offline', cb)
  return () => { removeEventListener('online', cb); removeEventListener('offline', cb) }
}
const snapshot = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
const serverSnapshot = () => true

/** Whether the browser thinks it has a connection (navigator.onLine, kept live). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
