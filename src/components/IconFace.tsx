import { iconFace } from '@/lib/icon-ai'

/**
 * An expense's or a group's icon where the app draws one: an AI-drawn icon as an image (a data:
 * URL of markup cleaned again on this phone, src/lib/icon-ai.ts iconFace), else the emoji as text.
 * Sized by the surrounding font size (1.15em), so it drops into the same tiles as an emoji.
 */
export function IconFace({ iconSvg, emoji, vault }: { iconSvg?: unknown; emoji: string; vault?: boolean }) {
  const face = iconFace({ iconSvg, emoji, vault })
  if ('emoji' in face) return <>{face.emoji}</>
  return <img src={face.src} alt="" aria-hidden className="inline-block h-[1.15em] w-[1.15em] select-none" draggable={false} />
}
