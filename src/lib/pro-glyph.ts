/**
 * The word PRO for the Pro badge, traced from Nunito Black (SIL OFL 1.1) to one SVG path, so the
 * app draws it without loading the font. A 220×73 box, y down, absolute M/L/Q/H/V/Z commands
 * only (src/lib/pro-ring.ts bends it onto a ring and relies on that).
 */
export const PRO_D =
  'M9.2 72.5Q4.8 72.5 2.4 70.1Q0 67.6 0 63.2V10.4Q0 5.9 2.5 3.5Q4.9 1.1 9.3 1.1H33.9Q45.9 1.1 52.5 7.3Q59 13.4 59 24.2Q59 35 52.5 41.2Q45.9 47.3 33.9 47.3H18.4V63.2Q18.4 67.6 16.1 70.1Q13.8 72.5 9.2 72.5ZM18.4 33.2H30.7Q35.9 33.2 38.7 31Q41.5 28.7 41.5 24.2Q41.5 19.6 38.7 17.4Q35.9 15.2 30.7 15.2H18.4ZM82.8 72.5Q78.4 72.5 76 70.1Q73.6 67.6 73.6 63.2V10.4Q73.6 5.9 76.1 3.5Q78.5 1.1 82.9 1.1H107.5Q119.5 1.1 126.1 7Q132.6 12.8 132.6 23.2Q132.6 29.9 129.7 34.9Q126.7 39.8 121.2 42.5Q115.6 45.1 107.5 45.1L108.3 43.3H113.1Q117.4 43.3 120.7 45.4Q124 47.4 126.2 51.6L131.2 60.6Q132.8 63.5 132.7 66.3Q132.6 69 130.6 70.8Q128.5 72.5 124.6 72.5Q120.7 72.5 118.2 70.9Q115.8 69.3 113.9 65.9L104.8 49.2Q103.6 47 101.8 46.2Q99.9 45.3 97.5 45.3H92V63.2Q92 67.6 89.7 70.1Q87.4 72.5 82.8 72.5ZM92 32.3H104.2Q109.5 32.3 112.3 30.2Q115.1 28.1 115.1 23.7Q115.1 19.5 112.3 17.4Q109.5 15.2 104.2 15.2H92ZM184.2 72.7Q173.5 72.7 165.4 68.2Q157.3 63.6 152.9 55.4Q148.4 47.2 148.4 36.3Q148.4 28.1 150.9 21.4Q153.5 14.7 158.2 9.9Q163 5.1 169.6 2.6Q176.2 0 184.2 0Q194.9 0 202.9 4.5Q211 9 215.5 17.2Q220 25.3 220 36.3Q220 44.5 217.5 51.2Q214.9 57.9 210.2 62.8Q205.4 67.6 198.8 70.2Q192.2 72.7 184.2 72.7ZM184.2 57.3Q189.5 57.3 193.2 54.8Q196.9 52.3 198.9 47.6Q200.9 42.9 200.9 36.3Q200.9 26.4 196.5 20.9Q192.1 15.4 184.2 15.4Q179 15.4 175.2 17.9Q171.5 20.3 169.5 25Q167.5 29.6 167.5 36.3Q167.5 46.2 171.9 51.8Q176.3 57.3 184.2 57.3Z'
export const PRO_W = 220
export const PRO_H = 73
/** Width over height, for sizing the word by its letter height. */
export const PRO_RATIO = PRO_W / PRO_H

/** The word as a CSS mask image (the flat badge: a gradient shows through the letters). */
export const PRO_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PRO_W} ${PRO_H}"><path d="${PRO_D}"/></svg>`)}")`
