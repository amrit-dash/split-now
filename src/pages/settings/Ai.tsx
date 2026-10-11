import { repo } from '@/data'
import { AiSettings } from '@/components/AiSettings'
import { SettingsPage } from './common'

/** /settings/ai: one switch, a consent line, and the key plumbing under Advanced. */
export default function Ai() {
  return (
    <SettingsPage title="AI features" subtitle="Reading bills, bank SMS and more with Google’s AI">
      {repo.mode === 'firebase' ? (
        <AiSettings />
      ) : (
        <div className="card p-4">
          <p className="text-muted text-sm">AI reading isn’t part of the demo. Bills are read on this phone.</p>
        </div>
      )}
    </SettingsPage>
  )
}
