# Development Guide

Onboarding guide for new developers. For the authoritative spec, see
[docs/development.md](docs/development.md).

## What this is

A fitness-only, client-rendered Svelte 5 single-page app built with Vite.
All data lives in browser-local IndexedDB — there is no backend, no SSR,
no service worker, and no telemetry.

## Prerequisites

- **Node.js 24.x** — `.nvmrc` pins the major (`nvm use` picks it up).
  The lockfile was built with 24.20.0.
- **npm 11.19.0** — pinned via the `packageManager` field.
- **Chromium for Playwright** — one-time install:
  `npx playwright install chromium`.

## First-time setup

```sh
npm ci                          # install locked dependencies
npx playwright install chromium # browser for the acceptance suite
```

## Running the app locally

There is no `dev` script. Pick one of:

```sh
npx vite                        # dev server, http://localhost:5173/xq-exercices-miniapp/
npm run build && npm run preview:test  # production build on 127.0.0.1:4173
APP_PASSWORD=secret npm start   # server.mjs static host on :3000 (requires dist/)
```

The Vite `base` is `/xq-exercices-miniapp/` (GitHub Pages), so the app is
served under that path in dev and preview too. Override with `VITE_BASE=/`
when hosting elsewhere (Render does this).

## Codebase tour

```text
src/main.ts                     # mount point
src/app/
  App.svelte                    # shell: status gate, drill-down routing, dialogs, import
  RoutinesScreen.svelte         # level 1: routine list
  RoutineDetailScreen.svelte    # level 2: sessions + progress snapshots
  SessionDetailScreen.svelte    # level 3: exercises in a session
  fitness-controller.ts         # app service: serialized mutation chain, pub-sub
  dependencies.ts               # DI contracts + IndexedDB namespace resolution
src/fitness/
  domain/                       # pure functions: model, mutations, commands,
                                # snapshots, validation, errors — no I/O
  persistence/                  # idb adapter, zod schemas, v1→v2 migration
  import/                       # JSON import: decode then atomic apply
  ui/                           # UI helpers (decimal input parsing)
tests/browser/                  # Playwright acceptance specs + support/app.js fixture
tests/fixtures/compatibility/   # canonical JSON documents for import/persistence
server.mjs                      # Express basic-auth static host for dist/ (Render)
```

## Design rules to respect

- **Domain purity.** `src/fitness/domain/*` transforms documents
  immutably and performs no I/O. Keep persistence concerns in
  `persistence/*`.
- **Dependency injection.** `FitnessDependencies` (repository, IDs,
  clock, file reader) is built in `App.svelte`; tests inject fakes.
- **Operation-based port.** Writes go through
  `FitnessRepository.apply(expectedRevision, mutation)` where `mutation`
  is a `FitnessMutation` union member. Add new operations to
  `domain/mutations.ts`, not ad-hoc writes.
- **Serialized mutations.** The controller enqueues mutations on a
  promise chain — never bypass it.
- **Optimistic concurrency + dual slot.** `apply` aborts on revision
  mismatch; writes copy old primary to `recovery` first.
- **Zod at every boundary.** Documents are re-parsed on load, apply, and
  import. Change `schemas.ts` when the model changes; v1→v2 migration
  lives in `migrations.ts`. Future schema versions fail closed.
- **Storage namespaces.** Production DB is `xq-fitness`; tests get
  `xq-fitness-<kind>-<runId>`. Never hand test cleanup the production
  name.
- **Errors.** Domain/storage failures are `FitnessError` with a stable
  `code`; the UI renders `error.message` via `role="alert"`.

## Everyday workflow

Run checks in the same order CI does:

```sh
npm run format:check      # Prettier (fix with: npx prettier --write .)
npm run lint              # ESLint --max-warnings=0 + no-.only gate
npm run check             # svelte-check types
npm run test:unit         # Vitest + coverage gates
npm run test:traceability # FIT-001…FIT-052 references must exist
npm run build             # Vite production build
npm run test:browser      # Playwright acceptance suite (see TEST.md)
```

## Conventions

- ESM everywhere (`"type": "module"`); TypeScript strict-style;
  `readonly` interfaces for domain data.
- Prettier: single quotes, trailing commas, `prettier-plugin-svelte`.
- Unit tests are colocated as `*.test.ts` next to the source file.
- Every acceptance criterion carries a `FIT-NNN` ID that must appear in
  `src/` or `tests/` — unreferenced IDs fail `test:traceability`.
- `.only` in tests is a lint failure.
- CI (`.github/workflows/ci.yml`): `quality` job runs the check order
  above; `browser-acceptance` then runs the Playwright suite.

## Where to read next

- [docs/capabilities.md](docs/capabilities.md) — product capabilities and FIT IDs
- [docs/development.md](docs/development.md) — full development spec
- [docs/repository-port.md](docs/repository-port.md) — persistence port design
- [TEST.md](TEST.md) — testing guide
