# Contributing to Split Now

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Getting set up

```bash
npm install
npm run dev          # demo mode, no Firebase needed
```

Demo mode (`src/data/localRepo.ts`) keeps data in the browser and is the quickest way to work on UI. To work against Firebase, use the emulators (see [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)).

## Before you open a pull request

Run what CI runs:

```bash
npm run typecheck
npm test
npm run test:rules        # needs Java 11+ for the Firestore emulator
cd functions && npx vitest run src && cd ..
npm run build
```

- Keep changes focused; one feature or fix per PR.
- Put pure logic in `src/lib/` (or `shared/` if Cloud Functions need it too) with unit tests.
- Security rules changes need tests in `tests/`.
- Match the surrounding style: TypeScript, React function components, Tailwind utility classes, short comments that explain *why*.
- Money is always integer minor units; never use floats for amounts.
- UI must work at 360px wide, in light and dark mode, and respect `prefers-reduced-motion`.

## Reporting bugs

Open an issue with the steps to reproduce, what you expected, what happened, and your device / browser. Screenshots help a lot.

## Code of conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
