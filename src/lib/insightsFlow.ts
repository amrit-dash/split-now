import type { Debt, MemberId } from '@/types'
import { appLocale } from './locale'
import { currencySymbol, minorDigits } from './money'

/*
 * Geometry for the settle-up graph (DebtGraph): people sit on an ellipse ("ring") as avatar nodes,
 * optionally with one person (you) in the middle, and each payment is a curved flow from payer to
 * receiver. Everything here is plain numbers so it can be tested without a DOM; the component turns
 * it into absolutely positioned avatars (HTML, so labels can truncate) over an SVG of the flows.
 *
 * Every label box is kept inside [0, width] by construction: the ring's horizontal radius is the
 * half-width minus half a label box.
 */

/** Height of the two text lines under an avatar (name + amount) and the gap above them. */
export const LABEL_H = 30
export const LABEL_GAP = 3

export interface RingNode {
  id: MemberId
  /** Avatar centre. */
  x: number
  y: number
  size: number
  /** Label box width (centred on x, below the avatar). */
  labelW: number
  center: boolean
  /** Label sits above the avatar (top half of the ring), so flows leaving downward don't cross it. */
  above: boolean
}

export interface RingLayout {
  nodes: RingNode[]
  byId: Map<MemberId, RingNode>
  width: number
  height: number
  /** Ellipse centre. */
  cx: number
  cy: number
}

export interface RingOptions {
  width: number
  /** People on the ring, in display order (first at the top, clockwise). */
  ids: MemberId[]
  /** Someone in the middle (you), or a reserved middle slot (`'@'`) for the settled badge. */
  center?: MemberId | null
  centerSize?: number
  pad?: number
}

export function avatarSizeFor(n: number) {
  return n <= 4 ? 44 : n <= 6 ? 40 : n <= 9 ? 34 : 30
}

export function layoutRing(o: RingOptions): RingLayout {
  const W = Math.max(200, o.width)
  const pad = o.pad ?? 4
  const ids = o.ids
  const n = ids.length
  const A = avatarSizeFor(n)
  const C = o.centerSize ?? (n >= 9 ? 46 : 52)
  const step = (2 * Math.PI) / Math.max(1, n)
  const mid = o.center === '@' ? { size: 64, w: Math.min(140, W * 0.5) } : o.center ? { size: C, w: Math.min(n >= 9 ? 80 : 96, W * 0.32) } : null

  const place = (labelW: number, ry: number, rot: number): RingNode[] => {
    const rx = W / 2 - labelW / 2 - 1
    // Two people face each other across the card; otherwise start at the top.
    const start = (n === 2 ? Math.PI : -Math.PI / 2) + rot
    const nodes: RingNode[] = ids.map((id, i) => {
      const t = start + i * step
      const y = ry * Math.sin(t)
      return { id, x: W / 2 + rx * Math.cos(t), y, size: A, labelW, center: false, above: y < -ry * 0.3 }
    })
    if (n === 1 && mid) {
      nodes[0].x = W / 2
      nodes[0].y = -ry
      nodes[0].above = true
    }
    if (mid && o.center) nodes.push({ id: o.center, x: W / 2, y: 0, size: mid.size, labelW: mid.w, center: true, above: false })
    return nodes
  }
  const box = (d: RingNode) => ({
    l: d.x - d.labelW / 2,
    r: d.x + d.labelW / 2,
    t: d.y - d.size / 2 - (d.above ? LABEL_GAP + LABEL_H : 0),
    b: d.y + d.size / 2 + (d.above ? 0 : LABEL_GAP + LABEL_H),
  })
  const clashes = (nodes: RingNode[]) => {
    for (let i = 0; i < nodes.length; i++) {
      const p = box(nodes[i])
      for (let j = i + 1; j < nodes.length; j++) {
        const q = box(nodes[j])
        if (p.l < q.r + 2 && q.l < p.r + 2 && p.t < q.b + 4 && q.t < p.b + 4) return true
      }
    }
    return false
  }
  const extent = (nodes: RingNode[]) => Math.max(...nodes.map((d) => box(d).b)) - Math.min(...nodes.map((d) => box(d).t))

  // Search label width, a half-step rotation and the vertical radius for the shortest drawing in
  // which no two label blocks touch (narrower labels cost a little, so names stay readable).
  const maxW = Math.max(54, Math.min(n <= 2 ? 124 : 108, mid ? W / 2 - mid.w / 2 - 6 : 999))
  let best: { nodes: RingNode[]; score: number } | null = null
  for (let lw = maxW; lw >= 54; lw -= 6) {
    for (const rot of n >= 3 ? [0, step / 2] : [0]) {
      let ry = n <= 2 && !mid ? 0 : Math.max((W / 2 - lw / 2) * (n >= 3 ? 0.62 : 0), mid ? mid.size / 2 + A / 2 + (n <= 2 ? 56 : 10) : 0)
      let nodes = place(lw, ry, rot)
      let k = 0
      for (; k < 200 && clashes(nodes); k++) {
        ry += 3
        nodes = place(lw, ry, rot)
      }
      // Someone straight below the middle person would have their flow run through its label.
      const below = mid ? nodes.filter((d) => !d.center && d.y > 0 && Math.abs(d.x - W / 2) < mid.w / 2).length : 0
      const score = extent(nodes) + (maxW - lw) * 2.5 + below * 400 + (k >= 200 ? 1e6 : 0)
      if (!best || score < best.score) best = { nodes, score }
    }
  }
  const nodes = best!.nodes

  const top = Math.min(...nodes.map((d) => box(d).t))
  const dy = pad - top
  for (const d of nodes) d.y += dy
  const height = Math.max(...nodes.map((d) => box(d).b)) + pad
  const real = nodes.filter((d) => d.id !== '@')
  return { nodes: real, byId: new Map(real.map((d) => [d.id, d])), width: W, height, cx: W / 2, cy: dy }
}

export interface FlowGeom {
  d: string
  /** Approximate arc length in px (for the moving-dot dash pattern). */
  length: number
  /** Point and tangent angle (degrees) a little past the middle, for the direction chevron. */
  arrow: { x: number; y: number; angle: number }
  mid: { x: number; y: number }
}

type P = { x: number; y: number }

const qAt = (a: P, c: P, b: P, t: number): P => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
})

/**
 * A quadratic curve from avatar `a` to avatar `b` (centres, radii), bowed toward `toward` by
 * `bend` (0 = straight) and pushed sideways by `side` px so A→B and B→A never sit on top of each
 * other. Ends are trimmed to just outside each avatar.
 */
export function flowCurve(a: P & { r: number }, b: P & { r: number }, toward: P, bend: number, side: number): FlowGeom {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const dx = b.x - a.x,
    dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len,
    ny = dx / len
  const c = { x: m.x + (toward.x - m.x) * bend + nx * side, y: m.y + (toward.y - m.y) * bend + ny * side }
  const trim = (p: P & { r: number }) => {
    const ux = c.x - p.x,
      uy = c.y - p.y
    const l = Math.hypot(ux, uy) || 1
    return { x: p.x + (ux / l) * p.r, y: p.y + (uy / l) * p.r }
  }
  const s = trim(a),
    e = trim(b)
  let length = 0
  let prev = s
  for (let i = 1; i <= 16; i++) {
    const q = qAt(s, c, e, i / 16)
    length += Math.hypot(q.x - prev.x, q.y - prev.y)
    prev = q
  }
  const ta = 0.56
  const at = qAt(s, c, e, ta)
  const tx = 2 * (1 - ta) * (c.x - s.x) + 2 * ta * (e.x - c.x)
  const ty = 2 * (1 - ta) * (c.y - s.y) + 2 * ta * (e.y - c.y)
  const r = (v: number) => Math.round(v * 10) / 10
  return {
    d: `M${r(s.x)},${r(s.y)} Q${r(c.x)},${r(c.y)} ${r(e.x)},${r(e.y)}`,
    length,
    arrow: { x: at.x, y: at.y, angle: (Math.atan2(ty, tx) * 180) / Math.PI },
    mid: qAt(s, c, e, 0.5),
  }
}

/** Stroke width for a flow: 2px for the smallest share up to 10px for the largest. */
export function flowWidth(amount: number, max: number) {
  return max > 0 ? 2 + 8 * Math.min(1, amount / max) : 2
}

/** Seconds per dot step: bigger payments move faster (1.1s for the largest, 2.6s for tiny ones). */
export function flowSpeed(amount: number, max: number) {
  return max > 0 ? 2.6 - 1.5 * Math.min(1, amount / max) : 2.6
}

export const flowKey = (d: Pick<Debt, 'from' | 'to'>) => `${d.from}>${d.to}`

/** Merge duplicate from→to rows (raw debts can repeat a pair) and drop zero rows. */
export function mergeDebts(debts: Debt[]): Debt[] {
  const m = new Map<string, Debt>()
  for (const d of debts) {
    if (!(d.amount > 0) || d.from === d.to) continue
    const k = flowKey(d)
    const cur = m.get(k)
    m.set(k, cur ? { ...cur, amount: cur.amount + d.amount } : { ...d })
  }
  return [...m.values()]
}

/** Net position per person from a list of debts: + gets back, − owes. */
export function netOf(debts: Debt[]): Map<MemberId, number> {
  const m = new Map<MemberId, number>()
  for (const d of debts) {
    m.set(d.from, (m.get(d.from) ?? 0) - d.amount)
    m.set(d.to, (m.get(d.to) ?? 0) + d.amount)
  }
  return m
}

/**
 * Short labels for the chart: first names, with a last initial (or more) where two people share
 * one, so "Kodai Gandhi" and "Kodai Rao" read "Kodai G" and "Kodai R".
 */
export function shortNames(names: Record<MemberId, string>): Record<MemberId, string> {
  const ids = Object.keys(names)
  const parts = Object.fromEntries(ids.map((id) => [id, names[id].trim().split(/\s+/).filter(Boolean)]))
  const first = (id: MemberId) => parts[id][0] ?? '?'
  const out: Record<MemberId, string> = {}
  for (const id of ids) {
    const same = ids.filter((o) => first(o).toLowerCase() === first(id).toLowerCase())
    const last = parts[id].length > 1 ? parts[id][parts[id].length - 1] : ''
    out[id] = same.length > 1 && last ? `${first(id)} ${last[0].toUpperCase()}` : first(id)
  }
  return out
}

/**
 * ₹1.2Cr, ₹4.5L, $4.5K, ₹950: a short amount for chart labels (the list under the chart is exact).
 * Lakh/crore for rupees, K/M/B otherwise; built by hand because Intl's compact forms vary by engine
 * (some show "₹7T" for seven thousand).
 */
export function compactMoney(minor: number, currency = 'INR', locale = appLocale()): string {
  const v = Math.abs(minor / 10 ** minorDigits(currency))
  const sign = minor < 0 ? '-' : ''
  const sym = currencySymbol(currency, locale)
  const steps: Array<[number, string]> =
    currency === 'INR' || locale.endsWith('-IN')
      ? [
          [1e7, 'Cr'],
          [1e5, 'L'],
          [1e3, 'K'],
        ]
      : [
          [1e9, 'B'],
          [1e6, 'M'],
          [1e3, 'K'],
        ]
  for (const [n, suffix] of steps) {
    if (v >= n * 0.9995) {
      const x = v / n
      const t = x >= 100 ? Math.round(x).toString() : (Math.round(x * 10) / 10).toString()
      return `${sign}${sym}${t}${suffix}`
    }
  }
  const t = v < 10 && minorDigits(currency) > 0 ? (Math.round(v * 100) / 100).toString() : Math.round(v).toString()
  return `${sign}${sym}${t}`
}
