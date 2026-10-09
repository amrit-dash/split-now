import { AutoCapture, AutoCaptureOff } from '@/components/AutoCapture'
import { useFlag } from '@/hooks/useAppConfig'
import { SettingsPage } from './common'

/** /settings/automation: auto-capture status, filters, trips, keys, recent activity and the advanced paths. */
export default function Automation() {
  // The admin's switch (config/app flags.autoCapture): one line instead of the settings, and none of their listeners started.
  const autoCapture = useFlag('autoCapture')
  return (
    <SettingsPage title="Automation" subtitle="Bank and UPI payments, captured for you">
      {autoCapture ? <AutoCapture /> : <AutoCaptureOff />}
    </SettingsPage>
  )
}
