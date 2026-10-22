import { repo } from '@/data'
import { AiSettings } from '@/components/AiSettings'
import { SettingsPage } from './common'

/** /settings/ai: one switch and a consent line, a titled section per kind of AI work, and the key plumbing under Your key and models. */
export default function Ai() {
  return (
    <SettingsPage
      title="AI features"
      subtitle={{ full: 'Bills, bank SMS and more, read by Google’s AI', short: 'Bills and bank SMS, read by AI', tier: 'help' }}
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
