/*
 * Build-time stand-in for the `re2js` package (aliased in vite.config.ts).
 *
 * @firebase/firestore imports RE2JS for the pipeline expressions `like`, `regex_contains` and
 * `regex_match`. This app only uses `firebase/firestore` (never `firebase/firestore/pipelines`),
 * so those evaluators are never reached, yet the real module adds ~145 KB raw / ~43 KB gzip to
 * the Firestore chunk on every first paint. Firestore wraps each evaluator in try/catch and logs
 * a warning, so even an unexpected call degrades to "expression not evaluated" rather than a crash.
 *
 * Re-check after every firebase upgrade: `grep -l re2js node_modules/@firebase/firestore/dist/*.esm.js`.
 * If upstream moves the import behind the pipelines entry point, delete this file and the alias.
 */
export class RE2JS {
  static compile(pattern: string, _flags?: number): never {
    throw new Error(`Regex evaluation is not bundled (pattern: ${pattern})`)
  }
}
