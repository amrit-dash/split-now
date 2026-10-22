import { type ReactNode, useRef } from 'react'
import type { ScanCardKind } from '@/lib/scan-ai'
import type { UiIconName } from '@/lib/ui-icons'
import { ScanAiCorner } from './AiScanToggle'
import { type Hint, HintText, InfoTip } from './Hint'
import { FeatureIcon } from './Icon'
import { CameraIcon, ImageAddIcon } from './icons'

/**
 * One layout for every kind of Scan (Bill, Payment, Statement): the picture or intro on top, Read
 * with AI in the top-right corner, then Camera and Photos side by side. `children` replaces the two
 * buttons (a statement being read shows its progress there).
 */
export function ScanCard({
  kind,
  top,
  onFiles,
  multiple,
  disabled,
  aiHidden,
  children,
  below,
  testId,
  photosTestId = 'scan-photos',
}: {
  kind: ScanCardKind
  top: ReactNode
  onFiles: (files: File[]) => void
  /** Photos may pick several at once (statements); Camera always takes one */
  multiple?: boolean
  disabled?: boolean
  /** while a read is in flight the corner button steps aside */
  aiHidden?: boolean
  children?: ReactNode
  /** a line under the buttons */
  below?: ReactNode
  testId?: string
  photosTestId?: string
}) {
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (files.length) onFiles(files)
  }
  return (
    <div className="card relative mt-4 overflow-hidden" data-testid={testId}>
      {!aiHidden && <ScanAiCorner kind={kind} disabled={disabled} />}
      {top}
      {children ?? (
        <div className="grid grid-cols-2 gap-2 p-3">
          <button type="button" className="btn-primary" onClick={() => camRef.current?.click()} disabled={disabled} data-testid="scan-camera">
            <CameraIcon size={18} aria-hidden /> Camera
          </button>
          <button type="button" className="btn-secondary" onClick={() => libRef.current?.click()} disabled={disabled} data-testid={photosTestId}>
            <ImageAddIcon size={18} aria-hidden /> Photos
          </button>
        </div>
      )}
      {below}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={take} />
      <input ref={libRef} type="file" accept="image/*" multiple={multiple} hidden onChange={take} />
    </div>
  )
}

/** The intro at the top of a Scan card before anything is picked. */
export function ScanIntro({ icon, title, hint, infoLabel }: { icon: UiIconName; title: string; hint: Hint; infoLabel: string }) {
  return (
    <div className="flex flex-col items-center px-6 pt-10 pb-6 text-center">
      <div
        className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-fill-500 to-fill-to text-3xl text-on-fill shadow-lg"
        aria-hidden
      >
        <FeatureIcon name={icon} size={36} tone="current" />
      </div>
      <div className="flex items-center justify-center">
        <h2 className="font-bold">{title}</h2>
        <InfoTip hint={hint} label={infoLabel} />
      </div>
      <HintText hint={hint} className="text-muted mt-1 text-sm" />
    </div>
  )
}
