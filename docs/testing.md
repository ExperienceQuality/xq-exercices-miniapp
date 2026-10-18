# Test Specification

## Strategy

Two lanes plus traceability, all enforced in CI:

1. **Unit lane** — Vitest + jsdom + fake-indexeddb +
   @testing-library/svelte. Fast, deterministic; dependencies
   (repository, ids, clock, file reader) are injected fakes.
2. **Browser acceptance lane** — Playwright Test 1.64.0 against the
   production build served by `vite preview` (real IndexedDB, real
   rendering). This is the authoritative acceptance suite.
3. **Traceability** — `npm run test:traceability` scans `src/` and
   `tests/` for `FIT-NNN` references and fails if any of the 52
   accepted criteria is unreferenced. `tests/browser/traceability.js`
   holds developer-owned mappings (e.g. FIT-029 white-box).

## Commands

```sh
npm run test:unit          # Vitest + coverage (jsdom)
npm run test:traceability  # FIT-001…FIT-052 reference enforcement
npm run test:browser       # playwright test (webServer auto-starts preview)
npm run test:no-only       # part of `npm run lint`; blocks .only
```

## Coverage gates (vitest.config.ts, V8)

| Path                            | Statements | Branches |
| ------------------------------- | ---------- | -------- |
| `src/fitness/domain/**`         | 95         | 95       |
| `src/fitness/persistence/**`    | 95         | 95       |
| `src/fitness/import/**`         | 95         | 95       |
| `src/app/fitness-controller.ts` | 80         | 80       |
| `src/fitness/ui/**`             | 80         | 80       |

`src/main.ts` and `*.test.ts` are excluded from coverage.

## Unit test layout

Colocated `*.test.ts`:

- `src/fitness/domain/commands.test.ts` — mutations, validation,
  missing-entity errors, snapshot capture.
- `src/fitness/persistence/schemas.test.ts` — zod invariants and
  version inspection.
- `src/fitness/persistence/indexeddb-fitness-repository.test.ts` —
  load/commit, recovery restore, revision conflict, future-version
  fail-closed (fake-indexeddb).
- `src/app/fitness-controller.test.ts` — status transitions, mutation
  serialization, selection, import flow.
- `src/app/dependencies.test.ts` — DB namespace resolution and run-ID
  validation.

## Browser suite

Config `playwright.config.ts`: `testDir: tests/browser`,
`testMatch: **/*.spec.{js,ts}`, test timeout 60 s, `expect` timeout
10 s, `workers: 1`, `fullyParallel: false`, `retries: 0`. Reporters:
`list` + `html` (`playwright-report/`); screenshots, traces, and video
retained on failure (`test-results/`). The `webServer` block runs
`npm run preview:test` and waits for
`http://127.0.0.1:4173/xq-exercices-miniapp/` (reuses an existing
server outside CI). One-time setup: `npx playwright install chromium`.

### Project matrix

| Project          | Viewport    | Emulation                         |
| ---------------- | ----------- | --------------------------------- |
| `desktop-chrome` | 1440×900    | none                              |
| `390x844-touch`  | 390×844 @3x | `hasTouch`, `isMobile`, mobile UA |
| `320x568-touch`  | 320×568 @2x | `hasTouch`, `isMobile`, mobile UA |

All projects run managed Chromium headless.

### Spec files and FIT coverage

- `tests/browser/fitness-crud.spec.ts` — AVAIL-01…03, ROUTINE-01…08,
  SESSION-01…08, EXERCISE-01…11 → FIT-001…FIT-030.
- `tests/browser/fitness-progress-import.spec.ts` — SNAPSHOT-01…11,
  IMPORT-01…06, PERSIST-01…05 → FIT-031…FIT-052.
- `tests/browser/cross-cutting.spec.ts` — axe accessibility (no
  serious/critical violations), responsive overflow/touch sizing,
  zero-network after load, Pages base path, privacy (no fitness data in
  URL/requests/console).

### Test isolation

`tests/browser/support/app.js` exports a `test` fixture extending
`@playwright/test`. The `context` fixture installs a namespace shim via
`context.addInitScript`: `indexedDB.open('xq-fitness')` is remapped to
`xq-fitness-ui-test-<runId>` where `runId` comes from `window.name`,
unique per scenario and project. The `app` fixture exposes helpers
(`startFreshApp`, `click`, `fill`, `expectText`, `createRoutine`,
`addSession`, `addExercise`, `importFixture`, `seedRecords`).
`seedRecords` writes directly to `xq-fitness` (production name) to
verify primary/recovery restore and namespace isolation without UI
steps.

### Fixtures

`tests/fixtures/compatibility/`:
`valid-v1.json`, `valid-v2.json`, `invalid-v2.json`, `malformed.json`,
`corrupt-primary.json`, `future-v3.json`, `valid-recovery.json` —
canonical documents for import and persistence acceptance.

## Writing tests

- New acceptance criteria: assign the next `FIT-NNN`, reference the ID
  in the spec `it()` title or source comment, keep
  `test:traceability` green.
- Use the `app` fixture helpers from `support/app.js` — they poll with
  deadlines, do not hand-roll sleeps. `eslint-plugin-playwright` rules
  apply to specs.
- Never use `.only`; `npm run lint` fails on it.
- Unit tests inject fakes through `FitnessDependencies`; do not touch
  real IndexedDB — use `fake-indexeddb` (already a devDependency).

## Out of scope

Physical devices and iOS Simulator are not validated; the former
Appium/XCUITest smoke lane was removed, and the WebdriverIO suite was
fully ported to Playwright and deleted. Chromium is the only browser
target.
