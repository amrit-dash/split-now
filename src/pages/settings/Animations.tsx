import { useState, type ReactNode } from 'react'
import { EyeIcon, EyeSlashIcon } from '@/components/icons'
import { Aurora } from '@/components/Aurora'
import { CardFirework } from '@/components/CardFirework'
import { Detail, HintText, InfoTip, type Hint } from '@/components/Hint'
import { Segmented } from '@/components/Misc'
import { Switch } from '@/components/Switch'
import { useMotion } from '@/hooks/useMotion'
import {
  type FireworkSize,
  type FlowSpeed,
  GLITTER_SHAPES,
  type GlitterShape,
  type GlitterSize,
  getPreviewShown,
  isDefaultMotion,
  type MotionPrefs,
  resetMotion,
  setMotion,
  setPreviewShown,
} from '@/lib/motion'
import { SavedPill, SectionTitle, SettingsPage, useSavedFlash } from './common'

/**
 * /settings/animations: the Home card's fireworks, colour flow and floating circles. A master
 * switch, then each one on its own. A live preview of the Home card and an accent button is pinned
 * under the title (it stays in view while the settings scroll) and the eye in the header hides or
 * shows it, remembered on this device. The settings themselves follow the account
 * (src/lib/motion.ts, src/lib/appearance-sync.ts) and apply at once. The device's reduce-motion setting wins over all of it.
 */
// Restates what Preferences says about appearance; only worth reading once.
const SYNC_HINT: Hint = { full: 'Same on every device you sign in on.', tier: 'extra' }

export default function Animations() {
  const { prefs, reduced } = useMotion()
  const [saved, flash] = useSavedFlash()
  const set = (patch: Partial<MotionPrefs>) => {
    setMotion(patch)
    flash()
  }
  const off = reduced || !prefs.on
  const [preview, setPreview] = useState(getPreviewShown)
  const togglePreview = () => {
    setPreview(!preview)
    setPreviewShown(!preview)
  }

  return (
    <SettingsPage
      title="Animations"
      right={
        <>
          <SavedPill on={saved} />
          <button
            type="button"
            onClick={togglePreview}
            aria-pressed={preview}
            aria-label="Show preview"
            title={preview ? 'Hide preview' : 'Show preview'}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-ink-800"
            data-testid="motion-preview-toggle"
          >
            {preview ? <EyeIcon size={22} aria-hidden /> : <EyeSlashIcon size={22} aria-hidden />}
          </button>
        </>
      }
      pinned={preview && <Preview />}
    >
      {reduced && (
        <p className="card mb-4 p-4 text-sm" data-testid="motion-reduced">
          Your device is set to reduce motion, so these stay still. Change it in your device’s settings.
        </p>
      )}

      <div className="card p-4">
        <Row
          title="All animations"
          text={{ full: 'Fireworks, moving colours and circles on the Home card and buttons', short: 'On the Home card and buttons', tier: 'help' }}
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
            text={{ full: 'On the Home card when you’re settled up', tier: 'help' }}
            checked={prefs.fireworks}
            disabled={off}
            onChange={(fireworks) => set({ fireworks })}
            testId="motion-fireworks"
          />
          {/* Fine-tuning: hidden in Minimal; the main switches above and below always stay. The pickers' labels say enough; their lines are for Full only. */}
          <Detail min={2}>
            <Sub off={!prefs.fireworks}>
              <SizePicker
                label="Burst size"
                hint={{ full: 'How far the sparks fly', tier: 'extra' }}
                testId="motion-size"
                value={prefs.size}
                onChange={(size) => set({ size })}
              />
            </Sub>
            <Sub off={!prefs.fireworks}>
              <SizePicker
                label="Spark size"
                hint={{ full: 'How big each spark is', tier: 'extra' }}
                testId="motion-spark-size"
                value={prefs.sparkSize}
                onChange={(sparkSize) => set({ sparkSize })}
              />
            </Sub>
            <Sub off={!prefs.fireworks}>
              <Row
                title="Glitter"
                text={{ full: 'Small lights flash where a burst fades', tier: 'help' }}
                checked={prefs.glitter}
                disabled={off || !prefs.fireworks}
                onChange={(glitter) => set({ glitter })}
                testId="motion-glitter"
              />
              <fieldset disabled={!prefs.glitter} className={`mt-4 transition-opacity ${prefs.glitter ? '' : 'opacity-50'}`}>
                <SizePicker<GlitterSize>
                  label="Glitter size"
                  hint={{ full: 'How big those lights are', tier: 'extra' }}
                  testId="motion-glitter-size"
                  value={prefs.glitterSize}
                  onChange={(glitterSize) => set({ glitterSize })}
                  options={GLITTER_SIZES}
                />
                <div className="mt-4">
                  <SizePicker<GlitterShape>
                    label="Glitter shape"
                    hint={{ full: 'Mix has a bit of each', tier: 'extra' }}
                    testId="motion-glitter-shape"
                    value={prefs.glitterShape}
                    onChange={(glitterShape) => set({ glitterShape })}
                    options={GLITTER_SHAPE_OPTIONS}
                  />
                </div>
              </fieldset>
            </Sub>
            <Sub off={!prefs.fireworks}>
              <Row
                title="Twinkle"
                text={{ full: 'Some sparks pulse as they fade, the brightest with a star', short: 'Sparks pulse as they fade', tier: 'help' }}
                checked={prefs.twinkle}
                disabled={off || !prefs.fireworks}
                onChange={(twinkle) => set({ twinkle })}
                testId="motion-twinkle"
              />
            </Sub>
          </Detail>
        </div>

        <SectionTitle>Background</SectionTitle>
        <div className="card space-y-4 p-4">
          <Row
            title="Colour flow"
            text={{
              full: 'Colours drift across the Home card, the + button and accent buttons',
              short: 'On the Home card and buttons',
              tier: 'help',
            }}
            checked={prefs.flow}
            disabled={off}
            onChange={(flow) => set({ flow })}
            testId="motion-flow"
          />
          <Detail min={2}>
            <Sub off={!prefs.flow}>
              <SizePicker<FlowSpeed>
                label="Speed"
                groupLabel="Colour flow speed"
                hint={{ full: 'How fast the colours move', tier: 'extra' }}
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
          </Detail>
          <Row
            title="Floating circles"
            text={{ full: 'On the Home card', tier: 'help' }}
            checked={prefs.circles}
            disabled={off}
            onChange={(circles) => set({ circles })}
            testId="motion-circles"
          />
        </div>
        <SectionTitle>Pro badge</SectionTitle>
        <div className="card p-4">
          <Row
            title="Shine and turning ring"
            text={{ full: 'On PRO badges. Off, they stay still.', tier: 'help' }}
            checked={prefs.pro}
            disabled={off}
            onChange={(pro) => set({ pro })}
            testId="motion-pro"
          />
        </div>
      </fieldset>

      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <HintText hint={SYNC_HINT} />
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
  text: Hint
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  testId: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center text-sm font-semibold">
          {title}
          <InfoTip hint={text} label={`About ${title.toLowerCase()}`} />
        </div>
        <HintText hint={text} as="div" />
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

const SIZES: Array<{ value: FireworkSize; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'big', label: 'Big' },
]
// Each shape is one small drawing of it, so the row fits a narrow phone; Mix stays a word. The
// name is still there for screen readers and as the tooltip.
const GLITTER_SHAPE_NAMES: Record<GlitterShape, string> = { mix: 'Mix', dots: 'Dots', streaks: 'Streaks', stars: 'Stars', curls: 'Curls' }
const GLITTER_SHAPE_OPTIONS: Array<{ value: GlitterShape; label: ReactNode }> = GLITTER_SHAPES.map((value) => ({
  value,
  label:
    value === 'mix' ? (
      'Mix'
    ) : (
      <span className="inline-flex items-center justify-center" title={GLITTER_SHAPE_NAMES[value]}>
        <ShapeGlyph shape={value} />
        <span className="sr-only">{GLITTER_SHAPE_NAMES[value]}</span>
      </span>
    ),
}))

const SHAPE_PARTS: Record<Exclude<GlitterShape, 'mix'>, ReactNode> = {
  dots: <circle cx={10} cy={10} r={3.2} fill="currentColor" stroke="none" />,
  streaks: <path d="M5 15L15 5" />,
  stars: <path d="M10 3Q10 10 17 10Q10 10 10 17Q10 10 3 10Q10 10 10 3Z" fill="currentColor" strokeWidth={1} strokeLinejoin="round" />,
  curls: <path d="M2.5 11.5C4.5 6.5 6.5 6.5 8.2 10S11.8 13.5 13.5 10S16.5 6.5 17.5 9" />,
}

function ShapeGlyph({ shape }: { shape: Exclude<GlitterShape, 'mix'> }) {
  return (
    <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      {SHAPE_PARTS[shape]}
    </svg>
  )
}

// Glitter goes one size finer than the sparks.
const GLITTER_SIZES: Array<{ value: GlitterSize; label: string }> = [{ value: 'tiny', label: 'Tiny' }, ...SIZES]

function SizePicker<T extends string = FireworkSize>({
  label,
  groupLabel = label,
  hint,
  value,
  onChange,
  testId,
  options = SIZES as Array<{ value: T; label: ReactNode }>,
}: {
  label: string
  /** The choices' accessible name, when the visible label needs its section to make sense. */
  groupLabel?: string
  hint?: Hint
  value: T
  onChange: (v: T) => void
  testId: string
  options?: Array<{ value: T; label: ReactNode }>
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="label !mb-0 flex items-center">
          {label}
          {hint && <InfoTip hint={hint} label={`About ${label.toLowerCase()}`} />}
        </span>
        {hint && <HintText hint={hint} as="span" />}
      </div>
      <Segmented<T> label={groupLabel} testId={testId} value={value} onChange={onChange} options={options} />
    </div>
  )
}

/**
 * The Home card's surface with the fireworks it shows when you're settled up, and an accent
 * button so the colour flow on buttons shows too (it needs Dual tone on). Unmounted while hidden,
 * so nothing animates unseen.
 */
function Preview() {
  return (
    <div className="mt-3 space-y-2.5">
      <div
        className="relative isolate flex h-32 items-end overflow-hidden rounded-[1.75rem] bg-fill p-4 text-on-fill shadow-lg shadow-fill/25"
        data-testid="motion-preview"
      >
        <Aurora persist={false} />
        <CardFirework testId="motion-preview-firework" />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Preview</div>
          <div className="text-lg font-bold">All settled up</div>
        </div>
      </div>
      <div aria-hidden className="btn-primary pointer-events-none w-full" data-testid="motion-preview-button">
        Accent button preview
      </div>
    </div>
  )
}
