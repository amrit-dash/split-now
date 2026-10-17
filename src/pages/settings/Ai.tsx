import { repo } from '@/data'
import { AiSettings } from '@/components/AiSettings'
import { SettingsPage } from './common'

/** /settings/ai: one switch and a consent line, a titled section per kind of AI work, and the key plumbing under Your key and models. */
export default function Ai() {
  return (
    <SettingsPage
      title="AI features"
      subtitle={{ full: 'Reading bills, bank SMS and more with Google’s AI', short: 'Bills and bank SMS, read by AI', tier: 'help' }}
    >
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
