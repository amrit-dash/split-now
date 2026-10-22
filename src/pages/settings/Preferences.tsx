import { useState, useSyncExternalStore } from 'react'
import { usePickableGroups } from '@/hooks/useVault'
import { repo } from '@/data'
import { useMe } from '@/hooks/auth'

import { useAppConfig } from '@/hooks/useAppConfig'
import { CURRENCIES } from '@/lib/money'
import { errText } from '@/lib/errors'
import { appLocale } from '@/lib/locale'
import { type IconStyleChoice, ICON_STYLE_CHOICES, ICON_STYLE_INFO, iconVariant } from '@/lib/icon-style'
import { getIconStylePref, setIconStylePref, subscribeIconStylePref } from '@/lib/icon-style-pref'
import { LOOK_CHOICES, LOOK_INFO, type LookChoice } from '@/lib/look'
import { getLookPref, setLookPref, subscribeLookPref } from '@/lib/look-pref'
import { collectsInHome } from '@/lib/collect'
import { MODE_INFO, type Mode } from '@/lib/mode'
import { setModePref } from '@/lib/mode-pref'
import { useMode } from '@/hooks/useMode'
import { getTheme, setTheme as saveTheme, type Theme } from '@/lib/theme'
import { AccentPicker } from '@/components/AccentPicker'
import { HintText, InfoTip, useShows, type Hint } from '@/components/Hint'
import { AdvancedModeIcon, ContrastIcon, HomeIcon, MoonIcon, SimpleModeIcon, SunIcon } from '@/components/icons'
import { Segmented } from '@/components/Misc'
import { RatesField } from '@/components/ProfileCards'
import { Select, currencyOptions } from '@/components/Select'
import { Switch } from '@/components/Switch'
import { useToast } from '@/components/Toast'
import { SectionTitle, SettingsPage, useSavedFlash } from './common'

const CURRENCY_HINT: Hint = {
  full: 'Used for new groups and for totals across groups. Each group keeps its own currency.',
  short: 'For new groups and totals across groups',
  tier: 'help',
}
const SYNC_HINT: Hint = {
  full: 'Theme, accent, icons and detail level are the same on every device you sign in on.',
  short: 'Same on every device you sign in on',
  tier: 'help',
}
// Every row of the Appearance card has a 'help' line (Accent's and Text on accent's are in AccentPicker), so they show together or not at all.
const THEME_HINT: Hint = { full: 'Auto follows your device’s light or dark mode', short: 'Auto follows your device', tier: 'help' }
const ICONS_HINT: Hint = {
  full: 'Outline draws light line icons; Filled draws solid ones. The tab you are on is always solid.',
  short: 'Line or solid icons',
  tier: 'help',
}
const DETAIL_HINT: Hint = {
  full: 'How much the app explains under each option. Lines that stop a mistake with money always stay.',
  short: 'How much the app explains under each option',
  tier: 'help',
}

/** /settings/preferences: default currency (with the rates refresh), theme, accent and detail level. All autosave; the look follows the account (appearance-sync.ts). */
export default function Preferences() {
  const { profile } = useMe()
  const toast = useToast()
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [currencySaved, flashCurrency] = useSavedFlash()
  const [lookSaved, flashLook] = useSavedFlash()
  const [modeSaved, flashMode] = useSavedFlash()
  const mode = useMode()
  // Simple keeps currency, theme, accent and its text; the rest keep their values, out of sight (src/lib/mode.ts).
  const simple = mode === 'simple'
  const adminLook = useAppConfig().look
  const lookChoice = useSyncExternalStore(subscribeLookPref, getLookPref, getLookPref)
  const adminIcons = useAppConfig().icons
  const iconChoice = useSyncExternalStore(subscribeIconStylePref, getIconStylePref, getIconStylePref)
  const groups = usePickableGroups()
  const showAll = useShows(2)
  // Minimal hides "Collect in" unless it matters: a group in another currency, or it's already on (so it can be turned off).
  const showCollect = showAll || collectsInHome(profile) || !!groups?.some((g) => g.currency !== profile.currency)
  const collectHint: Hint = {
    full: (
      <>
        Balances adds up what each person owes you across currencies, in {profile.currency} at today’s rate, and friends paying you are offered{' '}
        {profile.currency} first (a UPI QR when it’s INR). Groups keep their own currency.
      </>
    ),
    short: `Totals and payments to you in ${profile.currency}, at today’s rate`,
    tier: 'help',
  }

  const setCurrency = async (currency: string) => {
    if (currency === profile.currency) return
    try {
      await repo.saveProfile({ ...profile, currency })
      flashCurrency()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }

  // Saved on the profile and shared with every group (memberProfileOf), so payers see it too.
  const setCollect = async (collectInHome: boolean) => {
    try {
      await repo.saveProfile({ ...profile, collectInHome })
      flashCurrency()
    } catch (e) {
      toast(errText(e), 'err')
    }
  }

  return (
    <SettingsPage title="Preferences">
      <SectionTitle saved={modeSaved}>Mode</SectionTitle>
      <div className="card p-4">
        <Segmented<Mode>
          label="Mode"
          testId="mode"
          value={mode}
          onChange={(m) => {
            setModePref(m)
            flashMode()
          }}
          options={[
            {
              value: 'simple',
              label: (
                <span className="inline-flex items-center gap-1">
                  <SimpleModeIcon size={16} aria-hidden /> {MODE_INFO.simple.label}
                </span>
              ),
            },
            {
              value: 'advanced',
              label: (
                <span className="inline-flex items-center gap-1">
                  <AdvancedModeIcon size={16} aria-hidden /> {MODE_INFO.advanced.label}
                </span>
              ),
            },
          ]}
        />
        <p className="text-muted mt-1.5 text-xs">{MODE_INFO[mode].hint}</p>
      </div>

      <SectionTitle saved={currencySaved}>Money</SectionTitle>
      <div className="card p-4">
        <RatesField base={profile.currency} hint={CURRENCY_HINT}>
          <Select aria-label="Default currency" value={profile.currency} onChange={setCurrency} options={currencyOptions(CURRENCIES, appLocale())} />
        </RatesField>
        {showCollect && !simple && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
            <div className="min-w-0">
              <div className="flex items-center font-medium" id="collect-home-label">
                Collect in {profile.currency}
                <InfoTip hint={collectHint} label={`About collect in ${profile.currency}`} />
              </div>
              <HintText hint={collectHint} id="collect-home-hint" />
            </div>
            <Switch checked={collectsInHome(profile)} onChange={(on) => void setCollect(on)} label={`Collect in ${profile.currency}`} testId="collect-home" />
          </div>
        )}
      </div>

      <SectionTitle saved={lookSaved}>Appearance</SectionTitle>
      <div className="card space-y-4 p-4">
        <div>
          <div className="label flex items-center" id="theme-label">
            Theme
            <InfoTip hint={THEME_HINT} label="About theme" />
          </div>
          <Segmented<Theme>
            label="Theme"
            testId="theme"
            value={theme}
            onChange={(t) => {
              setTheme(t)
              saveTheme(t)
              flashLook()
            }}
            options={[
              {
                value: 'system',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <ContrastIcon size={16} aria-hidden /> Auto
                  </span>
                ),
              },
              {
                value: 'light',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <SunIcon size={16} aria-hidden /> Light
                  </span>
                ),
              },
              {
                value: 'dark',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <MoonIcon size={16} aria-hidden /> Dark
                  </span>
                ),
              },
            ]}
          />
          <HintText hint={THEME_HINT} className="text-muted mt-1.5 text-xs" />
        </div>
        <AccentPicker onChange={flashLook} duo={!simple} />
        {!simple && (
          <>
            <div>
              <div className="label flex items-center" id="icons-label">
                Icons
                <InfoTip hint={ICONS_HINT} label="About icons" />
              </div>
              {/* Each choice shows a house in the weight it draws, so the difference is visible before picking. */}
              <Segmented<IconStyleChoice>
                label="Icons"
                testId="icon-style"
                value={iconChoice}
                onChange={(v) => {
                  setIconStylePref(v)
                  flashLook()
                }}
                options={ICON_STYLE_CHOICES.map((c) => ({
                  value: c,
                  label: (
                    <span className="inline-flex items-center gap-1">
                      <HomeIcon size={16} solid={iconVariant(c === 'app' ? adminIcons : c) === 'solid'} aria-hidden />{' '}
                      {c === 'app' ? 'Default' : ICON_STYLE_INFO[c].label}
                    </span>
                  ),
                }))}
              />
              <HintText
                hint={{ ...ICONS_HINT, full: `${ICONS_HINT.full} Default follows Split Now (${ICON_STYLE_INFO[adminIcons].label}).` }}
                className="text-muted mt-1.5 text-xs"
              />
            </div>
            <div>
              <div className="flex items-center">
                <label className="label !mb-0" htmlFor="detail-level">
                  Detail level
                </label>
                <InfoTip hint={DETAIL_HINT} label="About detail level" />
              </div>
              <div className="mt-1.5">
                <Select<LookChoice>
                  id="detail-level"
                  aria-label="Detail level"
                  value={lookChoice}
                  onChange={(v) => {
                    setLookPref(v)
                    flashLook()
                  }}
                  options={LOOK_CHOICES.map((c) =>
                    c === 'app'
                      ? { value: c, label: `App default (${LOOK_INFO[adminLook].label})`, text: 'App default', hint: 'Follows what Split Now sets' }
                      : { value: c, label: LOOK_INFO[c].label, hint: LOOK_INFO[c].hint },
                  )}
                />
              </div>
              <HintText hint={DETAIL_HINT} className="text-muted mt-1.5 text-xs" />
            </div>
          </>
        )}
        <HintText hint={SYNC_HINT} />
      </div>
    </SettingsPage>
  )
}
