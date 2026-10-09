import { useState } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'
import { CURRENCIES } from '@/lib/money'
import { errText } from '@/lib/errors'
import { appLocale } from '@/lib/locale'
import { applyTheme, getTheme, type Theme } from '@/lib/theme'
import { AccentPicker } from '@/components/AccentPicker'
import { Segmented } from '@/components/Misc'
import { RatesField } from '@/components/ProfileCards'
import { Select, currencyOptions } from '@/components/Select'
import { useToast } from '@/components/Toast'
import { SectionTitle, SettingsPage, useSavedFlash } from './common'

/** /settings/preferences: default currency (with the rates refresh), theme and accent. All autosave. */
export default function Preferences() {
  const { profile } = useMe()
  const toast = useToast()
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [currencySaved, flashCurrency] = useSavedFlash()
  const [lookSaved, flashLook] = useSavedFlash()

  const setCurrency = async (currency: string) => {
    if (currency === profile.currency) return
    try {
      await repo.saveProfile({ ...profile, currency })
      flashCurrency()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }

  return (
    <SettingsPage title="Preferences">
      <SectionTitle saved={currencySaved}>Money</SectionTitle>
      <div className="card p-4">
        <RatesField base={profile.currency}>
          <Select aria-label="Default currency" value={profile.currency} onChange={setCurrency} options={currencyOptions(CURRENCIES, appLocale())} />
        </RatesField>
        <p className="text-muted mt-2 text-xs">Used for new groups and for totals across groups. Each group keeps its own currency.</p>
      </div>

      <SectionTitle saved={lookSaved}>Appearance</SectionTitle>
      <div className="card space-y-4 p-4">
        <div>
          <div className="label" id="theme-label">
            Theme
          </div>
          <Segmented<Theme>
            label="Theme"
            testId="theme"
            value={theme}
            onChange={(t) => {
              setTheme(t)
              applyTheme(t)
              flashLook()
            }}
            options={[
              {
                value: 'system',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <SunMoon size={15} aria-hidden /> Auto
                  </span>
                ),
              },
              {
                value: 'light',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Sun size={15} aria-hidden /> Light
                  </span>
                ),
              },
              {
                value: 'dark',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Moon size={15} aria-hidden /> Dark
                  </span>
                ),
              },
            ]}
          />
        </div>
        <AccentPicker onChange={flashLook} />
        <p className="text-muted text-xs">Theme and accent are kept on this device.</p>
      </div>
    </SettingsPage>
  )
}
