import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, ChevronRight, Search } from 'lucide-react'
import { Empty, PageHeader, Segmented } from '@/components/Misc'
import { UiIcon } from '@/components/UiIcon'
import { StepPlayer, StepText } from '@/features/help/StepPlayer'
import { StoryPlayer } from '@/features/help/StoryPlayer'
import { APP_SEMVER, useWhatsNew } from '@/hooks/useWhatsNew'
import { usePageTitle } from '@/lib/brand'
import { guideLayout, type HelpSection, relatedOf, searchHelp } from '@/lib/help'
import { CHAPTERS, SECTIONS } from '@/lib/help-content'
import { type Release, releasesFor } from '@/lib/whats-new'
import { CompassIcon, MagnifyingGlassIcon, PlantIcon } from '@/components/icons'

type Tab = 'guide' | 'new'

/**
 * Help (Profile → Help): the guide, searchable, with the explainers (How it works) and the main features first, and What's new,
 * every release of this major version with each line linked to its section. /help/<id> is one
 * section: its explainer or its steps (played), what to know, Try it, and related sections.
 */
export default function Help() {
  const { sectionId } = useParams()
  if (sectionId) return <SectionPage id={sectionId} />
  return <HelpHome />
}

function HelpHome() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'new' ? 'new' : 'guide'
  usePageTitle(tab === 'new' ? 'What’s new' : 'Help')
  const { unseen } = useWhatsNew()
  return (
    <div>
      <PageHeader title="Help" back="/profile" />
      <Segmented<Tab>
        value={tab}
        onChange={(t) => setParams(t === 'new' ? { tab: 'new' } : {}, { replace: true })}
        label="Help"
        testId="help-tabs"
        options={[
          { value: 'guide', label: 'Guide' },
          {
            value: 'new',
            label: (
              <span className="inline-flex items-center gap-1.5">
                What’s new
                {unseen.length > 0 && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden />
                    <span className="sr-only">, new releases</span>
                  </>
                )}
              </span>
            ),
          },
        ]}
      />
      <div className="mt-4">{tab === 'new' ? <WhatsNew /> : <Guide />}</div>
    </div>
  )
}

// The cards pop in the first time the guide is shown in a visit; switching tabs or coming back
// from a section shows them as they are, so the page doesn't look like it reloaded.
let guideShown = false

function Guide() {
  const [popIn] = useState(() => !guideShown)
  useEffect(() => {
    guideShown = true
  }, [])
  // The search is in the address (replaced, not a new entry per letter), so back from a result
  // finds the results it was opened from.
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const setQ = (v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set('q', v)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  const found = searchHelp(q, SECTIONS)
  const layout = guideLayout(CHAPTERS, SECTIONS)
  return (
    <div className="space-y-5">
      <form role="search" className="relative" onSubmit={(e) => e.preventDefault()}>
        <Search size={16} className="text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
        <input
          className="input !pl-9"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 60))}
          placeholder="Search, e.g. split, UPI, refund"
          aria-label="Search help"
          enterKeyHint="search"
          autoComplete="off"
          data-testid="help-search"
        />
      </form>
      {q.trim().length >= 2 ? (
        found.length ? (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5" data-testid="help-results">
            {found.map((s) => (
              <SectionRow key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <Empty icon={MagnifyingGlassIcon} title="Nothing found">
            Try another word, or browse the features below.
          </Empty>
        )
      ) : (
        <>
          <section aria-labelledby="help-how">
            <h2 id="help-how" className="label mb-2">
              How it works
            </h2>
            {/* data-keep-scroll: back from an explainer finds the row where it was left (useScrollMemory). */}
            <div className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1" data-testid="help-stories" data-keep-scroll="help-stories">
              {layout.stories.map((s, i) => (
                <Link
                  key={s.id}
                  to={`/help/${s.id}`}
                  className={`card flex min-h-24 w-40 shrink-0 snap-start flex-col gap-1 bg-gradient-to-br from-brand-50 to-duo-50 p-3 transition active:scale-[0.98] dark:from-brand-900/30 dark:to-duo-900/20 ${popIn ? 'animate-pop' : ''}`}
                  style={popIn ? { animationDelay: `${i * 40}ms` } : undefined}
                  data-testid="help-story-card"
                >
                  {s.icon && <UiIcon name={s.icon} size={28} kind="feature" className="text-brand-600 dark:text-brand-300" />}
                  <span className="text-sm font-bold leading-tight">{s.title}</span>
                  <span className="text-muted line-clamp-2 text-xs">{s.summary}</span>
                </Link>
              ))}
            </div>
          </section>
          <section aria-labelledby="help-main">
            <h2 id="help-main" className="label mb-2">
              Main features
            </h2>
            <div className="grid grid-cols-2 gap-2" data-testid="help-core">
              {layout.core.map((s, i) => (
                <Link
                  key={s.id}
                  to={`/help/${s.id}`}
                  className={`card flex min-h-24 flex-col gap-1 p-3 transition active:scale-[0.98] ${popIn ? 'animate-pop' : ''}`}
                  style={popIn ? { animationDelay: `${i * 40}ms` } : undefined}
                  data-testid="help-core-card"
                >
                  {s.icon && <UiIcon name={s.icon} size={28} kind="feature" className="text-brand-600 dark:text-brand-300" />}
                  <span className="text-sm font-bold leading-tight">{s.title}</span>
                  <span className="text-muted line-clamp-2 text-xs">{s.summary}</span>
                </Link>
              ))}
            </div>
          </section>
          {layout.chapters.map(({ chapter, sections }) => (
            <section key={chapter.id} aria-labelledby={`help-${chapter.id}`}>
              <h2 id={`help-${chapter.id}`} className="label mb-2">
                {chapter.title}
              </h2>
              <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
                {sections.map((s) => (
                  <SectionRow key={s.id} s={s} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function SectionRow({ s }: { s: HelpSection }) {
  return (
    <Link to={`/help/${s.id}`} className="flex min-h-11 items-center gap-3 p-3 transition active:bg-slate-50 dark:active:bg-ink-800" data-testid="help-row">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
        aria-hidden
      >
        <UiIcon name={s.icon ?? 'file'} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{s.title}</span>
        <span className="text-muted block truncate text-xs">{s.summary}</span>
      </span>
      <ChevronRight size={18} className="text-muted shrink-0" aria-hidden />
    </Link>
  )
}

function WhatsNew() {
  const { unseen, markSeen } = useWhatsNew()
  // What was new when the tab opened stays marked for this visit; opening it marks it all seen.
  const [fresh] = useState(() => new Set(unseen.map((r) => r.version)))
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on opening the tab
  useEffect(() => markSeen(), [])
  const releases = releasesFor(APP_SEMVER)
  if (!releases.length)
    return (
      <Empty icon={PlantIcon} title="Nothing yet">
        This version has just started. Its changes will be listed here.
      </Empty>
    )
  return (
    <div className="space-y-3" data-testid="whats-new">
      {releases.map((r, i) => (
        <ReleaseCard key={r.version} r={r} fresh={fresh.has(r.version)} first={i === 0} />
      ))}
      <p className="text-muted px-1 text-center text-xs">The full list of changes is in CHANGELOG.md on GitHub.</p>
    </div>
  )
}

function ReleaseCard({ r, fresh, first }: { r: Release; fresh: boolean; first: boolean }) {
  return (
    <section className={`card p-4 ${fresh ? 'ring-2 ring-brand-500' : ''}`} aria-labelledby={`v-${r.version}`} data-testid="release">
      <div className="mb-2 flex items-center gap-2">
        <h2 id={`v-${r.version}`} className="text-base font-extrabold">
          {r.version}
        </h2>
        <span className="text-muted text-xs">{r.date}</span>
        {/* The newest release this app has: the accent pill. New since this phone last looked: an outlined one beside it. */}
        {first && (
          <span className="rounded-full bg-fill px-2 py-0.5 text-[0.65rem] font-bold text-on-fill" data-testid="release-latest">
            Latest
          </span>
        )}
        {fresh && <span className="rounded-full px-2 py-0.5 text-[0.65rem] font-bold text-brand-700 ring-1 ring-brand-500 dark:text-brand-200">New</span>}
      </div>
      <ul className="space-y-0.5">
        {r.items.map((it) => (
          <li key={it.text}>
            <Link
              to={`/help/${it.section}`}
              className="flex min-h-11 items-center gap-2 rounded-xl py-1.5 text-sm transition active:bg-slate-50 dark:active:bg-ink-800"
              data-testid="release-item"
            >
              <span className="min-w-0 flex-1">{it.text}</span>
              <ChevronRight size={16} className="text-muted shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SectionPage({ id }: { id: string }) {
  const s = SECTIONS.find((x) => x.id === id)
  usePageTitle(s ? s.title : 'Help')
  if (!s)
    return (
      <div>
        <PageHeader title="Help" back="/help" />
        <Empty icon={CompassIcon} title="That page isn’t here">
          <Link to="/help" className="font-semibold text-brand-700 dark:text-brand-300">
            Back to Help
          </Link>
        </Empty>
      </div>
    )
  const related = relatedOf(s, SECTIONS)
  return (
    <div className="space-y-4" data-testid="help-section">
      <PageHeader title={s.title} back="/help" subtitle={s.summary} />
      {s.story ? <StoryPlayer key={s.id} kind={s.story.kind} beats={s.story.beats} /> : null}
      {s.steps?.length ? <StepPlayer key={s.id} sectionId={s.id} steps={s.steps} /> : null}
      {s.open && (
        <Link to={s.open.to} className="btn-primary w-full" data-testid="help-try">
          Try it: {s.open.label} <ArrowRight size={16} aria-hidden />
        </Link>
      )}
      {s.points.length > 0 && (
        <section className="card p-4" aria-labelledby="help-know">
          <h2 id="help-know" className="mb-2 text-sm font-bold">
            What to know
          </h2>
          <ul className="space-y-2">
            {s.points.map((p) => (
              <li key={p} className="flex gap-2 text-sm leading-5">
                {/* The dot in a box one line tall: level with the first line's middle, at any number of lines. */}
                <span className="flex h-5 shrink-0 items-center" aria-hidden>
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                </span>
                <StepText text={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {related.length > 0 && (
        <section aria-labelledby="help-related">
          <h2 id="help-related" className="label mb-2">
            Related
          </h2>
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-white/5">
            {related.map((r) => (
              <SectionRow key={r.id} s={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
