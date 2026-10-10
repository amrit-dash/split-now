import type { ReactNode } from 'react'
import { Aurora } from '@/components/Aurora'
import { CardFirework } from '@/components/CardFirework'
import { Segmented } from '@/components/Misc'
import { Switch } from '@/components/Switch'
import { useMotion } from '@/hooks/useMotion'
import { type FireworkSize, type FlowSpeed, isDefaultMotion, type MotionPrefs, resetMotion, setMotion } from '@/lib/motion'
import { SavedPill, SectionTitle, SettingsPage, useSavedFlash } from './common'

/**
 * /settings/animations: the Home card's fireworks, colour flow and floating circles. A master
 * switch, then each one on its own, with a live preview card at the top. Kept on this device
 * (src/lib/motion.ts) and applied at once. The device's reduce-motion setting wins over all of it.
 */
export default function Animations() {
  const { prefs, reduced } = useMotion()
  const [saved, flash] = useSavedFlash()
  const set = (patch: Partial<MotionPrefs>) => {
    setMotion(patch)
    flash()
  }
  const off = reduced || !prefs.on

  return (
    <SettingsPage title="Animations" right={<SavedPill on={saved} />}>
      {/* Preview: the Home card's surface with the fireworks it shows when you're settled up. */}
      <div
        className="relative isolate mb-5 flex h-36 items-end overflow-hidden rounded-[2rem] bg-fill p-5 text-on-fill shadow-xl shadow-fill/30"
        data-testid="motion-preview"
      >
        <Aurora persist={false} />
        <CardFirework testId="motion-preview-firework" />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Preview</div>
          <div className="text-lg font-bold">All settled up</div>
        </div>
      </div>

      {reduced && (
        <p className="card mb-4 p-4 text-sm" data-testid="motion-reduced">
          Your device is set to reduce motion, so these stay still. Turn that off in your device’s settings to use them.
        </p>
      )}

      <div className="card p-4">
        <Row
          title="All animations"
          text="Fireworks, moving colours and floating circles on the Home card and buttons"
          checked={prefs.on && !reduced}
          disabled={reduced}
          onChange={(on) => set({ on })}
          testId="motion-on"
        />
      </div>

      <fieldset disabled={off} className={`mt-5 transition-opacity ${off ? 'opacity-50' : ''}`}>
        <SectionTitle>Fireworks</SectionTitle>
        <div className="card space-y-4 p-4">
          <Row
            title="Fireworks"
            text="On the Home card when you’re all settled up"
            checked={prefs.fireworks}
            disabled={off}
            onChange={(fireworks) => set({ fireworks })}
            testId="motion-fireworks"
          />
          <Sub off={!prefs.fireworks}>
            <div className="label" id="motion-size-label">
              Size
            </div>
            <Segmented<FireworkSize>
              label="Firework size"
              testId="motion-size"
              value={prefs.size}
              onChange={(size) => set({ size })}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'big', label: 'Big' },
              ]}
            />
          </Sub>
          <Sub off={!prefs.fireworks}>
            <Row
              title="Glitter"
              text="Sparks that drift down after each burst"
              checked={prefs.glitter}
              disabled={off || !prefs.fireworks}
              onChange={(glitter) => set({ glitter })}
              testId="motion-glitter"
            />
          </Sub>
        </div>

        <SectionTitle>Background</SectionTitle>
        <div className="card space-y-4 p-4">
          <Row
            title="Colour flow"
            text="The colours drifting across the Home card, the + button and accent buttons"
            checked={prefs.flow}
            disabled={off}
            onChange={(flow) => set({ flow })}
            testId="motion-flow"
          />
          <Sub off={!prefs.flow}>
            <div className="label" id="motion-speed-label">
              Speed
            </div>
            <Segmented<FlowSpeed>
              label="Colour flow speed"
              testId="motion-speed"
              value={prefs.speed}
              onChange={(speed) => set({ speed })}
              options={[
                { value: 'slow', label: 'Slow' },
                { value: 'normal', label: 'Normal' },
                { value: 'fast', label: 'Fast' },
              ]}
            />
          </Sub>
          <Row
            title="Floating circles"
            text="The circles drifting in the Home card"
            checked={prefs.circles}
            disabled={off}
            onChange={(circles) => set({ circles })}
            testId="motion-circles"
          />
        </div>
      </fieldset>

      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <p className="text-muted text-xs">Kept on this device.</p>
        {!isDefaultMotion(prefs) && (
          <button
            type="button"
            className="min-h-11 px-2 text-sm font-semibold text-brand-600 dark:text-brand-300"
            onClick={() => {
              resetMotion()
              flash()
            }}
            data-testid="motion-reset"
          >
            Reset to defaults
          </button>
        )}
      </div>
    </SettingsPage>
  )
}

function Row({
  title,
  text,
  checked,
  disabled,
  onChange,
  testId,
}: {
  title: string
  text: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  testId: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-muted text-xs">{text}</div>
      </div>
      <Switch checked={checked} disabled={disabled} onChange={onChange} label={title} testId={testId} />
    </div>
  )
}

/** A setting that only matters while its parent switch is on: dimmed and inert when it is off. */
function Sub({ off, children }: { off: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={off} className={`border-t border-slate-100 pt-4 transition-opacity dark:border-white/5 ${off ? 'opacity-50' : ''}`}>
      {children}
    </fieldset>
  )
}
