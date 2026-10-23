import { iconFace } from '@/lib/icon-ai'

/**
 * An expense's or a group's icon where the app draws one: a picture (Draw a picture) or an AI-drawn
 * icon as an image (cleaned again on this phone, src/lib/icon-ai.ts iconFace), else the emoji as text.
 * Sized by the surrounding font size (1.15em), so it drops into the same tiles as an emoji.
 */
export function IconFace({
  iconSvg,
  iconImage,
  emoji,
  vault,
  fill,
}: {
  iconSvg?: unknown
  iconImage?: unknown
  emoji: string
  vault?: boolean
  /** a picture fills its tile (a group's), as a friend's photo fills a 1:1's */
  fill?: boolean
}) {
  const face = iconFace({ iconSvg, iconImage, emoji, vault })
  if ('emoji' in face) return <>{face.emoji}</>
  // Pictures and drawn icons are cropped tight, with none of an emoji's built-in margin: drawn at
  // 1.5× the emoji's size they fill the tile as much as an emoji looks to (owner, 23 Oct 2026: too small).
  return (
    <img
      src={face.src}
      alt=""
      aria-hidden
      className={`inline-block select-none rounded-[18%] ${fill ? 'h-[88%] w-[88%]' : 'h-[1.5em] w-[1.5em]'}`}
      draggable={false}
    />
  )
}
