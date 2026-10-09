import { Copy, ExternalLink } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { PayOption } from '@/lib/payments'
import { encodeQr } from '@/lib/qr'
import { copy } from '@/lib/share'
import { QrCode } from '@/components/QrCode'
import { useToast } from '@/components/Toast'

/** Deep links (upi://, tez://) must open in place: a new tab breaks them, above all in the installed app. */
const opensInNewTab = (href: string) => /^https?:/i.test(href)

/**
 * How someone without the app pays the person owed: the UPI app buttons first (on another phone
 * the deep links matter most), then the exact-amount UPI QR, then every handle to copy. Used by
 * a closed live table (a guest paying the host) and by Pay me links (/r/{code}).
 */
export function GuestPay({ options, amount, currency }: { options: PayOption[]; amount: number; currency: string }) {
  const toast = useToast()
  const upi = options.find((o) => o.qr)
  let qrOk = true
  try {
    if (upi?.qr) encodeQr(upi.qr)
  } catch {
    qrOk = false
  }
  return (
    <div className="mt-4 space-y-3 text-left" data-testid="guest-pay">
      {upi?.apps && (
        <div className="grid grid-cols-3 gap-2">
          {upi.apps.map((a) => (
            <a key={a.id} className="btn btn-sm bg-brand-600 text-white" href={a.href} data-testid={`upi-${a.id}`}>
              {a.label}
            </a>
          ))}
        </div>
      )}
      {upi?.qr && qrOk && (
        <div className="flex flex-col items-center rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
          <QrCode value={upi.qr} size={180} label={`UPI QR code to pay ${upi.value} ${formatMoney(amount, currency)}`} />
          <p className="text-muted mt-2 text-xs">Scan with any UPI app to pay {formatMoney(amount, currency)}.</p>
        </div>
      )}
      {options.map((o) => (
        <div key={o.key} className="flex items-center gap-1 rounded-2xl bg-slate-50 p-2 pl-3 dark:bg-ink-800">
          <div className="min-w-0 flex-1">
            <div className="text-muted text-xs">{o.label}</div>
            <div className="truncate font-semibold">{o.value}</div>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            onClick={() => copy(o.value).then((ok) => toast(ok ? `${o.label} copied` : 'Couldn’t copy', ok ? 'ok' : 'err'))}
            aria-label={`Copy ${o.label}`}
          >
            <Copy size={18} />
          </button>
          {o.href &&
            (opensInNewTab(o.href) ? (
              <a
                className="flex h-11 w-11 items-center justify-center rounded-xl text-brand-600 dark:text-brand-300"
                href={o.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${o.label}`}
              >
                <ExternalLink size={18} />
              </a>
            ) : (
              <a
                className="flex h-11 w-11 items-center justify-center rounded-xl text-brand-600 dark:text-brand-300"
                href={o.href}
                aria-label={`Open ${o.label}`}
              >
                <ExternalLink size={18} />
              </a>
            ))}
        </div>
      ))}
    </div>
  )
}
