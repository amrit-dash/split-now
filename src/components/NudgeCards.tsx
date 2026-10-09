import { Link } from 'react-router-dom'
import { Bell, BellRing, Share, X } from 'lucide-react'
import { dismissNudges, nudgeCardText, restoreNudges, type NudgeCard } from '@/lib/nudge-inbox'
import { IOS_INSTALL_FOR_PUSH, isIOS, isStandalone, pushOffer, pushSupported } from '@/lib/push'
import { notificationsAvailable, useTurnOnPush } from './NotificationSettings'
import { useToast } from './Toast'

/**
 * "Priya reminded you · You owe ₹1,240 in Goa Trip · Settle up": the debtor's side of a nudge,
 * on Home and at the top of the Inbox (src/lib/nudge-inbox.ts picks them). Works without a push;
 * when this device could get pushes but hasn't turned them on, the card offers that too, so the
 * next nudge arrives as a notification.
 */
export function NudgeCards({ cards, className = '' }: { cards: NudgeCard[]; className?: string }) {
  const push = useTurnOnPush()
  const toast = useToast()
  const dismiss = (c: NudgeCard, name: string) => {
    dismissNudges(c.ids)
    toast(`Reminder from ${name} hidden`, 'ok', { action: { label: 'Undo', run: () => restoreNudges(c.ids) } })
  }
  if (cards.length === 0) return null
  const offer = pushOffer({ available: notificationsAvailable(), ios: isIOS(), standalone: isStandalone(), supported: pushSupported(), perm: push.perm })
  return (
    <div className={`space-y-3 ${className}`} data-testid="nudge-cards">
      {cards.map((c) => {
        const t = nudgeCardText(c)
        return (
          <section key={c.key} className="card flex items-start gap-3 p-4" data-testid="nudge-card" aria-label={t.title}>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"
              aria-hidden
            >
              <BellRing size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{t.title}</h2>
              <p className="text-muted text-sm">{t.line}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link to={c.href} className="btn-primary !min-h-10 !rounded-full !px-4 !py-0 text-sm" data-testid="nudge-settle">
                  Settle up
                </Link>
                {offer === 'enable' && (
                  <button
                    type="button"
                    onClick={push.turnOn}
                    disabled={push.busy}
                    className="btn-secondary !min-h-10 !rounded-full !px-4 !py-0 text-sm"
                    data-testid="nudge-push-on"
                  >
                    <Bell size={16} aria-hidden /> Turn on notifications
                  </button>
                )}
              </div>
              {offer === 'install' && (
                <p className="text-muted mt-2 flex items-start gap-1.5 text-xs">
                  <Share size={14} className="mt-0.5 shrink-0" aria-hidden />
                  {IOS_INSTALL_FOR_PUSH}, so reminders reach you as notifications.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(c, t.name)}
              aria-label={`Dismiss the reminder from ${t.name}`}
              className="text-muted -mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-ink-800"
              data-testid="nudge-dismiss"
            >
              <X size={18} aria-hidden />
            </button>
          </section>
        )
      })}
    </div>
  )
}
