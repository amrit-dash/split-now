import { iconFace } from '@/lib/icon-ai'

/**
 * An expense's or a group's icon where the app draws one: a picture (Draw a picture) or an AI-drawn
 * icon as an image (cleaned again on this phone, src/lib/icon-ai.ts iconFace), else the emoji as text.
 * Sized by the surrounding font size (1.15em), so it drops into the same tiles as an emoji.
 */
export function IconFace({ iconSvg, iconImage, emoji, vault }: { iconSvg?: unknown; iconImage?: unknown; emoji: string; vault?: boolean }) {
  const face = iconFace({ iconSvg, iconImage, emoji, vault })
  if ('emoji' in face) return <>{face.emoji}</>
  return <img src={face.src} alt="" aria-hidden className="inline-block h-[1.15em] w-[1.15em] select-none rounded-[22%]" draggable={false} />
}
