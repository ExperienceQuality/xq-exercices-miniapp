# Persistence port: operation-based repository

Summary of the `FitnessRepository` redesign: the port enforces domain
**operations** instead of whole-document replacement, so the IndexedDB
adapter replays typed mutations atomically and a future REST adapter
could follow the same protocol honestly.

> **Scope.** Only the IndexedDB adapter exists today; storage is
> entirely local. The REST mapping below is backend-readiness design
> intent, not shipped functionality — no network access, credentials, or
> server work is part of this change.

## Contract

```ts
export type FitnessMutation =
  | { kind: 'create-routine'; routine: RoutineV2 }
  | { kind: 'add-session'; routineId: string; session: TrainingSessionV2 }
  | {
      kind: 'rename-session';
      routineId: string;
      sessionId: string;
      name: string;
    }
  | { kind: 'delete-session'; routineId: string; sessionId: string }
  | {
      kind: 'reorder-sessions';
      routineId: string;
      sessionIds: readonly string[];
    }
  | {
      kind: 'add-exercise';
      routineId: string;
      sessionId: string;
      exercise: ExerciseV2;
    }
  | {
      kind: 'update-exercise';
      routineId: string;
      sessionId: string;
      exercise: ExerciseV2;
    }
  | {
      kind: 'delete-exercise';
      routineId: string;
      sessionId: string;
      exerciseId: string;
    }
  | {
      kind: 'reorder-exercises';
      routineId: string;
      sessionId: string;
      exerciseIds: readonly string[];
    }
  | {
      kind: 'capture-snapshot';
      routineId: string;
      snapshot: ProgressSnapshotV2;
    }
  | { kind: 'replace-document'; document: FitnessDocumentV2 };

export interface FitnessRepository {
  load(): Promise<LoadedFitnessState>;
  apply(
    expectedRevision: number,
    mutation: FitnessMutation,
  ): Promise<{ readonly storageRevision: number }>;
}
```

## How it works

- Domain commands (`domain/commands.ts`) validate input, check target
  existence with the same precedence as before, materialize entities
  (client-generated IDs, normalized names, snapshot timestamps), and
  return `{document, mutation}` — the new document plus the intent
  descriptor (`CommandResult`).
- `domain/mutations.ts` holds the union and `applyMutation`, a pure
  reducer that replays a mutation onto a document. Commands delegate to
  it, so the reducer is the single source of truth for document surgery.
  Replay never generates IDs or timestamps — mutations carry fully
  materialized entities.
- The controller persists the mutation via `apply` and publishes the
  command-computed document locally **only after storage reports
  success** — there is no optimistic local state. On failure the
  published document and revision stay untouched.
- The IndexedDB adapter reads `primary` inside a single readwrite
  transaction, checks `expectedRevision`, replays the mutation against
  the stored document via `applyMutation`, re-parses the result with the
  zod schema, then writes the prior primary to `recovery` and the new
  document to `primary` at `storageRevision + 1`. Atomicity, dual-slot
  recovery, and fail-closed conflict handling are unchanged: stale
  revisions and replay/validation failures write neither slot.
- JSON import keeps its `(revision, document)` callback; the controller
  wraps it in a `replace-document` mutation.

## Why both backends would fit

- **IndexedDB adapter** replays the mutation onto the stored document
  atomically under the revision check (implemented).
- **Future REST adapter** could map each `kind` to an endpoint 1:1:

| Mutation                                               | Endpoint                                       |
| ------------------------------------------------------ | ---------------------------------------------- |
| `create-routine`                                       | `POST /routines`                               |
| `add-session`                                          | `POST /routines/:id/sessions`                  |
| `rename-session`                                       | `PATCH /routines/:id/sessions/:sid`            |
| `delete-session`                                       | `DELETE /routines/:id/sessions/:sid`           |
| `reorder-sessions`                                     | `PUT /routines/:id/sessions/order`             |
| `add-exercise` / `update-exercise` / `delete-exercise` | `POST` / `PUT` / `DELETE .../exercises[/:eid]` |
| `reorder-exercises`                                    | `PUT .../sessions/:sid/exercises/order`        |
| `capture-snapshot`                                     | `POST /routines/:id/snapshots`                 |
| `replace-document`                                     | `PUT /fitness-document`                        |
| `load`                                                 | `GET /fitness` (aggregated document view)      |

No diffing, no fabricated revision, one call per mutation — the
atomicity story stays honest.

## Requirements a remote backend would have to meet

- Server-owned, monotonically increasing integer `storageRevision`;
  stale `expectedRevision` → conflict (`409`/`412` → `storage-conflict`).
- Validate the same V2 schema (`persistence/schemas.ts` is the shared
  contract) or explicitly choose to trust the client.
- Enforce snapshot retention (≤2 per routine, `appendSnapshot`) and the
  V2 invariants: unique IDs, unique session order, sorted/deduplicated
  snapshot entries.
- Auth and user scoping would be injected into the adapter constructor
  (same pattern as `databaseName` today); the port carries no
  credentials.
- HTTP statuses would map onto `FitnessError` codes so UI messages stay
  stable.

## Design decisions

- **Materialized entities, not raw inputs.** Mutations carry fully
  built objects with client-generated IDs — deterministic, offline
  friendly, replay is pure, and the entity ID doubles as a natural
  idempotency key.
- **`expectedRevision` survives** as the optimistic-concurrency token
  on the local adapter and any future remote one.
- **`replace-document` is the escape hatch** for import and any bulk
  replace.
- **Reorder mutations carry exact permutations.** `reorder-sessions`
  and `reorder-exercises` carry the complete ordered ID list; the
  reducer validates membership/duplicates and returns the input
  document unchanged for a no-op order, which the controller uses to
  skip the write entirely.
- **Error vocabulary unchanged** — `FitnessError` codes
  (`storage-conflict`, `storage-unavailable`, `missing-*`, `validation`)
  still drive UI messages.

## Verification

- `svelte-check`, `eslint`, and `prettier --check` clean.
- Vitest unit suite passes, including `mutations.test.ts` (reducer
  replay parity for every union kind, no-op identity, malformed
  permutations, missing targets), granular-mutation adapter coverage in
  `indexeddb-fitness-repository.test.ts`, and mutation-payload
  assertions in the controller tests.
- `test:traceability` keeps the full FIT inventory referenced;
  `vite build` passes.
- Browser acceptance specs exercise the same flows through the real
  IndexedDB adapter; failure-injection seams operate at the IndexedDB
  transaction level and are unchanged.
