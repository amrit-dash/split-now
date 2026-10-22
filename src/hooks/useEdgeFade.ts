import { useCallback } from 'react'
import { edgeFade } from '@/lib/edge-fade'

/**
 * A callback ref for a sideways scrolling row: sets data-fade (start / end / both) while it
 * overflows, which index.css turns into a soft mask at those ends. It follows scrolling, resizes and
 * chips coming and going, and writes the attribute directly, so scrolling never re-renders.
 */
export function useEdgeFade() {
  return useCallback((el: HTMLElement | null) => (el ? watchEdgeFade(el) : undefined), [])
}

export function watchEdgeFade(el: HTMLElement): () => void {
  let frame = 0
  const update = () => {
    frame = 0
    const f = edgeFade(el)
    if (f === 'none') el.removeAttribute('data-fade')
    else if (el.dataset.fade !== f) el.dataset.fade = f
  }
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  update()
  el.addEventListener('scroll', queue, { passive: true })
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queue)
  const observeAll = () => {
    if (!ro) return
    ro.disconnect()
    ro.observe(el)
    for (const c of el.children) ro.observe(c)
  }
  observeAll()
  const mo =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          observeAll()
          queue()
        })
  mo?.observe(el, { childList: true })
  return () => {
    cancelAnimationFrame(frame)
    el.removeEventListener('scroll', queue)
    ro?.disconnect()
    mo?.disconnect()
    el.removeAttribute('data-fade')
  }
}
