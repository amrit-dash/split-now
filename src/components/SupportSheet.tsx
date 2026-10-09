import type { ReactNode } from 'react'
import { Coffee, ExternalLink, Globe, HandHeart, Heart, Quote, Star } from 'lucide-react'
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
      </div>

      {/* A note from the developer: reads as a short signed message, not marketing copy. */}
      <figure className="relative mt-5 rounded-2xl bg-brand-50 px-4 pb-4 pt-5 text-left dark:bg-brand-900/20" data-testid="support-note">
        <Quote
          size={22}
          className="absolute -top-3 left-4 rounded-full bg-white p-1 text-brand-500 shadow-sm dark:bg-ink-900 dark:text-brand-300"
          fill="currentColor"
          aria-hidden
        />
        <blockquote id="support-why" className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          <p>
            I built Split Now because settling up after a trip shouldn’t need a spreadsheet, a paid plan or an awkward reminder. It’s free, open source and has
            no ads, and I’m the one building it.
          </p>
          <p>If it’s saved your group a few uncomfortable money chats, a coffee or a small sponsorship helps cover hosting and keeps new features coming.</p>
        </blockquote>
        <figcaption className="mt-3 text-right text-sm font-semibold">— Amrit Dash</figcaption>
      </figure>

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

      <div className="mt-4 flex flex-wrap justify-center gap-1">
        <a
          href={SUPPORT_LINKS.website}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="support-website"
          className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 active:scale-95 dark:text-brand-300 dark:hover:bg-brand-900/30"
        >
          <Globe size={16} aria-hidden /> amritdash.web.app<span className="sr-only">, my website, opens outside the app</span>
        </a>
        <a
          href={SUPPORT_LINKS.repo}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 active:scale-95 dark:text-brand-300 dark:hover:bg-brand-900/30"
        >
          <Star size={16} aria-hidden /> Star the project on GitHub
        </a>
      </div>
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
