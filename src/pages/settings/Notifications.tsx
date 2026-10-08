import { repo } from '@/data'
import { NotificationSettings, notificationsAvailable } from '@/components/NotificationSettings'
import { SettingsPage } from './common'

/** /settings/notifications */
export default function Notifications() {
  return (
    <SettingsPage title="Notifications">
      {notificationsAvailable() ? (
        <NotificationSettings />
      ) : (
        <div className="card p-4">
          <p className="text-muted text-sm">
            {repo.mode === 'demo'
              ? 'Notifications aren’t part of the demo. With a Firebase project set up, this is where you turn on push for each device and choose what to be told about.'
              : 'Push notifications aren’t set up for this build (no VAPID key).'}
          </p>
        </div>
      )}
    </SettingsPage>
  )
}
