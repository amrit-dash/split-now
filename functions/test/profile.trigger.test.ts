/**
 * A person's name, photo and badges reach their groups from the server (functions/src/profileSync.ts):
 * onProfileShared, onAdminMarkChanged and onGroupJoined in the Functions emulator.
 * Run with: npm run test:functions (the trigger pass starts Firestore, Functions and Auth).
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment
const PROJECT = 'demo-splitit'
const photo = 'https://example.com/asha.jpg'

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(() => env.cleanup())

async function admin<T>(fn: (db: ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>) => Promise<T>): Promise<T> {
  let out: T | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = await fn(ctx.firestore())
  })
  return out as T
}
const read = (path: string) => admin(async (db) => (await getDoc(doc(db, path))).data())
const write = (path: string, data: object) => admin((db) => setDoc(doc(db, path), data))
const patch = (path: string, data: Record<string, unknown>) => admin((db) => updateDoc(doc(db, path), data))
async function until(path: string, ok: (d: Record<string, unknown> | undefined) => boolean) {
  for (let i = 0; i < 60; i++) {
    const d = await read(path)
    if (ok(d)) return d
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`${path} never got there: ${JSON.stringify(await read(path))}`)
}
const settle = () => new Promise((r) => setTimeout(r, 3000))

type Members = Record<string, { name?: string; uid?: string; photoURL?: string; pro?: boolean; dev?: boolean; removedAt?: number }>
const group = (uids: string[], members: Members, over: object = {}) => ({
  name: 'Goa',
  emoji: '🏖️',
  type: 'trip',
  currency: 'INR',
  inviteCode: 'GOA23456',
  memberUids: uids,
  members,
  createdBy: uids[0],
  createdAt: 1,
  updatedAt: 1,
  ...over,
})
const membersOf = async (gid: string) => ((await read(`groups/${gid}`))?.members ?? {}) as Members

describe('profiles reach groups from the server (emulator)', () => {
  it('a new name, photo and badge reach every live group; private groups get only the badge', async () => {
    const u = 'ps_asha'
    await write(`users/${u}`, { uid: u, displayName: 'Asha', payment: { upi: 'asha@ok' }, currency: 'INR' })
    await write(
      'groups/ps_g1',
      group([u, 'ps_ben'], { a: { name: 'Asha', uid: u }, b: { name: 'Ben', uid: 'ps_ben' }, old: { name: 'Asha', uid: u, removedAt: 5 } }),
    )
    await write('groups/ps_gone', group([u], { a: { name: 'Asha', uid: u } }, { deletedAt: 9 }))
    await write('groups/ps_v', group([u], { a: { name: 'v1:sealed', uid: u, photoURL: 'v1:sealedphoto' } }, { vault: true }))
    await settle()

    await patch(`users/${u}`, { displayName: 'Asha Rao', photoURL: photo, proAt: 7 })
    const m = (await until('groups/ps_g1', (d) => (d?.members as Members | undefined)?.a?.name === 'Asha Rao'))?.members as Members
    expect(m.a).toMatchObject({ name: 'Asha Rao', uid: u, photoURL: photo, pro: true })
    expect(m.b).toEqual({ name: 'Ben', uid: 'ps_ben' })
    expect(m.old).toEqual({ name: 'Asha', uid: u, removedAt: 5 })
    // A profile change doesn't reorder anyone's group list.
    expect((await read('groups/ps_g1'))?.updatedAt).toBe(1)
    expect(await until(`groups/ps_g1/profiles/${u}`, (d) => d?.displayName === 'Asha Rao')).toEqual({
      displayName: 'Asha Rao',
      payment: { upi: 'asha@ok' },
      photoURL: photo,
      currency: 'INR',
      collect: true,
      pro: true,
    })

    const v = await until('groups/ps_v', (d) => (d?.members as Members | undefined)?.a?.pro === true)
    expect((v?.members as Members | undefined)?.a).toEqual({ name: 'v1:sealed', uid: u, photoURL: 'v1:sealedphoto', pro: true })
    expect(await read(`groups/ps_v/profiles/${u}`)).toBeUndefined()
    expect((await membersOf('ps_gone')).a?.name).toBe('Asha')
    expect(await read(`groups/ps_gone/profiles/${u}`)).toBeUndefined()

    // Removing the photo and hiding the badge take them away again.
    await patch(`users/${u}`, { photoURL: null, proHidden: true })
    const after = await until('groups/ps_g1', (d) => !(d?.members as Members | undefined)?.a?.photoURL)
    expect((after?.members as Members | undefined)?.a).toEqual({ name: 'Asha Rao', uid: u })
    expect(await until(`groups/ps_g1/profiles/${u}`, (d) => !d?.photoURL)).toEqual({
      displayName: 'Asha Rao',
      payment: { upi: 'asha@ok' },
      currency: 'INR',
      collect: true,
    })
  })

  it('a write groups never see leaves them alone', async () => {
    const u = 'ps_cara'
    await write(`users/${u}`, { uid: u, displayName: 'Cara' })
    await write('groups/ps_g2', group([u], { c: { name: 'Cara', uid: u } }, { inviteCode: 'CARA2345' }))
    await settle()
    // Someone else's old name on the entry: only a change to the shared part would correct it.
    await patch('groups/ps_g2', { 'members.c.name': 'Old name' })
    await patch(`users/${u}`, { voiceTried: 5 })
    await settle()
    expect((await membersOf('ps_g2')).c?.name).toBe('Old name')
  })

  it('someone joining gets their name and photo in that group straight away', async () => {
    const u = 'ps_dev'
    await write(`users/${u}`, { uid: u, displayName: 'Dev Patel', photoURL: photo })
    await write('groups/ps_g3', group(['ps_ben'], { b: { name: 'Ben', uid: 'ps_ben' }, p: { name: 'Dev' } }, { inviteCode: 'JOIN2345' }))
    await settle()
    expect((await membersOf('ps_g3')).p).toEqual({ name: 'Dev' })
    await patch('groups/ps_g3', { 'members.p.uid': u, memberUids: ['ps_ben', u] })
    const g = await until('groups/ps_g3', (d) => (d?.members as Members | undefined)?.p?.photoURL === photo)
    expect((g?.members as Members | undefined)?.p).toEqual({ name: 'Dev Patel', uid: u, photoURL: photo })
    expect((await until(`groups/ps_g3/profiles/${u}`, (d) => !!d))?.displayName).toBe('Dev Patel')
  })

  it('becoming an admin shows the Dev mark; stopping takes it away', async () => {
    const u = 'ps_eve'
    await write(`users/${u}`, { uid: u, displayName: 'Eve' })
    await write('groups/ps_g4', group([u], { e: { name: 'Eve', uid: u } }, { inviteCode: 'EVEE2345' }))
    await settle()
    await write(`admins/${u}`, { at: 1, by: 'boss' })
    await until('groups/ps_g4', (d) => (d?.members as Members | undefined)?.e?.dev === true)
    expect((await until(`groups/ps_g4/profiles/${u}`, (d) => d?.dev === true))?.dev).toBe(true)
    await admin((db) => deleteDoc(doc(db, `admins/${u}`)))
    await until('groups/ps_g4', (d) => (d?.members as Members | undefined)?.e?.dev === undefined)
  })
})
