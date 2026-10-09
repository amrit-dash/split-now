# Contributing to Split Now

Thanks for helping! Bug reports, ideas and pull requests are all welcome.

## Getting set up

```bash
git clone https://github.com/amrit-dash/split-now.git
cd split-now
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

## Finding something to work on

- Issues labelled **good first issue** are small and self-contained.
- **suggestion** issues are bigger ideas still being discussed; comment before starting so the approach can be agreed. See [docs/ROADMAP.md](docs/ROADMAP.md).
- For anything large, open an issue first describing what you'd like to change.
- Questions, half-formed ideas and "how do I…" go to [Discussions](https://github.com/amrit-dash/split-now/discussions) (Q&A, Ideas, Show and tell); issues are for bugs and agreed work.

## Workflow

1. Fork the repository and create a branch from `main` (`feat/…`, `fix/…`).
2. Make your change with tests, and run the checks above.
3. Open a pull request using the template; link the issue it closes.
4. CI must pass, and a maintainer will review it.

Commit messages: a short imperative summary line ("Fix rounding in percent splits"), with detail in the body if needed.

## Reporting bugs

Open an issue with the steps to reproduce, what you expected, what happened, and your device / browser. Screenshots help a lot.

## Code of conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
