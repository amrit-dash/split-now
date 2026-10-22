export type EdgeFade = 'none' | 'start' | 'end' | 'both'

/**
 * Which ends of a sideways scrolling row get a fade: the ends that still have content past them.
 * A row that fits (or is a pixel over, from rounding) gets none, so short rows look as before.
 */
export function edgeFade({ scrollLeft, scrollWidth, clientWidth }: { scrollLeft: number; scrollWidth: number; clientWidth: number }): EdgeFade {
  const slack = 1
  if (!(clientWidth > 0) || scrollWidth - clientWidth <= slack) return 'none'
  const start = scrollLeft > slack
  const end = scrollLeft + clientWidth < scrollWidth - slack
  return start && end ? 'both' : start ? 'start' : end ? 'end' : 'none'
}
