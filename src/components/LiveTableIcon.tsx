import { forwardRef, type ReactElement } from 'react'
import IconBase from '@phosphor-icons/react/dist/lib/IconBase'
import type { IconProps, IconWeight } from '@phosphor-icons/react/dist/lib/types'

/*
 * Live table: two people at a table with a serving dome between them, a shared meal rather than
 * cutlery (the fork and knife read as "restaurants") or a call bell (reads as "ring for
 * service"). Drawn on Phosphor's 256 grid with its 16-unit line and round ends, so it sits with
 * the other tab icons in both weights; it goes through Phosphor's IconBase, so it follows the
 * icon style like they do.
 */

const line = { stroke: 'currentColor', strokeWidth: 16, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const

const outline = (
  <g {...line}>
    <circle cx="44" cy="76" r="22" />
    <circle cx="212" cy="76" r="22" />
    <path d="M12,152a32,32,0,0,1,64,0" />
    <path d="M180,152a32,32,0,0,1,64,0" />
    <path d="M88,152a40,40,0,0,1,80,0" />
    <path d="M128,112V100" />
    <path d="M16,184H240" />
    <path d="M60,184v32M196,184v32" />
  </g>
)

const tint = (
  <g fill="currentColor" opacity="0.2">
    <circle cx="44" cy="76" r="22" />
    <circle cx="212" cy="76" r="22" />
    <path d="M12,152a32,32,0,0,1,64,0Z" />
    <path d="M180,152a32,32,0,0,1,64,0Z" />
    <path d="M88,152a40,40,0,0,1,80,0Z" />
  </g>
)

const solid = (
  <>
    <g fill="currentColor">
      <circle cx="44" cy="72" r="30" />
      <circle cx="212" cy="72" r="30" />
      <path d="M4,160a40,40,0,0,1,80,0Z" />
      <path d="M172,160a40,40,0,0,1,80,0Z" />
      <path d="M82,160a46,46,0,0,1,92,0Z" />
      <rect x="118" y="92" width="20" height="24" rx="8" />
      <rect x="8" y="172" width="240" height="24" rx="12" />
    </g>
    <path d="M60,192v24M196,192v24" {...line} />
  </>
)

const weights = new Map<IconWeight, ReactElement>([
  ['thin', outline],
  ['light', outline],
  ['regular', outline],
  ['bold', outline],
  [
    'duotone',
    <>
      {tint}
      {outline}
    </>,
  ],
  ['fill', solid],
])

export const LiveTableIcon = forwardRef<SVGSVGElement, IconProps>((props, ref) => <IconBase ref={ref} {...props} weights={weights} />)
LiveTableIcon.displayName = 'LiveTableIcon'
