import { useMemo } from 'react'
import { encodeQr, qrPath } from '@/lib/qr'

/** A QR code drawn as one SVG path (always dark-on-white, so phone cameras can read it in dark mode). */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label?: string }) {
  // The encoder stops at version 10 (~213 bytes); a longer value gets a plain message, not a crash.
  const code = useMemo(() => {
    try {
      const q = encodeQr(value)
      return { n: q.size + 8, d: qrPath(q, 4) }
    } catch {
      return null
    }
  }, [value])
  if (!code) {
    return (
      <div
        role="img"
        aria-label={label ?? 'QR code'}
        style={{ width: size }}
        className="rounded-2xl bg-slate-100 p-4 text-center text-sm text-muted dark:bg-ink-800"
      >
        Too long to show as a QR code
      </div>
    )
  }
  const { n, d } = code
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label={label ?? `QR code for ${value}`}
      shapeRendering="crispEdges"
      className="rounded-2xl bg-white"
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#0b0a14" />
    </svg>
  )
}
