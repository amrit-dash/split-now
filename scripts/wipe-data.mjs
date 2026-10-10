// One-off reset of the production project before launch: deletes every account and every piece of
// user data except the admins (the uids with an admins/{uid} document). Run only from
// .github/workflows/wipe-data.yml, which holds the service-account key; it is dry by default and
// only deletes with WIPE=1.
//
// Kept: admins/*, the admins' Auth accounts and users/{uid} trees (profile, settings, push
// registrations, own AI key), their capture keys that are not tied to a group, their avatars;
// config/* (flags, limits, AI settings), private/* (the sealed in-app Gemini key) and fxRates/*
// (exchange rates the schedule refreshes).
// Deleted: every other Auth account and users/{uid} tree, every group with its expenses,
// settlements, comments and activity, live tables, pay links, invites, captured payments, rate
// limits, reminder state, blocks, stats, and every Storage file outside the admins' avatars.
import { createRequire } from 'node:module'

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')

const PROJECT = process.env.PROJECT || 'split-it-prod'
const WIPE = process.env.WIPE === '1'
const KEEP_COLLECTIONS = new Set(['admins', 'config', 'private', 'fxRates'])

initializeApp({ projectId: PROJECT, storageBucket: process.env.BUCKET || `${PROJECT}.firebasestorage.app` })
const db = getFirestore()
const auth = getAuth()

const say = (msg) => console.log(`${WIPE ? '' : '[dry run] '}${msg}`)

const admins = new Set((await db.collection('admins').listDocuments()).map((d) => d.id))
if (admins.size === 0) throw new Error('No admins/{uid} documents found; refusing to delete every account.')
console.log(`Admins kept: ${[...admins].join(', ')}`)

// --- Auth ---------------------------------------------------------------------------------
const doomedUsers = []
let page
do {
  const res = await auth.listUsers(1000, page)
  for (const u of res.users) if (!admins.has(u.uid)) doomedUsers.push(u.uid)
  page = res.pageToken
} while (page)
say(`Auth: deleting ${doomedUsers.length} accounts`)
if (WIPE) {
  for (let i = 0; i < doomedUsers.length; i += 1000) {
    const r = await auth.deleteUsers(doomedUsers.slice(i, i + 1000))
    if (r.failureCount) console.warn(`  ${r.failureCount} failed:`, r.errors.map((e) => e.error.message).join('; '))
  }
}

// --- Firestore ----------------------------------------------------------------------------
for (const col of await db.listCollections()) {
  if (KEEP_COLLECTIONS.has(col.id)) {
    say(`Firestore ${col.id}: kept`)
    continue
  }
  const docs = await col.listDocuments()
  let doomed = docs
  if (col.id === 'users') doomed = docs.filter((d) => !admins.has(d.id))
  if (col.id === 'captureTokens') {
    // An admin's capture key survives unless it was scoped to a group (every group goes).
    const snaps = docs.length ? await db.getAll(...docs) : []
    doomed = snaps.filter((s) => !(s.exists && admins.has(s.get('uid')) && !s.get('groupId'))).map((s) => s.ref)
  }
  say(`Firestore ${col.id}: deleting ${doomed.length} of ${docs.length} documents (with subcollections)`)
  if (WIPE) for (const ref of doomed) await db.recursiveDelete(ref)
}

// --- Storage ------------------------------------------------------------------------------
const [files] = await getStorage().bucket().getFiles()
const doomedFiles = files.filter((f) => {
  const m = f.name.match(/^avatars\/([^/]+)\//)
  return !(m && admins.has(m[1]))
})
say(`Storage: deleting ${doomedFiles.length} of ${files.length} files`)
if (WIPE) for (const f of doomedFiles) await f.delete({ ignoreNotFound: true })

console.log(WIPE ? 'Done.' : 'Dry run only; nothing was deleted. Run again with WIPE=1 to delete.')
