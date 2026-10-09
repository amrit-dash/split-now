import { useMemo } from 'react'
import { encodeQr, qrPath } from '@/lib/qr'

/** A QR code drawn as one SVG path (always dark-on-white, so phone cameras can read it in dark mode). */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label?: string }) {
  const { n, d } = useMemo(() => {
    const q = encodeQr(value)
    return { n: q.size + 8, d: qrPath(q, 4) }
  }, [value])
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label ?? `QR code for ${value}`} shapeRendering="crispEdges" className="rounded-2xl bg-white">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#0b0a14" />
    </svg>
  )
}
