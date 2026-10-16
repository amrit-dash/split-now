/*
 * An AI-drawn icon is SVG markup a model wrote, so it is never trusted: cleanSvg reads it with a
 * strict grammar and writes a fresh copy from what it understood. Only plain shapes survive
 * (path, circle, ellipse, rect, line, polyline, polygon, and g to group them), each with a short
 * list of attributes whose values must look like numbers, path data, a hex colour or a keyword.
 * Anything else in the markup (a script, text, an image, a link, a style, an unknown element,
 * an entity) makes the whole icon unusable, rather than being cut out around. The copy is drawn
 * as an <img> (a data: URL), where SVG scripts never run in any case.
 *
 * The functions clean what the model answers before the app sees it, and the app cleans a stored
 * icon again before drawing it (a co-member could write any string to the document). Pure: no DOM,
 * the same in Node and the browser.
 */

/** The longest cleaned icon kept (bytes of markup): the rules cap the stored field the same. */
export const SVG_MAX = 4096
/** At most this many shapes: an icon, not an illustration. */
export const SVG_MAX_SHAPES = 24
const MAX_DEPTH = 3

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])

const NUM = /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i
const PATH = /^[0-9eE.,\s+\-MmLlHhVvCcSsQqTtAaZz]{1,2000}$/
const POINTS = /^[0-9eE.,\s+-]{1,1000}$/
const COLOR = /^(none|#[0-9a-f]{3}|#[0-9a-f]{6})$/i
const TRANSFORM = /^\s*((translate|scale|rotate)\(\s*-?[\d.]+(\s*[,\s]\s*-?[\d.]+){0,2}\s*\)\s*){1,3}$/

type Check = (v: string) => boolean
const num: Check = (v) => NUM.test(v.trim()) && Math.abs(Number(v)) <= 1000
const unit: Check = (v) => num(v) && Number(v) >= 0 && Number(v) <= 1
const oneOf =
  (...ok: string[]): Check =>
  (v) =>
    ok.includes(v.trim())

/** Attributes any shape (and g) may carry. */
const PAINT: Record<string, Check> = {
  fill: (v) => COLOR.test(v.trim()),
  stroke: (v) => COLOR.test(v.trim()),
  'stroke-width': (v) => num(v) && Number(v) >= 0 && Number(v) <= 24,
  'stroke-linecap': oneOf('butt', 'round', 'square'),
  'stroke-linejoin': oneOf('miter', 'round', 'bevel'),
  'fill-rule': oneOf('nonzero', 'evenodd'),
  'clip-rule': oneOf('nonzero', 'evenodd'),
  opacity: unit,
  'fill-opacity': unit,
  'stroke-opacity': unit,
  transform: (v) => TRANSFORM.test(v),
}

const GEOMETRY: Record<string, Record<string, Check>> = {
  g: {},
  path: { d: (v) => PATH.test(v) },
  circle: { cx: num, cy: num, r: num },
  ellipse: { cx: num, cy: num, rx: num, ry: num },
  rect: { x: num, y: num, width: num, height: num, rx: num, ry: num },
  line: { x1: num, y1: num, x2: num, y2: num },
  polyline: { points: (v) => POINTS.test(v) },
  polygon: { points: (v) => POINTS.test(v) },
}

interface Node {
  name: string
  attrs: Array<[string, string]>
  children: Node[]
}

const TAG = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z][a-zA-Z0-9:-]*\s*=\s*(?:"[^"<>&]*"|'[^'<>&]*'))*)\s*(\/?)\s*>/
const ATTR = /([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*(?:"([^"<>&]*)"|'([^'<>&]*)')/g

/** The model's answer may come wrapped in a code fence or with words around it: the one <svg>…</svg> in it. */
function svgPart(raw: string): string | null {
  const start = raw.indexOf('<svg')
  const end = raw.lastIndexOf('</svg>')
  if (start < 0 || end < start) return null
  return raw.slice(start, end + '</svg>'.length)
}

function parse(src: string): { root: Node; rootAttrs: Array<[string, string]> } | null {
  let i = 0
  const stack: Node[] = []
  let root: Node | null = null
  let shapes = 0
  while (i < src.length) {
    const rest = src.slice(i)
    const ws = /^\s+/.exec(rest)
    if (ws) {
      i += ws[0].length
      continue
    }
    // text, comments, CDATA, doctype, processing instructions: none belong in an icon
    if (!rest.startsWith('<') || rest.startsWith('<!') || rest.startsWith('<?')) return null
    const m = TAG.exec(rest)
    if (!m) return null
    i += m[0].length
    const [, closing, rawName, attrText, selfClosing] = m
    const name = rawName.toLowerCase()
    if (closing) {
      const open = stack.pop()
      if (!open || open.name !== name || attrText.trim() || selfClosing) return null
      if (!stack.length) {
        // nothing may follow the root
        if (src.slice(i).trim()) return null
        break
      }
      continue
    }
    const attrs: Array<[string, string]> = []
    for (const a of attrText.matchAll(ATTR)) attrs.push([a[1].toLowerCase(), a[2] ?? a[3] ?? ''])
    const node: Node = { name, attrs, children: [] }
    if (!root) {
      if (name !== 'svg' || selfClosing) return null
      root = node
      stack.push(node)
      continue
    }
    if (!(name in GEOMETRY)) return null
    if (stack.length > MAX_DEPTH) return null
    if (SHAPES.has(name) && ++shapes > SVG_MAX_SHAPES) return null
    stack[stack.length - 1].children.push(node)
    if (!selfClosing) stack.push(node)
  }
  if (!root || stack.length) return null
  return { root, rootAttrs: root.attrs }
}

/** A shape's attributes that are allowed and well formed; null when one that matters is malformed. */
function cleanAttrs(node: Node): Array<[string, string]> | null {
  const allowed = { ...GEOMETRY[node.name], ...PAINT }
  const out: Array<[string, string]> = []
  const seen = new Set<string>()
  for (const [k, v] of node.attrs) {
    const check = allowed[k]
    // Unknown attributes (ids, classes, data-*, aria-*) are left out; event handlers and links can't be in the copy either way.
    if (!check || seen.has(k)) continue
    if (!check(v)) return null
    seen.add(k)
    out.push([k, v.trim().replace(/\s+/g, ' ')])
  }
  return out
}

function write(node: Node): string | null {
  const attrs = cleanAttrs(node)
  if (!attrs) return null
  const a = attrs.map(([k, v]) => ` ${k}="${v}"`).join('')
  if (node.name !== 'g') return `<${node.name}${a}/>`
  const inner: string[] = []
  for (const c of node.children) {
    const w = write(c)
    if (w === null) return null
    inner.push(w)
  }
  return `<g${a}>${inner.join('')}</g>`
}

/** A viewBox of four sane numbers, else the 24 × 24 grid the prompt asks for. */
function viewBoxOf(attrs: Array<[string, string]>): string | null {
  const v = attrs.find(([k]) => k === 'viewbox')?.[1]
  if (v === undefined) return '0 0 24 24'
  const n = v.trim().split(/[\s,]+/)
  if (n.length !== 4 || !n.every(num) || Number(n[2]) <= 0 || Number(n[3]) <= 0) return null
  return n.join(' ')
}

/**
 * The icon as a fresh, safe copy, or null when it isn't a plain-shapes icon of at most SVG_MAX
 * bytes. Root paint (a model often puts fill="none" stroke="#…" on the svg) moves onto a g.
 */
export function cleanSvg(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 20_000) return null
  const part = svgPart(raw)
  if (!part) return null
  const tree = parse(part)
  if (!tree) return null
  const { root } = tree
  const viewBox = viewBoxOf(root.attrs)
  if (!viewBox || !root.children.length) return null
  const rootPaint = root.attrs.filter(([k]) => k in PAINT && k !== 'transform')
  const body: string[] = []
  for (const c of root.children) {
    const w = write(c)
    if (w === null) return null
    body.push(w)
  }
  let inner = body.join('')
  if (rootPaint.length) {
    const g = write({ name: 'g', attrs: rootPaint, children: [] })
    if (g === null) return null
    inner = `${g.slice(0, -4)}${inner}</g>`
  }
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`
  return out.length <= SVG_MAX ? out : null
}

/** How the app draws a cleaned icon: an <img> source, where nothing in it can run. */
export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
