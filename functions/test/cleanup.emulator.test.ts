/**
 * The daily tidy-up of captured payments (functions/src/cleanup.ts purgeHandledCaptures) against
 * the Firestore emulator: handled ones past the keep period go, recent ones and ones still waiting
 * to be sorted stay. Run with: npm run test:functions.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { purgeAppErrors, purgeHandledCaptures } from '../src/cleanup'

const DAY = 86_400_000
let env: RulesTestEnvironment

beforeAll(async () => {
  process.env.GCLOUD_PROJECT ??= 'demo-splitit'
  env = await initializeTestEnvironment({
    projectId: 'demo-splitit',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())

const path = (id: string) => `users/cleanup_u/captures/${id}`
const exists = async (id: string) => {
  let out = false
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = (await getDoc(doc(ctx.firestore(), path(id)))).exists()
  })
  return out
}

describe('purgeHandledCaptures (emulator)', () => {
  it('removes handled captures past the keep period and keeps the rest', async () => {
    const now = 100 * DAY
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const c = (status: string, updatedAt: number) => ({ amount: 100, status, createdAt: updatedAt, updatedAt })
      await setDoc(doc(db, path('old_added')), c('assigned', now - 40 * DAY))
      await setDoc(doc(db, path('old_dismissed')), c('dismissed', now - 31 * DAY))
      await setDoc(doc(db, path('recent')), c('dismissed', now - 5 * DAY))
      await setDoc(doc(db, path('waiting')), c('pending', now - 300 * DAY))
    })
    expect(await purgeHandledCaptures(now, 30)).toBe(2)
    expect(await exists('old_added')).toBe(false)
    expect(await exists('old_dismissed')).toBe(false)
    expect(await exists('recent')).toBe(true)
    expect(await exists('waiting')).toBe(true)
  })
})

describe('purgeAppErrors (emulator)', () => {
  it('removes error reports older than the keep period', async () => {
    const now = 100 * DAY
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'appErrors/old'), { uid: 'u', at: now - 15 * DAY, kind: 'crash', message: 'x' })
      await setDoc(doc(db, 'appErrors/new'), { uid: 'u', at: now - 2 * DAY, kind: 'crash', message: 'y' })
    })
    expect(await purgeAppErrors(now, 14)).toBe(1)
    let left: boolean[] = []
    await env.withSecurityRulesDisabled(async (ctx) => {
      left = await Promise.all(['old', 'new'].map(async (id) => (await getDoc(doc(ctx.firestore(), `appErrors/${id}`))).exists()))
    })
    expect(left).toEqual([false, true])
  })
})
