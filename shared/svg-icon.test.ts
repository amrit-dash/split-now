import { describe, expect, it } from 'vitest'
import { cleanSvg, SVG_MAX, svgDataUrl } from './svg-icon'

const ferry =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="2" stroke-linecap="round"><path d="M3 15h18l-2 4H5z"/><rect x="7" y="9" width="10" height="6" rx="1" fill="#99f6e4"/></svg>'

describe('cleaning an AI-drawn icon', () => {
  it('keeps plain shapes and writes a fresh copy, root paint moved onto a group', () => {
    const out = cleanSvg(ferry)
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#0f766e" stroke-width="2" stroke-linecap="round"><path d="M3 15h18l-2 4H5z"/><rect x="7" y="9" width="10" height="6" rx="1" fill="#99f6e4"/></g></svg>',
    )
    // cleaning a clean icon changes nothing
    expect(cleanSvg(out)).toBe(out)
  })
  it('finds the icon inside a code fence or words', () => {
    expect(cleanSvg('Here you go:\n```svg\n<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#f59e0b"/></svg>\n```')).toContain('<circle')
  })
  it('anything that could run, load or show text makes it unusable', () => {
    const bad = [
      '<svg><script>alert(1)</script><circle r="2"/></svg>',
      '<svg><circle r="2" onload="alert(1)"/><text>hi</text></svg>',
      '<svg><image href="https://x.test/a.png"/></svg>',
      '<svg><use href="#a"/></svg>',
      '<svg><style>*{}</style><circle r="2"/></svg>',
      '<svg><foreignObject><div/></foreignObject></svg>',
      '<svg><a href="javascript:alert(1)"><circle r="2"/></a></svg>',
      '<svg><circle r="2" fill="url(#g)"/></svg>',
      '<svg><circle r="2" fill="&#x6a;"/></svg>',
      '<svg><!-- hi --><circle r="2"/></svg>',
      '<svg>hello<circle r="2"/></svg>',
      '<svg><circle r="2"></svg>',
      '<svg><circle r="2"/></svg><svg><circle r="2"/></svg>',
      '<svg></svg>',
      '<svg><path d="M0 0 L javascript"/></svg>',
      '<svg><circle r="1e9"/></svg>',
      '<svg><g><g><g><g><circle r="1"/></g></g></g></g></svg>',
    ]
    for (const b of bad) expect(cleanSvg(b), b).toBeNull()
  })
  it('event handlers and ids are simply not copied', () => {
    const out = cleanSvg('<svg viewBox="0 0 24 24"><circle id="c" class="x" cx="12" cy="12" r="5" fill="#fff" data-x="1"/></svg>')
    expect(out).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#fff"/></svg>')
  })
  it('an icon, not an illustration: few shapes, small markup', () => {
    const many = `<svg>${'<circle r="1"/>'.repeat(25)}</svg>`
    expect(cleanSvg(many)).toBeNull()
    const big = `M1 1 ${'L 2 2 '.repeat(35)}Z`
    expect(cleanSvg(`<svg>${`<path d="${big}" fill="#000000"/>`.repeat(20)}</svg>`)).toBeNull()
    expect(SVG_MAX).toBe(4096)
  })
  it('a missing viewBox is the 24 grid; a broken one is refused', () => {
    expect(cleanSvg('<svg><circle cx="12" cy="12" r="5"/></svg>')).toContain('viewBox="0 0 24 24"')
    expect(cleanSvg('<svg viewBox="0 0 0 24"><circle r="5"/></svg>')).toBeNull()
    expect(cleanSvg(42)).toBeNull()
  })
  it('is drawn as an image source', () => {
    expect(svgDataUrl('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')
  })
})
