import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for updates hourly while the app is open.
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="animate-pop fixed inset-x-3 top-3 z-[90] mx-auto max-w-md safe-top">
      <div className="flex items-center gap-3 rounded-2xl bg-brand-600 p-3 pl-4 text-white shadow-xl">
        <div className="flex-1 text-sm font-medium">A new version of Split Now is ready.</div>
        <button className="rounded-xl bg-white/20 px-3 py-1.5 text-sm font-semibold" onClick={() => setNeedRefresh(false)}>Later</button>
        <button className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-brand-700" onClick={() => updateServiceWorker(true)}>Update</button>
      </div>
    </div>
  )
}
