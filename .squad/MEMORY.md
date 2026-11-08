# Squad Memory

This file holds canonical, human-readable knowledge for the repository. Update it during memory maintenance when durable conventions, architecture, or decisions are discovered.

## Repository map

- `src/fitness/domain/` — pure commands + `applyMutation` reducer (`FitnessMutation` union).
- `src/fitness/persistence/indexeddb-fitness-repository.ts` — IndexedDB adapter; `apply(expectedRevision, mutation)`.
- `src/app/fitness-controller.ts` — queues writes; publishes document only after storage success.
- `src/app/RoutinesScreen.svelte` + `RoutineListItem.svelte` — list, swipe reveal, persistent Delete.
- Fit inventory: `scripts/generate-fit-traceability.mjs` enforces FIT-001…FIT-120.

## Conventions

- Domain commands return `{ document, mutation }` (`CommandResult`); reducer is sole document surgery.
- Reuse `messages` in `errors.ts`; no invented user-facing strings without PO.
- Controllers announce success (`notice`) only after commit; failures set `error` and leave document/revision untouched.

## Architecture

- **delete-routine (D2 Option B):** successful delete writes the validated post-delete `StoredFitnessRecord` to **both** `primary` and `recovery` at `expectedRevision + 1`. All other mutation kinds still copy prior primary → recovery, then write new primary.
- Controller `deletePending` busy-rejects both directions (suppress other mutations while delete pending; suppress delete while write/reorder busy). Callers pass stable `routineId` (no retargeting).
- UI entry points share one `alertdialog`: swipe-revealed Delete, persistent list Delete, detail “Delete routine”.

## Testing strategy

- Unit: Vitest + fake-indexeddb; browser: Playwright; `npm run test:traceability` requires FIT-001…FIT-120 references in `src/` or `tests/`.
- Parent feature #14 pairs: #15↔#16 domain/persistence, #17↔#18 UI/a11y, #19↔#20 docs/traceability. Implementation order #15 → #17 → #19 (availability, not closure).

## Lessons

_Summarize reusable lessons. Detailed structured records go in `.squad/memory/` as NDJSON._
