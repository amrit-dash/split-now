import type { Cents, MemberId } from '@/types'
import { formatMoney } from './money'
import { isUpiId, upiLink } from './payments'
import { encodeQr } from './qr'
import { copy } from './share'

/*
 * "Pay me": the Remind action. The friend gets a Pay me link (/r/{code}, a payLinks document the
 * payee creates): it opens without an account, shows the amount and the payee's UPI QR and
 * buttons, and "I've paid" records the payment in the group (src/pages/PayLink.tsx). A member
 * of the group who opens it lands in their prefilled Settle up as before. Without a link code
 * the text falls back to that Settle up deep link. Where the share sheet accepts files, a PNG card
 * goes with it that reads well in WhatsApp: who owes whom, how much, which group, and a UPI QR
 * when the payee has a UPI ID. Everything but the canvas drawing is pure and tested.
 */

export interface ReminderArgs {
  /** location.origin */
  origin: string
  groupId: string
  groupName: string
  emoji?: string
  debtor: { id: MemberId; name: string }
  /** the person owed (the one sharing) */
  payee: { id: MemberId; name: string }
  /** minor units of `currency` */
  amount: Cents
  currency: string
  /** the payee's UPI ID, when they have one (INR only) */
  upi?: string
  /** the Pay me link's code (payLinks/{code}); without it the share falls back to the Settle up deep link */
  payLink?: string
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

/** /groups/{gid}/settle?from={debtor}&to={payee}&amount={minor}: lands on the prefilled Settle up screen. */
export function settleLink(a: Pick<ReminderArgs, 'origin' | 'groupId' | 'debtor' | 'payee' | 'amount'>): string {
  const q = new URLSearchParams({ from: a.debtor.id, to: a.payee.id, amount: String(Math.round(a.amount)) })
  return `${a.origin}/groups/${encodeURIComponent(a.groupId)}/settle?${q}`
}

/** What the share carries: the Pay me link when there is one, else the members-only Settle up link. */
export function reminderUrl(a: Pick<ReminderArgs, 'origin' | 'groupId' | 'debtor' | 'payee' | 'amount' | 'payLink'>): string {
  return a.payLink ? `${a.origin}/r/${a.payLink}` : settleLink(a)
}

/** The payee's UPI link for exactly this amount, when it can be built (INR and a valid VPA). */
export function reminderUpi(a: Pick<ReminderArgs, 'upi' | 'currency' | 'amount' | 'payee' | 'groupName'>): string | undefined {
  const pa = a.upi?.trim()
  if (!pa || a.currency !== 'INR' || !isUpiId(pa)) return undefined
  return upiLink({ pa, pn: a.payee.name, amount: a.amount, note: `Split Now ${a.groupName}` })
}

/** The message body (the link is passed to the share sheet separately, so apps make it tappable). */
export function reminderText(a: ReminderArgs): string {
  const money = formatMoney(a.amount, a.currency)
  const upi = a.upi?.trim() && a.currency === 'INR' && isUpiId(a.upi) ? ` UPI: ${a.upi.trim()}.` : ''
  const tail = a.payLink ? 'Pay and mark it paid here, no account needed:' : 'Pay in one tap:'
  return `Hey ${firstName(a.debtor.name)}, friendly nudge: you owe ${firstName(a.payee.name)} ${money} for “${a.groupName}”.${upi} ${tail}`
}

export interface CardSpec {
  /** "Goa trip", with its emoji */
  group: string
  /** "Rahul → Priya" */
  heading: string
  amount: string
  /** "Rahul owes Priya" */
  line: string
  /** "Pay with UPI → priya@okaxis" */
  pay?: string
  /** what the QR encodes (the UPI link), when there is one */
  qr?: string
  footer: string
}

/** What the card says; pure so the wording is tested without a canvas. */
export function cardSpec(a: ReminderArgs): CardSpec {
  const debtor = firstName(a.debtor.name)
  const payee = firstName(a.payee.name)
  const qr = reminderUpi(a)
  return {
    group: `${a.emoji ? `${a.emoji} ` : ''}${a.groupName}`,
    heading: `${debtor} → ${payee}`,
    amount: formatMoney(a.amount, a.currency),
    line: `${debtor} owes ${payee}`,
    pay: qr ? `Pay with UPI → ${a.upi!.trim()}` : undefined,
    qr,
    footer: 'Split Now · open the link to settle in one tap',
  }
}

const SIZE = 1080
const PAD = 84

/** Canvas accepts a colour only if it can parse it; oklch() tokens fall back to the hex twins. */
function paint(ctx: CanvasRenderingContext2D, value: string, fallback: string): string {
  // Set a sentinel and read back how the canvas spells it; an unparseable value leaves it in place.
  ctx.fillStyle = '#010203'
  const sentinel = ctx.fillStyle
  ctx.fillStyle = value
  return ctx.fillStyle === sentinel ? fallback : value
}

function cssVar(name: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  } catch {
    return ''
  }
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const q = encodeQr(text)
  const quiet = 2
  const cell = size / (q.size + quiet * 2)
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, x, y, size, size, 28)
  ctx.fill()
  ctx.fillStyle = '#111827'
  for (let r = 0; r < q.size; r++) {
    for (let c = 0; c < q.size; c++) {
      if (q.modules[r][c]) ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.5, cell + 0.5)
    }
  }
}

/**
 * The PNG card (1080×1080, brand gradient). Resolves null when this browser can't draw or
 * export a canvas; the caller then shares text only.
 */
export async function renderShareCard(spec: CardSpec): Promise<File | null> {
  if (typeof document === 'undefined' || typeof File !== 'function') return null
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const from = paint(ctx, cssVar('--color-brand-600'), '#7c3aed')
  const to = paint(ctx, cssVar('--color-duo-600'), '#c800de')
  const g = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  g.addColorStop(0, from)
  g.addColorStop(1, to)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)
  // A soft highlight, like the Home card's aurora.
  const glow = ctx.createRadialGradient(SIZE * 0.85, SIZE * 0.15, 20, SIZE * 0.85, SIZE * 0.15, SIZE * 0.7)
  glow.addColorStop(0, 'rgba(255,255,255,0.22)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, SIZE, SIZE)

  const font = (px: number, weight = 600) => `${weight} ${px}px Inter, "Inter Fallback", system-ui, -apple-system, "Segoe UI", sans-serif`
  const textWidth = SIZE - PAD * 2
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = font(44)
  ctx.fillText(clipText(ctx, spec.group, textWidth), PAD, PAD)

  ctx.fillStyle = '#ffffff'
  ctx.font = font(64, 800)
  ctx.fillText(clipText(ctx, spec.heading, textWidth), PAD, PAD + 120)

  ctx.font = font(150, 800)
  ctx.fillText(clipText(ctx, spec.amount, textWidth), PAD - 6, PAD + 230)

  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = font(46, 500)
  ctx.fillText(clipText(ctx, spec.line, textWidth), PAD, PAD + 420)

  const qrSize = 340
  const qrY = SIZE - PAD - qrSize - 70
  if (spec.qr) {
    try {
      drawQr(ctx, spec.qr, SIZE - PAD - qrSize, qrY, qrSize)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = font(34, 500)
      ctx.fillText('Scan with any UPI app', PAD, qrY + 20)
      if (spec.pay) {
        ctx.font = font(36, 700)
        const lines = wrap(ctx, spec.pay, SIZE - PAD * 2 - qrSize - 40).slice(0, 3)
        for (const [i, l] of lines.entries()) ctx.fillText(l, PAD, qrY + 80 + i * 48)
      }
    } catch {
      /* the link is too long for a QR: the text still carries it */
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = font(32, 500)
  ctx.fillText(clipText(ctx, spec.footer, textWidth), PAD, SIZE - PAD - 36)

  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/png')
    } catch {
      resolve(null)
    }
  })
  return blob ? new File([blob], 'split-now-reminder.png', { type: 'image/png' }) : null
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** Whether the share sheet here takes files (Android Chrome, iOS 15+). */
export function canShareFile(file: File | null): file is File {
  try {
    return !!file && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * Share the reminder: card + text + link where files are accepted, text + link otherwise, and
 * text copied to the clipboard where there is no share sheet at all.
 */
export async function shareReminder(a: ReminderArgs, file: File | null): Promise<'shared' | 'copied' | 'failed'> {
  const text = reminderText(a)
  const url = reminderUrl(a)
  const title = `Split Now · ${a.groupName}`
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      if (canShareFile(file)) await navigator.share({ title, text, url, files: [file] })
      else await navigator.share({ title, text, url })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'failed'
      // Some browsers refuse files or a url with files: try the plain text once.
      try {
        await navigator.share({ title, text, url })
        return 'shared'
      } catch (e2) {
        if ((e2 as DOMException).name === 'AbortError') return 'failed'
      }
    }
  }
  return (await copy(`${text} ${url}`)) ? 'copied' : 'failed'
}
