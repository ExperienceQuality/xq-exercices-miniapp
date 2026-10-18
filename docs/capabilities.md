# Product Capabilities

XQ Fitness (repository: `xq-exercices-miniapp`) is a fitness-only,
client-rendered Svelte 5 single-page application. All data lives in
browser-local IndexedDB. There is no SSR, no service worker, no app
backend for data, no telemetry, and no runtime third-party asset
dependency.

## What users can do

### Routines

- Create a routine with a required name and optional notes.
- Names are trimmed; blank names are rejected ("A name is required.").
- Select a routine from a card grid to open its workspace.

### Training sessions

- Add named sessions to a routine; each session gets a monotonically
  increasing `order` (append-only, never renumbered on delete).
- Rename or delete a session (delete has a confirmation dialog and
  removes the session's exercises).
- Sessions appear as a list sorted by `order`; tapping one drills into a
  session detail screen (iOS-style drill-down navigation:
  routines → routine → session).

### Exercises

- Add/edit/delete exercises inside a session.
- Fields: name (required), sets (positive integer), repetitions
  (positive integer), weight in kg (finite number ≥ 0).
- Editor defaults: 3 sets, 10 repetitions, 0 kg.
- Editing preserves exercise identity; deleting asks for confirmation.

### Progress snapshots

- "Capture Progress" records an immutable snapshot of the routine.
- Aggregation: exercises are folded by `name.trim().toLowerCase()`
  across all sessions; sets, repetitions, and weight take independent
  maxima. Entries are sorted by folded name.
- Each entry classifies repetitions and weight independently against
  the previous snapshot: `first`, `increased`, `decreased`, or `same`.
  Non-first classes render as colored arrow markers — up (green) for
  `increased`, down (red) for `decreased`, flat (grey) for `same` —
  with accessible labels preserving the class name.
- Only the two most recent snapshots are retained per routine.
- An empty snapshot shows guidance ("Add exercises before your next
  snapshot.").

### Import

- "Import Fitness JSON" replaces all state from a `.json` file.
- Accepts schema v2 (strictly validated) and v1 (migrated to v2:
  identities generated or preserved, session order backfilled, snapshot
  entries re-aggregated and re-classified, snapshots trimmed to two).
- Rejects malformed JSON, schema violations, and future schema versions
  (`schemaVersion > 2`) without touching stored data — import is atomic.

### Availability and recovery

- Loading, ready, and unavailable states with a retry that never
  performs a destructive reset.
- Storage keeps a `primary` and `recovery` record; a damaged primary is
  restored from a valid recovery copy on load (`recovered: true`).
- Optimistic-concurrency commits: every write checks `storageRevision`;
  a mismatch fails closed with "Fitness data changed in another tab."
- A future-version primary fails closed; data is never downgraded.

## Explicit non-goals

- No accounts, sync, sharing, or network persistence — data never
  leaves the browser after assets load.
- No physical-device or iOS Simulator validation in the test strategy.
- IndexedDB data is not encryption or backup: clearing site data,
  storage eviction, Incognito teardown, origin changes, or device loss
  can remove it. Scheme, host, and port are data-compatibility
  boundaries.

## User-facing error messages

Defined in `src/fitness/domain/errors.ts` (`messages`): validation
failures for name/sets/repetitions/weight, missing
routine/session/exercise, invalid import, unsupported version, storage
conflict, and storage unavailable.
