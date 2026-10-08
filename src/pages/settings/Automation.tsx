import { AutoCapture } from '@/components/AutoCapture'
import { SettingsPage } from './common'

/** /settings/automation: auto-capture status, filters, trips, keys, recent activity and the advanced paths. */
export default function Automation() {
  return (
    <SettingsPage title="Automation" subtitle="Bank and UPI payments, captured for you">
      <AutoCapture />
    </SettingsPage>
  )
}
