import { useEffect, useRef, useState } from 'react'
import { repo } from '@/data'
import { AUTO_PICK_MS, autoPickTitle, pickAnswer } from '@/lib/icon-pick'
import type { Category, GroupType } from '@/types'
import type { IconPickRequest } from '../../shared/icon-ai'

type Answer = { emoji?: string; alt?: string; category?: Category; type?: GroupType }

// Answers by kind and title, for this session: typing a title back, or opening the form again, doesn't ask twice.
const answers = new Map<string, Answer>()
const ANSWERS_MAX = 60

/**
 * The automatic icon's AI fallback (src/lib/icon-pick.ts): once typing pauses on a title the
 * app's own rules found no icon for, ask which of the catalogue's icons fits, and hand the answer
 * back with the title it was for (the form ignores it if the title has changed since).
 * `request` builds the question for a title; `need` is false once an icon was found or chosen.
 * Returns whether a question is with the AI now, so the form can say it's picking one.
 */
export function useAutoIconPick(o: {
  title: string
  offered: boolean
  need: boolean
  request: (title: string) => IconPickRequest
  onAnswer: (title: string, a: Answer) => void
}): boolean {
  const [picking, setPicking] = useState(false)
  // The latest callbacks, so a re-render doesn't restart the wait.
  const latest = useRef(o)
  latest.current = o
  const ask = autoPickTitle(o)
  useEffect(() => {
    if (!ask) return
    const title = latest.current.title
    const req = latest.current.request(ask)
    const key = `${req.kind}|${ask.toLowerCase()}|${req.categories ? 'c' : ''}${req.types ? 't' : ''}`
    const known = answers.get(key)
    if (known) {
      latest.current.onAnswer(title, known)
      return
    }
    let live = true
    const timer = setTimeout(async () => {
      setPicking(true)
      const a = pickAnswer(await repo.iconPickAi(req).finally(() => live && setPicking(false)), req)
      if (!a) return
      if (answers.size >= ANSWERS_MAX) answers.delete(answers.keys().next().value as string)
      answers.set(key, a)
      if (live) latest.current.onAnswer(title, a)
    }, AUTO_PICK_MS)
    return () => {
      live = false
      clearTimeout(timer)
      setPicking(false)
    }
  }, [ask])
  return picking && !!ask
}
