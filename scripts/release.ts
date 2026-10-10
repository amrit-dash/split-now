// Release helpers for .github/workflows/release.yml. A release is a merge to main that changes the
// version in package.json: the workflow deploys that commit, then tags it vX.Y.Z and publishes a
// GitHub Release whose notes are the version's section of CHANGELOG.md.
//
//   node --experimental-strip-types scripts/release.ts notes 3.2.0   prints the notes (fails if missing)

const SEMVER = /^\d+\.\d+\.\d+$/

/**
 * The body of a version's section in the changelog: everything under `## <version>` (any title
 * after the number, e.g. "## 3.2.0 — October 2026") up to the next `## ` heading, trimmed.
 * Throws when the section is missing or empty, so a release can't go out without notes.
 */
export function releaseNotes(changelog: string, version: string): string {
  if (!SEMVER.test(version)) throw new Error(`Not a release version: ${version}`)
  const lines = changelog.split(/\r?\n/)
  const head = new RegExp(`^## ${version.replace(/\./g, '\\.')}(\\s|$)`)
  const start = lines.findIndex((l) => head.test(l))
  if (start < 0) throw new Error(`CHANGELOG.md has no "## ${version}" section`)
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  const body = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim()
  if (!body) throw new Error(`CHANGELOG.md's "## ${version}" section is empty`)
  return body
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, version] = process.argv.slice(2)
  if (cmd !== 'notes' || !version) {
    console.error('Usage: node --experimental-strip-types scripts/release.ts notes <version>')
    process.exit(2)
  }
  const { readFileSync } = await import('node:fs')
  try {
    process.stdout.write(`${releaseNotes(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), version)}\n`)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
