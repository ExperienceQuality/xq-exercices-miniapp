# Development Specification

## Toolchain

- Node.js 24.x (`.nvmrc` pins major `24`; lockfile built with 24.20.0),
  npm 11.19.0 (`packageManager` field).
- Svelte 5.57.2, Vite 8.3.4, TypeScript 6.0.3, Vitest 4.1.1,
  svelte-check 4.7.6.
- Playwright Test 1.64.0 with managed Chromium and
  `@axe-core/playwright` accessibility checks. Install the browser once
  with `npx playwright install chromium`.
- Key libraries: `idb` 8.0.4 (IndexedDB), `zod` 4.6.7 (schema
  validation), `express` 5 + `express-basic-auth` (static host only).

## Commands

| Command                     | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| `npm ci`                    | Install locked dependencies                        |
| `npm run format:check`      | Prettier check                                     |
| `npm run lint`              | ESLint `--max-warnings=0` + no-`.only` gate        |
| `npm run check`             | `svelte-check` type checking (`tsconfig.app.json`) |
| `npm run test:unit`         | Vitest run with V8 coverage thresholds             |
| `npm run test:traceability` | Enforce FIT-001…FIT-111 scenario references        |
| `npm run build`             | Vite production build (`dist/`)                    |
| `npm run preview:test`      | Serve `dist/` on `127.0.0.1:4173`                  |
| `npm run test:browser`      | Playwright suite (auto-starts preview)             |
| `npm start`                 | `server.mjs` static host (requires `APP_PASSWORD`) |

## Architecture

Layered, dependency-injected, offline-first:

```
src/main.ts                      # mount point (import.meta.glob, eager)
src/app/
  App.svelte                     # shell: status gate, drill-down screen
                                 # routing, editors, confirm dialogs, import
  RoutinesScreen.svelte          # level 1: routine list + create + import
  RoutineDetailScreen.svelte     # level 2: session list + progress snapshots
  SessionDetailScreen.svelte     # level 3: exercise list for one session
  fitness-controller.ts          # app service: load/apply lifecycle,
                                 # serialized mutation chain, selection,
                                 # editor state, pub-sub subscribe()
  dependencies.ts                # DI contracts: FitnessRepository,
                                 # IdGenerator, Clock, ImportFileReader,
                                 # StorageNamespace + DB name resolution
src/fitness/domain/
  model.ts                       # FitnessDocumentV2, RoutineV2,
                                 # TrainingSessionV2, ExerciseV2,
                                 # ProgressSnapshotV2 (schemaVersion: 2)
  commands.ts                    # pure commands returning
                                 # {document, mutation}: createRoutine,
                                 # addSession, renameSession, deleteSession,
                                 # reorderSessions, addExercise, editExercise,
                                 # deleteExercise, reorderExercises,
                                 # captureSnapshot
  mutations.ts                   # FitnessMutation union + applyMutation
                                 # reducer (document surgery replay)
  snapshots.ts                   # fold-name aggregation + progress classify
  validation.ts                  # normalizeName/Notes, foldName,
                                 # validateMetrics
  errors.ts                      # FitnessError + FitnessErrorCode + messages
src/fitness/persistence/
  fitness-repository.ts          # typed repository interface
  indexeddb-fitness-repository.ts# idb impl: primary/recovery records,
                                 # revision-checked mutation apply
  schemas.ts                     # zod v1 + v2 document schemas,
                                 # inspectSchemaVersion, invariants
  migrations.ts                  # v1 → v2 document migration
src/fitness/import/
  import-fitness-document.ts     # decode (v1 migrate / v2 parse) +
                                 # replace-document apply
```

### Design rules

- **Domain purity.** `domain/*` functions take a document and return a
  new document — immutable transforms, no I/O. Persistence concerns
  stay in `persistence/*`.
- **Dependency injection.** `FitnessDependencies` (repository, ids,
  clock, file reader) is constructed in `App.svelte`; tests substitute
  fakes (`crypto.randomUUID`, `new Date().toISOString()` in prod).
- **Serialized mutations.** The controller enqueues every mutation on a
  promise chain — no interleaved writes.
- **Optimistic concurrency.** `apply(expectedRevision, mutation)`; the
  repository aborts on revision mismatch → `storage-conflict`.
- **Dual-slot persistence.** One `records` object store holds `primary`
  and `recovery` records `{storageRevision, document}`. Apply writes
  old primary → recovery, then new primary. Load repairs a corrupt
  primary from recovery; a future-version primary fails closed.
- **Zod at every boundary.** Documents are re-parsed on load, on
  apply, and on import. V2 schema enforces invariants: trimmed
  non-empty names, unique IDs across the document, unique session
  order, ≤ 2 snapshots, sorted/deduplicated snapshot entries with
  canonical `foldedName`, and internally consistent progress classes.
- **Storage namespaces.** Production DB is `xq-fitness`. Automated/UI
  tests get `xq-fitness-<kind>-<runId>` (run ID must match
  `^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$`). Test cleanup is
  never given the production name.
- **Error taxonomy.** All domain/storage failures are `FitnessError`
  with a stable `code`; UI renders `error.message` via `role="alert"`.

### UI model

`App.svelte` gates on controller status (`loading` → `ready` →
`unavailable` with retry) and routes a `screen` state across three
drill-down levels: `RoutinesScreen` → `RoutineDetailScreen` →
`SessionDetailScreen`, each with a Back control and `h1` focus target.
Editors are modal dialogs (`role="dialog"`) for
routine/session/exercise; deletes use an `alertdialog`. Accessibility:
aria labels on all controls, `aria-live`/`role="status"` for notices.

## Build and deployment

- Vite `base` is `/xq-exercices-miniapp/` by default (GitHub Pages);
  override with `VITE_BASE` (Render uses `/`). Pages deployment is not
  configured by this repo.
- `server.mjs`: Express static host for `dist/` behind basic auth
  (`owner` / `APP_PASSWORD`, required env var, realm `XQ Exercises`).
  `/health` is unauthenticated for Render checks. SPA fallback serves
  `index.html` without cache; assets use immutable 1-year caching.
- `render.yaml`: Render web service `xq-exercises` (free plan, Oregon),
  `npm ci && VITE_BASE=/ npm run build`, `node server.mjs`.
- CI (`.github/workflows/ci.yml`): `quality` job runs format, lint,
  check, unit tests, traceability, build and uploads coverage +
  traceability evidence; `browser-acceptance` installs Chromium via
  `npx playwright install --with-deps chromium`, builds, runs
  `playwright test`, and uploads `playwright-report/` +
  `test-results/` on failure.

## Conventions

- ESM (`"type": "module"`), TypeScript strict-style, `readonly`
  interfaces for all domain data.
- Unit tests colocate as `*.test.ts` next to source; browser specs are
  Playwright `tests/browser/*.spec.ts` using the shared `app` fixture
  in `tests/browser/support/app.js`.
- Every acceptance criterion has a `FIT-NNN` ID referenced in code or
  test comments; `test:traceability` fails the build if any of
  FIT-001…FIT-111 is unreferenced.
- `.only` in tests is a lint failure (`scripts/check-no-only.mjs`).
