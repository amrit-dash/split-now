import type { BadgeWord } from './pro'
import { GLYPHS, PRO_D, PRO_H, PRO_W } from './pro-glyph'

/*
 * The badge ring (docs/PENDING.md, Pro badge): ・PRO・PRO・ (or DEV, or PRO DEV) bent around a photo or a 1:1's tile.
 * Each letter is bent, not just placed: every point of the traced word moves onto a track (a
 * circle, or the tile's rounded square), x along it and y across it, so the word follows the curve
 * the way type on a coin does. Pure geometry; src/components/ProBadge.tsx draws it.
 */

/** A point on a track and the direction pointing outwards there (unit length). */
export interface TrackPoint {
  x: number
  y: number
  nx: number
  ny: number
}
/** A closed track by arc length (any s; it wraps), starting at the top middle, clockwise, y down. */
export interface Track {
  at: (s: number) => TrackPoint
  length: number
}

export interface RingDot {
  x: number
  y: number
  r: number
}
export interface RingArt {
  /** the SVG's width and height; its viewBox is centred on 0,0 */
  size: number
  /** letter height in px */
  h: number
  /** one bent PRO per entry */
  words: string[]
  /** the dots between the words */
  dots: RingDot[]
}

const f = (n: number) => (Math.abs(n) < 0.005 ? '0' : n.toFixed(2))

/**
 * The traced word bent onto `track`: its centre at arc length `s0`, `h` px tall, the top of the
 * letters outwards. Straight edges are cut into short pieces so they curve with the track too
 * (a long straight edge bent only at its ends would show as a facet). Needs absolute M/L/Q/H/V/Z.
 */
export function bendWord(track: Track, s0: number, h: number, d: string = PRO_D, gw: number = PRO_W, gh: number = PRO_H): string {
  const k = h / gh
  const pt = (x: number, y: number) => {
    const q = track.at(s0 + (x - gw / 2) * k)
    const n = (gh / 2 - y) * k
    return `${f(q.x + q.nx * n)} ${f(q.y + q.ny * n)}`
  }
  // A straight piece at most ~1.2 px long once bent.
  const maxPiece = 1.2 / k
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const pieces = Math.max(1, Math.ceil(Math.abs(x1 - x0) / maxPiece))
    let o = ''
    for (let i = 1; i <= pieces; i++) o += `L${pt(x0 + ((x1 - x0) * i) / pieces, y0 + ((y1 - y0) * i) / pieces)}`
    return o
  }
  const t = d.match(/[MLQHVZ]|-?\d*\.?\d+/g) ?? []
  let o = ''
  let i = 0
  let cmd = ''
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  while (i < t.length) {
    if (/[A-Z]/.test(t[i])) {
      cmd = t[i++]
      if (cmd === 'Z') {
        o += 'Z'
        cx = sx
        cy = sy
        continue
      }
    }
    if (cmd === 'H' || cmd === 'V' || cmd === 'L') {
      const nx = cmd === 'V' ? cx : +t[i++]
      const ny = cmd === 'H' ? cy : +t[i++]
      o += line(cx, cy, nx, ny)
      cx = nx
      cy = ny
    } else if (cmd === 'Q') {
      const ax = +t[i]
      const ay = +t[i + 1]
      cx = +t[i + 2]
      cy = +t[i + 3]
      i += 4
      o += `Q${pt(ax, ay)} ${pt(cx, cy)}`
    } else if (cmd === 'M') {
      cx = sx = +t[i]
      cy = sy = +t[i + 1]
      i += 2
      o += `M${pt(cx, cy)}`
    } else {
      // an unknown command: stop rather than loop
      break
    }
  }
  return o
}

/** A circle of radius r around 0,0. */
export function circleTrack(r: number): Track {
  const at = (s: number) => {
    const a = s / r
    const nx = Math.sin(a)
    const ny = -Math.cos(a)
    return { x: r * nx, y: r * ny, nx, ny }
  }
  return { at, length: 2 * Math.PI * r }
}

/** A rounded square `w` wide with corner radius `rad`, centred on 0,0 (a 1:1's tile, grown outwards). */
export function roundedSquareTrack(w: number, rad: number): Track {
  const R = Math.min(rad, w / 2)
  const side = w - 2 * R
  const arc = (Math.PI / 2) * R
  const h = w / 2
  const length = 4 * side + 4 * arc
  // Each piece: a straight side (start, direction) or a corner (centre, start angle).
  type Seg = { len: number; line?: [number, number, number, number]; arc?: [number, number, number] }
  const segs: Seg[] = [
    { len: side / 2, line: [0, -h, 1, 0] },
    { len: arc, arc: [h - R, -h + R, -Math.PI / 2] },
    { len: side, line: [h, -h + R, 0, 1] },
    { len: arc, arc: [h - R, h - R, 0] },
    { len: side, line: [h - R, h, -1, 0] },
    { len: arc, arc: [-h + R, h - R, Math.PI / 2] },
    { len: side, line: [-h, h - R, 0, -1] },
    { len: arc, arc: [-h + R, -h + R, Math.PI] },
    { len: side / 2, line: [-h + R, -h, 1, 0] },
  ]
  const at = (s0: number): TrackPoint => {
    let s = ((s0 % length) + length) % length
    for (const g of segs) {
      if (s <= g.len || g === segs[segs.length - 1]) {
        if (g.line) {
          const [x, y, dx, dy] = g.line
          // outwards is the direction of travel turned left (clockwise travel, y down)
          return { x: x + dx * s, y: y + dy * s, nx: dy, ny: -dx }
        }
        const [cx, cy, a0] = g.arc as [number, number, number]
        const t = a0 + (R > 0 ? s / R : 0)
        return { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t), nx: Math.cos(t), ny: Math.sin(t) }
      }
      s -= g.len
    }
    return { x: 0, y: -h, nx: 0, ny: -1 }
  }
  return { at, length }
}

/** Letter height for a photo or tile `size` px across: about 8% of it, kept between 3.8 and 5.6 px. */
export function ringLetterHeight(size: number): number {
  return Math.max(3.8, Math.min(5.6, size * 0.08))
}

/**
 * How many word + dot repeats fit a track, spaced evenly: each word plus a small gap with a dot on
 * either side. `ratio` is the word's width over its height (PRO DEV is longer, so fewer fit).
 */
export function ringRepeats(length: number, h: number, ratio: number = PRO_W / PRO_H): number {
  const unit = h * ratio + 2 * h * 0.85
  return Math.max(minRepeats(ratio), Math.round(length / unit))
}
// At least four short words round a ring, or two long ones.
const minRepeats = (ratio: number) => (ratio > 4 ? 2 : 4)

function lay(track: Track, h: number, size: number, offset: number, word: BadgeWord): RingArt {
  const g = GLYPHS[word]
  const n = ringRepeats(track.length, h, g.w / g.h)
  const step = track.length / n
  const words: string[] = []
  const dots: RingDot[] = []
  for (let i = 0; i < n; i++) {
    const s = offset + i * step
    words.push(bendWord(track, s, h, g.d, g.w, g.h))
    const q = track.at(s + step / 2)
    dots.push({ x: +q.x.toFixed(2), y: +q.y.toFixed(2), r: +(h * 0.17).toFixed(2) })
  }
  return { size, h, words, dots }
}

/** The ring around a round photo `photo` px across, 2 px clear of it. */
export function proRing(photo: number, word: BadgeWord = 'pro'): RingArt {
  const h = ringLetterHeight(photo)
  const r = photo / 2 + 2 + h / 2
  return lay(circleTrack(r), h, Math.ceil(2 * (r + h / 2 + 1)), 0, word)
}

/** The gap between a 1:1's tile and its ring (owner's board: a little more than the photo's). */
export const TILE_RING_GAP = 2.6

function tileTrack(tile: number, radius: number): { h: number; out: number; track: Track } {
  const h = ringLetterHeight(tile)
  const out = TILE_RING_GAP + h / 2
  return { h, out, track: roundedSquareTrack(tile + 2 * out, radius + out) }
}

/** How far round the tile's ring is, px (its words travel this far in one turn). */
export function tileRingLength(tile: number, radius: number): number {
  return tileTrack(tile, radius).track.length
}

/** The ring along a rounded-square tile `tile` px across with corner radius `radius`; `offset` (px along it) turns it. */
export function proTileRing(tile: number, radius: number, offset = 0, word: BadgeWord = 'pro'): RingArt {
  const { h, out, track } = tileTrack(tile, radius)
  return lay(track, h, Math.ceil(tile + 2 * (out + h / 2 + 1)), offset, word)
}

/** Every x,y pair in a path made by bendWord (for tests and bounds). */
export function pathPoints(d: string): Array<[number, number]> {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  const out: Array<[number, number]> = []
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]])
  return out
}
