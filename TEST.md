# Testing Guide

How to run and write tests in this repo. For the authoritative spec, see
[docs/testing.md](docs/testing.md).

## Test lanes

| Lane               | Tool                                                      | Purpose                                                        |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------------------- |
| Unit               | Vitest + jsdom + fake-indexeddb + @testing-library/svelte | Fast, deterministic logic tests                                |
| Browser acceptance | Playwright Test (Chromium) against `vite preview` build   | **Authoritative** acceptance suite                             |
| Traceability       | `scripts/generate-fit-traceability.mjs`                   | Every FIT-001…FIT-052 must be referenced in `src/` or `tests/` |

## Commands

```sh
npm run test:unit            # Vitest run with V8 coverage thresholds
npm run test:browser:docker  # canonical browser run — same Linux image as CI
npm run test:browser         # playwright test, native (auto-starts vite preview on :4173)
npm run test:traceability    # FIT-NNN reference enforcement
npm run test:no-only         # blocks .only (also runs inside `npm run lint`)
```

One-time setup for the native browser lane: `npx playwright install chromium`.
The Docker lane needs no browser install — the image ships one — but needs
Docker running. It uses the CI-identical Ubuntu 24.04 Playwright image, so
prefer it when verifying layout- or timing-sensitive assertions; native
macOS results can differ from CI. Pass Playwright args after `--`, e.g.
`npm run test:browser:docker -- --project=320x568-touch --grep RUI-AC-06`.

## Unit tests

- Colocated as `*.test.ts` next to source (`src/**/*.test.ts`), picked
  up by `vitest.config.ts` (jsdom, globals enabled).
- Inject fakes through `FitnessDependencies` — never touch real
  IndexedDB; use `fake-indexeddb` (already a devDependency).
- Svelte component tests work because `vitest.config.ts` sets
  `resolve.conditions: ['browser']` — without it `mount` fails with an
  SSR error. Keep that setting.
- Coverage gates (V8): 95% statements/branches for `domain/`,
  `persistence/`, `import/`; 80% for `fitness-controller.ts` and
  `fitness/ui/`. `main.ts` and `*.test.ts` are excluded.

Useful filters:

```sh
npx vitest run src/fitness/domain/commands.test.ts   # one file
npx vitest run -t "createRoutine"                    # by name
npx vitest --watch                                   # watch mode
```

## Browser acceptance suite

Config: `playwright.config.ts`. Tests live in `tests/browser/*.spec.ts`
against the production build served by `vite preview` (real IndexedDB,
real rendering). `webServer` starts `npm run preview:test` automatically
and reuses an already-running server locally.

### Project matrix (all headless Chromium)

| Project          | Viewport    | Emulation         |
| ---------------- | ----------- | ----------------- |
| `desktop-chrome` | 1440×900    | none              |
| `390x844-touch`  | 390×844 @3x | touch + mobile UA |
| `320x568-touch`  | 320×568 @2x | touch + mobile UA |

`workers: 1`, `fullyParallel: false`, `retries: 0`, test timeout 60 s.

### Spec files

- `fitness-crud.spec.ts` — availability, routine/session/exercise CRUD → FIT-001…FIT-030
- `fitness-progress-import.spec.ts` — snapshots, import, persistence → FIT-031…FIT-052
- `cross-cutting.spec.ts` — axe accessibility (no serious/critical
  violations), responsive layout, zero network after load, Pages base
  path, privacy (no fitness data in URL/requests/console)

### The `app` fixture

`tests/browser/support/app.js` exports a `test` that extends
`@playwright/test`. It remaps `indexedDB.open('xq-fitness')` to
`xq-fitness-ui-test-<runId>` per scenario via `context.addInitScript`,
so tests never touch the production database name. Helpers include
`startFreshApp`, `click`, `fill`, `expectText`, `createRoutine`,
`addSession`, `addExercise`, `importFixture`, `seedRecords`.

Use these helpers — they poll with deadlines. Do not hand-roll sleeps.

### Compatibility fixtures

`tests/fixtures/compatibility/` holds canonical documents:
`valid-v1.json`, `valid-v2.json`, `invalid-v2.json`, `malformed.json`,
`corrupt-primary.json`, `future-v3.json`, `valid-recovery.json`.

### Running subsets

```sh
npm run test:browser                               # everything, all projects
npx playwright test --project=desktop-chrome       # one project
npx playwright test tests/browser/fitness-crud.spec.ts  # one file
npx playwright test -g "creates a routine"         # by title
npx playwright test --ui                           # interactive UI mode
npx playwright test --debug                        # step through in inspector
```

### Debugging failures

- HTML report: `npx playwright show-report` (written to `playwright-report/`)
- Screenshots, traces, videos on failure: `test-results/`
- Open a trace: `npx playwright show-trace test-results/<dir>/trace.zip`
- CI uploads `playwright-report/` + `test-results/` as the
  `playwright-failure-diagnostics` artifact on failure.

## Rules for writing tests

- New acceptance criterion → assign the next `FIT-NNN`, reference it in
  the spec title or a comment. `npm run test:traceability` fails if any
  of FIT-001…FIT-052 is unreferenced. Developer-owned mappings live in
  `tests/browser/traceability.js`.
- Never commit `.only` — `npm run lint` fails on it.
- `eslint-plugin-playwright` rules apply to specs; run `npm run lint`.
- Domain/persistence logic belongs in unit tests; end-to-end user
  journeys and cross-cutting concerns (a11y, privacy, offline) belong in
  the browser lane.

## Out of scope

Physical devices and iOS Simulator are not validated. Chromium is the
only browser target; the WebdriverIO and Appium lanes were removed.
