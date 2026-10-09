/*
 * Pure geometry for the hand-drawn SVG charts in src/components/charts: donut arcs, a monotone
 * curve through points, "nice" axis ticks and linear scales. No DOM, no React.
 */

export interface Point {
  x: number
  y: number
}

const TAU = Math.PI * 2

/** Angles (radians, clockwise from 12 o'clock) for each value's slice; zero and negative values get an empty slice. */
export function donutSegments(values: number[], gap = 0): Array<{ start: number; end: number }> {
  const positive = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const total = positive.reduce((s, v) => s + v, 0)
  if (total <= 0) return positive.map(() => ({ start: 0, end: 0 }))
  const n = positive.filter((v) => v > 0).length
  // The gap is taken off every non-empty slice; a single slice has nothing to be apart from.
  const g = n > 1 ? Math.min(gap, TAU / n / 2) : 0
  let a = 0
  return positive.map((v) => {
    if (v === 0) return { start: a, end: a }
    const span = (v / total) * TAU
    const seg = { start: a + g / 2, end: a + span - g / 2 }
    a += span
    return seg
  })
}

const polar = (cx: number, cy: number, r: number, angle: number): Point => ({ x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) })

/** Path of a ring segment from `start` to `end` (radians, clockwise from the top). */
export function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  if (end <= start) return ''
  const span = Math.min(end - start, TAU - 1e-6)
  const large = span > Math.PI ? 1 : 0
  const o1 = polar(cx, cy, rOuter, start),
    o2 = polar(cx, cy, rOuter, start + span)
  const i1 = polar(cx, cy, rInner, start + span),
    i2 = polar(cx, cy, rInner, start)
  const f = (n: number) => +n.toFixed(2)
  return `M${f(o1.x)} ${f(o1.y)} A${f(rOuter)} ${f(rOuter)} 0 ${large} 1 ${f(o2.x)} ${f(o2.y)} L${f(i1.x)} ${f(i1.y)} A${f(rInner)} ${f(rInner)} 0 ${large} 0 ${f(i2.x)} ${f(i2.y)} Z`
}

/**
 * A smooth curve through the points that never overshoots them (Fritsch–Carlson monotone
 * cubic, the same idea as d3's curveMonotoneX), as an SVG path. Points must be sorted by x.
 */
export function monotonePath(pts: Point[]): string {
  const f = (n: number) => +n.toFixed(2)
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${f(pts[0].x)} ${f(pts[0].y)}`
  const n = pts.length
  const dx: number[] = [],
    dy: number[] = [],
    m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x
    dy[i] = pts[i + 1].y - pts[i].y
    m[i] = dx[i] === 0 ? 0 : dy[i] / dx[i]
  }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  t[n - 1] = m[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i],
      b = t[i + 1] / m[i],
      s = a * a + b * b
    if (s > 9) {
      const k = 3 / Math.sqrt(s)
      t[i] = k * a * m[i]
      t[i + 1] = k * b * m[i]
    }
  }
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${f(pts[i].x + h)} ${f(pts[i].y + t[i] * h)} ${f(pts[i + 1].x - h)} ${f(pts[i + 1].y - t[i + 1] * h)} ${f(pts[i + 1].x)} ${f(pts[i + 1].y)}`
  }
  return d
}

/** Round tick values from 0 up to (at least) `max`: 1-2-5 steps, about `count` of them. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0]
  const rough = max / count
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= rough) ?? 10 * pow
  const out: number[] = []
  for (let v = 0; v < max + step * 0.999; v += step) out.push(+v.toFixed(10))
  return out
}

/** Linear scale: maps `domain` onto `range` (clamped to the domain). */
export function linearScale([d0, d1]: [number, number], [r0, r1]: [number, number]): (v: number) => number {
  const span = d1 - d0
  return (v) => {
    if (span === 0) return r0
    const t = Math.min(1, Math.max(0, (v - d0) / span))
    return r0 + t * (r1 - r0)
  }
}

/** Index of the point whose x is nearest to `x` (points sorted by x). */
export function nearestIndex(xs: number[], x: number): number {
  let best = 0
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i
  return best
}

/**
 * Which x-axis labels to draw under `count` evenly spaced points across `plotW` px, each label
 * about `labelW` px wide. The first is start-anchored and the last end-anchored (so they stay
 * inside the chart), the rest centred. Labels between are evenly spaced, and one that would
 * crowd an end label is dropped: next to an end, a centred label needs half its width plus the
 * end label's whole width, which a plain "every n points" rule doesn't leave (the last two
 * dates used to overlap).
 */
export function xLabelIndices(count: number, plotW: number, labelW: number, gap = 8): number[] {
  if (count <= 0) return []
  const last = count - 1
  if (last === 0) return [0]
  const step = plotW / last
  const every = Math.max(1, Math.ceil((labelW + gap) / step))
  const clear = 1.5 * labelW + gap
  const out: number[] = []
  for (let i = 0; i < last; i += every) {
    if (i > 0 && (i * step < clear || (last - i) * step < clear)) continue
    out.push(i)
  }
  // Two end labels that would touch: keep the latest.
  if (out[0] === 0 && out.length === 1 && last * step < 2 * labelW + gap) out.pop()
  out.push(last)
  return out
}
