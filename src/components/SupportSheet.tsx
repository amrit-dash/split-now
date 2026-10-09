import type { ReactNode } from 'react'
import { Coffee, ExternalLink, HandHeart, Heart, Star } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { SUPPORT_LINKS } from '@/lib/brand'

/**
 * Profile → Support the developer. Two ways to chip in (Buy Me a Coffee, GitHub Sponsors) and a
 * star on the repository. Every link opens outside the app (a new tab, or the browser from the
 * installed app); nothing is paid or recorded inside Split Now, so it works the same in demo mode.
 */
export function SupportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Support the developer" testId="support-sheet" describedBy="support-why">
      <div className="flex flex-col items-center text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-brand-500 to-duo-500 text-white shadow-lg shadow-brand-600/30"
          aria-hidden
        >
          <HandHeart size={30} strokeWidth={2} />
        </span>
        <p id="support-why" className="text-muted mt-4 max-w-sm text-sm leading-relaxed">
          Split Now is free, open source and has no ads, and I build it on my own. If it has saved your group a few awkward conversations, a coffee or a
          sponsorship helps pay for hosting and new features.
        </p>
        <p className="mt-1.5 text-sm font-semibold">Amrit</p>
      </div>

      <div className="mt-5 space-y-2.5">
        <SupportLink
          href={SUPPORT_LINKS.coffee}
          testId="support-coffee"
          className="bg-[#ffdd00] text-slate-900 shadow-sm shadow-amber-500/20 active:bg-[#f5d400]"
          iconClass="bg-white/60 text-slate-900"
          icon={<Coffee size={20} aria-hidden />}
          title="Buy me a coffee"
          sub="A one-off thank you, any amount"
        />
        <SupportLink
          href={SUPPORT_LINKS.sponsors}
          testId="support-sponsors"
          className="bg-slate-900 text-white active:bg-slate-800 dark:bg-white dark:text-slate-900 dark:active:bg-slate-100"
          iconClass="bg-white/10 text-pink-400 dark:bg-pink-50 dark:text-pink-600"
          icon={<Heart size={20} fill="currentColor" aria-hidden />}
          title="Sponsor on GitHub"
          sub="Monthly or one-time"
        />
      </div>

      <a
        href={SUPPORT_LINKS.repo}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-auto mt-4 flex min-h-11 w-fit items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 active:scale-95 dark:text-brand-300 dark:hover:bg-brand-900/30"
      >
        <Star size={16} aria-hidden /> Or star the project on GitHub
      </a>
    </Sheet>
  )
}

function SupportLink({
  href,
  testId,
  className,
  iconClass,
  icon,
  title,
  sub,
}: {
  href: string
  testId: string
  className: string
  iconClass: string
  icon: ReactNode
  title: string
  sub: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className={`flex min-h-16 items-center gap-3 rounded-2xl p-3 pr-4 text-left transition active:scale-[0.98] ${className}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-xs opacity-75">{sub}</span>
        <span className="sr-only">, opens outside the app</span>
      </span>
      <ExternalLink size={16} className="shrink-0 opacity-60" aria-hidden />
    </a>
  )
}
