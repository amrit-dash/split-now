import { type ReactNode, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { type ScanCardKind, scanFootHint, scanReaderLine } from '@/lib/scan-ai'
import type { UiIconName } from '@/lib/ui-icons'
import { type ScanAi, ScanAiCorner } from './AiScanToggle'
import { type Hint, HintText, InfoTip } from './Hint'
import { FeatureIcon } from './Icon'
import { CameraIcon, ImageAddIcon, PhoneIcon } from './icons'

/**
 * One layout for every kind of Scan (Bill, Payment, Statement): the picture or intro on top, Read
 * with AI in the top-right corner, then Camera and Photos side by side, then who reads the picture.
 * `children` replaces the two buttons (a statement being read shows its progress there). `ai` comes
 * from the page's one `useScanAi` so the corner button and the reader line can't disagree.
 */
export function ScanCard({
  ai,
  top,
  onFiles,
  multiple,
  disabled,
  aiHidden,
  children,
  below,
  testId,
  photosTestId = 'scan-photos',
  readerTestId = 'scan-reader',
}: {
  ai: ScanAi
  top: ReactNode
  onFiles: (files: File[]) => void
  /** Photos may pick several at once (statements); Camera always takes one */
  multiple?: boolean
  disabled?: boolean
  /** while a read is in flight the corner button and the reader line step aside */
  aiHidden?: boolean
  children?: ReactNode
  /** anything else under the reader line */
  below?: ReactNode
  testId?: string
  photosTestId?: string
  readerTestId?: string
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
      {!aiHidden && <ScanAiCorner ai={ai} disabled={disabled} />}
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
      {!aiHidden && <ScanReaderLine kind={ai.kind} reader={ai.reader} testId={readerTestId} />}
      {below}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={take} />
      <input ref={libRef} type="file" accept="image/*" multiple={multiple} hidden onChange={take} />
    </div>
  )
}

/**
 * Who reads the picture, under the buttons of every Scan card: a sparkle for Google Gemini, a phone
 * for this phone. The words come from src/lib/scan-ai.ts so the three tabs read the same.
 */
function ScanReaderLine({ kind, reader, testId }: { kind: ScanCardKind; reader: ScanAi['reader']; testId: string }) {
  const { icon, hint } = scanReaderLine(kind, reader)
  return (
    <p className="text-muted -mt-1 flex items-center justify-center gap-1.5 px-3 pb-3 text-xs" data-testid={testId} data-reader={reader}>
      {icon === 'phone' ? (
        <PhoneIcon size={13} className="shrink-0 text-brand-500" aria-hidden />
      ) : (
        <Sparkles size={12} className="shrink-0 text-brand-500" aria-hidden />
      )}
      <HintText hint={hint} as="span" />
      <InfoTip hint={hint} label="About who reads it" />
    </p>
  )
}

/** The line at the foot of every Scan tab: nothing is added by itself, and scans stay here. */
export function ScanFoot({ kind }: { kind: ScanCardKind }) {
  const hint = scanFootHint(kind)
  return (
    <p className="text-muted mt-6 text-balance text-center text-xs" data-testid="scan-foot">
      <HintText hint={hint} as="span" />
      <InfoTip hint={hint} label="About scans" />
    </p>
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
