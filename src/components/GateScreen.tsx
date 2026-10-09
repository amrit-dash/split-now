import type { ReactNode } from 'react'
import { CirclePause, RefreshCw, Wrench } from 'lucide-react'
import { repo } from '@/data'
import { usePageTitle } from '@/lib/brand'
import { maintenanceText } from '@/lib/flags'
import { Aurora } from './Aurora'

/*
 * The full-screen notices that stand in for the app (App.tsx): maintenance, update required,
 * account paused, and the guest "switched off" pages. One layout on the living brand surface
 * (Aurora): an icon tile, a title, a sentence, an optional quiet status line, and one clear action.
 * `preview` draws the same thing as an inert card for the admin console (no h1, nothing tappable).
 */
export function GateScreen({
  title,
  message,
  icon,
  note,
  children,
  testId,
  preview = false,
}: {
  title: string
  message?: string
  icon?: ReactNode
  note?: ReactNode
  children?: ReactNode
  testId?: string
  preview?: boolean
}) {
  usePageTitle(preview ? undefined : title)
  const Heading = preview ? 'h2' : 'h1'
  const body = (
    <>
      <Aurora />
      <div
        className={`relative flex flex-1 flex-col items-center justify-center text-center ${
          preview ? 'px-5 py-8' : 'px-6 pb-8 pt-[calc(env(safe-area-inset-top)+2.5rem)]'
        }`}
      >
        <div
          className={`flex items-center justify-center bg-white/15 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.45)] ring-1 ring-white/25 backdrop-blur-md ${
            preview ? 'mb-5 h-16 w-16 rounded-3xl' : 'mb-7 h-20 w-20 rounded-[1.75rem]'
          }`}
        >
          {icon ?? <img src="/favicon.svg" alt="" className="h-11 w-11" />}
        </div>
        <Heading className={`font-extrabold leading-tight tracking-tight ${preview ? 'text-xl' : 'text-[1.75rem]'}`}>{title}</Heading>
        {message && (
          <p className={`mt-3 max-w-sm whitespace-pre-line break-words leading-relaxed text-white/85 ${preview ? 'text-sm' : 'text-[0.95rem]'}`}>{message}</p>
        )}
        {note}
        {children && <div className={`flex w-full max-w-xs flex-col items-stretch gap-1 ${preview ? 'mt-6' : 'mt-8'}`}>{children}</div>}
      </div>
      <div
        className={`relative flex items-center justify-center gap-2 text-sm font-semibold text-white/70 ${
          preview ? 'pb-4' : 'pb-[calc(env(safe-area-inset-bottom)+1.25rem)]'
        }`}
        aria-hidden
      >
        <img src="/favicon.svg" alt="" className="h-5 w-5" />
        Split Now
      </div>
    </>
  )
  if (preview) {
    return (
      <div
        className="relative isolate flex min-h-[24rem] flex-col overflow-hidden rounded-2xl bg-brand-700 text-white shadow-lg shadow-brand-600/20"
        data-testid={testId}
        inert
      >
        {body}
      </div>
    )
  }
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-brand-700 text-white" data-testid={testId}>
      {body}
    </main>
  )
}

/** The white pill button every gate uses for its one action. */
const primary = 'btn bg-white text-slate-900 shadow-lg shadow-black/15'
/** The quiet text action under it (sign out). */
const quiet = 'min-h-11 rounded-2xl text-sm font-medium text-white/80 underline-offset-4 hover:underline'

/**
 * Maintenance (config/app.maintenance) for everyone but admins. The config listener flips the app
 * back by itself the moment it is turned off, which the "Checking again automatically" line says;
 * Try again reloads for anyone who doesn't want to wait on it.
 */
export function MaintenanceScreen({ message, preview = false }: { message: string; preview?: boolean }) {
  return (
    <GateScreen
      preview={preview}
      title="Back in a few minutes"
      message={maintenanceText(message)}
      icon={<Wrench size={preview ? 30 : 36} strokeWidth={2.25} className="motion-safe:animate-tinker" aria-hidden />}
      testId={preview ? 'maintenance-preview' : 'maintenance-screen'}
      note={
        <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85 ring-1 ring-white/15">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
          </span>
          Checking again automatically
        </p>
      }
    >
      <button type="button" className={primary} onClick={() => location.reload()} data-testid="maintenance-retry">
        Try again
      </button>
      <button type="button" className={quiet} onClick={() => void repo.signOut()}>
        Sign out
      </button>
    </GateScreen>
  )
}

/** config/app.minVersion is newer than this build: reload once (skipping the waiting service worker) to get it. */
export function UpdateRequiredScreen({ version, minVersion, busy, onUpdate }: { version: string; minVersion: string; busy: boolean; onUpdate: () => void }) {
  return (
    <GateScreen
      title="Update Split Now"
      message={`This copy (${version}) is older than the app now needs (${minVersion}). Reload once to get the latest.`}
      icon={<RefreshCw size={34} strokeWidth={2.25} className={busy ? 'motion-safe:animate-spin' : ''} aria-hidden />}
      testId="update-required-screen"
    >
      <button type="button" className={primary} onClick={onUpdate} disabled={busy}>
        {busy ? 'Updating…' : 'Reload and update'}
      </button>
    </GateScreen>
  )
}

/** blocked/{uid}: an admin paused this account. Signing out is all there is to do here. */
export function BlockedScreen({ reason }: { reason: string }) {
  return (
    <GateScreen
      title="This account is paused"
      message={reason ? `An admin paused it: ${reason}` : 'An admin paused it. Nothing can be added or changed from it.'}
      icon={<CirclePause size={36} strokeWidth={2.25} aria-hidden />}
      testId="blocked-screen"
    >
      <button type="button" className={primary} onClick={() => void repo.signOut()}>
        Sign out
      </button>
    </GateScreen>
  )
}
