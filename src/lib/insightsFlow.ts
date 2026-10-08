import type { Debt, MemberId } from '@/types'

/*
 * Layout for the settle-up flow chart (DebtGraph): people who pay on the left, people who receive
 * on the right, one ribbon per payment whose thickness is proportional to the amount. Unlike a
 * circular node-link diagram it needs no angles or arrowheads, scales vertically with the number of
 * people, and leaves room for full names and amounts at a phone's width.
 */

export interface FlowNode {
  id: MemberId
  side: 'pay' | 'get'
  total: number
  /** Top of the node bar and its height. */
  y: number
  h: number
  /** Vertical centre of the slot, where the label goes. */
  cy: number
}

export interface FlowLink {
  index: number
  debt: Debt
  /** Band on the payer's bar (y0..y1) and on the receiver's bar. */
  sy0: number; sy1: number
  ty0: number; ty1: number
}

export interface FlowLayout { pay: FlowNode[]; get: FlowNode[]; links: FlowLink[]; height: number }

export interface FlowOptions {
  /** Target height per row of the taller column, before min heights. */
  pitch?: number
  /** Minimum vertical slot per node so two-line labels never collide. */
  labelSlot?: number
  gap?: number
  minBar?: number
  pad?: number
}

export function layoutFlow(debts: Debt[], o: FlowOptions = {}): FlowLayout {
  const pitch = o.pitch ?? 56, labelSlot = o.labelSlot ?? 40, gap = o.gap ?? 10, minBar = o.minBar ?? 4, pad = o.pad ?? 4
  const live = debts.map((debt, index) => ({ debt, index })).filter((d) => d.debt.amount > 0)
  if (!live.length) return { pay: [], get: [], links: [], height: 0 }

  const totals = (key: 'from' | 'to') => {
    const m = new Map<MemberId, number>()
    for (const { debt } of live) m.set(debt[key], (m.get(debt[key]) ?? 0) + debt.amount)
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }
  const payT = totals('from'), getT = totals('to')
  const total = live.reduce((s, d) => s + d.debt.amount, 0)
  const rows = Math.max(payT.length, getT.length)
  const k = Math.max(0, rows * pitch - gap * (rows - 1)) / total

  const place = (list: Array<[MemberId, number]>, side: FlowNode['side']) => {
    let y = 0
    const nodes = list.map(([id, t]) => {
      const h = Math.max(minBar, t * k)
      const slot = Math.max(h, labelSlot)
      const n: FlowNode = { id, side, total: t, y: y + (slot - h) / 2, h, cy: y + slot / 2 }
      y += slot + gap
      return n
    })
    return { nodes, height: y - gap }
  }
  const P = place(payT, 'pay'), G = place(getT, 'get')
  const height = Math.max(P.height, G.height) + pad * 2
  // Centre the shorter column.
  for (const [col, h] of [[P.nodes, P.height], [G.nodes, G.height]] as const) {
    const off = pad + (height - pad * 2 - h) / 2
    for (const n of col) { n.y += off; n.cy += off }
  }

  const payIdx = new Map(P.nodes.map((n, i) => [n.id, i]))
  const getIdx = new Map(G.nodes.map((n, i) => [n.id, i]))
  // Stack bands on each bar in the order of the other end, so ribbons don't cross needlessly.
  const sOff = new Map<MemberId, number>(), tOff = new Map<MemberId, number>()
  const links: FlowLink[] = new Array(live.length)
  const bySource = [...live].sort((a, b) => payIdx.get(a.debt.from)! - payIdx.get(b.debt.from)! || getIdx.get(a.debt.to)! - getIdx.get(b.debt.to)!)
  const pos = new Map<number, number>(bySource.map((d, i) => [d.index, i]))
  for (const d of bySource) {
    const s = P.nodes[payIdx.get(d.debt.from)!]
    const used = sOff.get(s.id) ?? 0
    const th = (d.debt.amount / s.total) * s.h
    links[pos.get(d.index)!] = { index: d.index, debt: d.debt, sy0: s.y + used, sy1: s.y + used + th, ty0: 0, ty1: 0 }
    sOff.set(s.id, used + th)
  }
  const byTarget = [...links].sort((a, b) => getIdx.get(a.debt.to)! - getIdx.get(b.debt.to)! || payIdx.get(a.debt.from)! - payIdx.get(b.debt.from)!)
  for (const l of byTarget) {
    const t = G.nodes[getIdx.get(l.debt.to)!]
    const used = tOff.get(t.id) ?? 0
    const th = (l.debt.amount / t.total) * t.h
    l.ty0 = t.y + used; l.ty1 = t.y + used + th
    tOff.set(t.id, used + th)
  }
  return { pay: P.nodes, get: G.nodes, links, height }
}

/** SVG path for a ribbon between x0 (payer bar edge) and x1 (receiver bar edge). */
export function ribbonPath(l: FlowLink, x0: number, x1: number): string {
  const mx = (x0 + x1) / 2
  const r = (n: number) => Math.round(n * 10) / 10
  return `M${r(x0)},${r(l.sy0)} C${r(mx)},${r(l.sy0)} ${r(mx)},${r(l.ty0)} ${r(x1)},${r(l.ty0)} L${r(x1)},${r(l.ty1)} C${r(mx)},${r(l.ty1)} ${r(mx)},${r(l.sy1)} ${r(x0)},${r(l.sy1)} Z`
}
