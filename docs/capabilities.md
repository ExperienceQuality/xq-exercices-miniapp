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

- Add named sessions to a routine; new sessions append at
  `max(order) + 1` and deletes never renumber.
- Reorder sessions within a routine via a dedicated grip: drag it with a
  mouse or touch pointer (edge autoscroll), tap it for a "Move earlier /
  Move later" menu, or use Arrow Up / Arrow Down while it is focused;
  reorder reassigns unique `order` values while names, IDs, exercises,
  and snapshots stay untouched.
- Rename or delete a session (delete has a confirmation dialog and
  removes the session's exercises).
- Sessions appear as a list sorted by `order`; tapping one drills into a
  session detail screen (iOS-style drill-down navigation:
  routines → routine → session).

### Exercises

- Add/edit/delete exercises inside a session.
- Reorder exercises within a session with the same grip affordance as
  sessions — pointer drag, tap-to-move menu, or focused Arrow keys; the
  exercises array position is the canonical order and every field stays
  intact.
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

## Acceptance traceability

The roomier mobile UI acceptance criteria
([roomier-ui-acceptance.md](roomier-ui-acceptance.md)) map one-to-one
into the FIT inventory: RUI-AC-n → FIT-(76+n), occupying
FIT-077…FIT-111. FIT-001…FIT-076 are preserved unchanged.

| Acceptance | FIT     | Requirement summary                                                                                                  |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| RUI-AC-01  | FIT-077 | Typography: 20px names, 18px body/inputs, 15px metadata/helpers, 36px/24px titles; progress details 18px.            |
| RUI-AC-02  | FIT-078 | Long routine/session/exercise names wrap at 320px without clipping.                                                  |
| RUI-AC-03  | FIT-079 | No overflow at 320/390/768/1440; 20px padding (16px small), 20px gaps and safe areas.                                |
| RUI-AC-04  | FIT-080 | Centered desktop app, 520px maximum shell, no prototype chrome.                                                      |
| RUI-AC-05  | FIT-081 | Narrow headers wrap or stack actions without shrinking text.                                                         |
| RUI-AC-06  | FIT-082 | 200% text scaling at 320px preserves reachable functionality.                                                        |
| RUI-AC-07  | FIT-083 | No exercise initials badge or generated number labels competing with names.                                          |
| RUI-AC-08  | FIT-084 | Targets at least 52 by 52px, primary CTAs 56px high, rows 88px high.                                                 |
| RUI-AC-09  | FIT-085 | Action, chevron and grip SVG boxes are 28px with proportionate glyphs; progress glyph arrows are 24px text, not SVG. |
| RUI-AC-10  | FIT-086 | Visible keyboard focus; icon contrast at least 3:1, normal text at least 4.5:1.                                      |
| RUI-AC-11  | FIT-087 | Mouse grip drag to a new position commits once.                                                                      |
| RUI-AC-12  | FIT-088 | Trusted browser-level touch grip drag commits the intended order.                                                    |
| RUI-AC-13  | FIT-089 | Below-6px movement never commits a reorder.                                                                          |
| RUI-AC-14  | FIT-090 | Escape, pointer cancellation, navigation, unmount or membership change cancels cleanly.                              |
| RUI-AC-15  | FIT-091 | Dropping at the original position attempts no mutation.                                                              |
| RUI-AC-16  | FIT-092 | Edge autoscroll reaches offscreen destinations, including variable-height rows.                                      |
| RUI-AC-17  | FIT-093 | Native scrolling outside the grip remains normal; dragging activates no other controls.                              |
| RUI-AC-18  | FIT-094 | One grip beside session/exercise content; exercise Edit/Delete below; no permanent arrows.                           |
| RUI-AC-19  | FIT-095 | Tap, click, Enter or Space opens the move menu, never a completed drag.                                              |
| RUI-AC-20  | FIT-096 | Menu actions share the reorder pipeline, respect boundaries, dismiss safely and suppress while pending.              |
| RUI-AC-21  | FIT-097 | Focused grip ArrowUp/ArrowDown moves one position and retains focus.                                                 |
| RUI-AC-22  | FIT-098 | Arrow presses toward a boundary move nothing and write nothing.                                                      |
| RUI-AC-23  | FIT-099 | Persisted moves and failures are announced; grips have usage descriptions and key shortcuts.                         |
| RUI-AC-24  | FIT-100 | Empty/singleton lists offer no enabled reorder action and retain empty-state CTAs.                                   |
| RUI-AC-25  | FIT-101 | Valid exercise permutation replaces only the target exercise array.                                                  |
| RUI-AC-26  | FIT-102 | Invalid exercise permutations and missing parents reject without writes.                                             |
| RUI-AC-27  | FIT-103 | Same-order identity skips writes; add appends, edit preserves position, delete preserves relative order.             |
| RUI-AC-28  | FIT-104 | Duplicate exercise names resolve by stable ID, never by name.                                                        |
| RUI-AC-29  | FIT-105 | Offline save survives reconnect/reload; v2 import preserves exercise array order.                                    |
| RUI-AC-30  | FIT-106 | Generic failures restore latest committed order and show/announce errors.                                            |
| RUI-AC-31  | FIT-107 | Revision conflicts never overwrite or automatically retry; reload precedes manual retry.                             |
| RUI-AC-32  | FIT-108 | Pending reorders suppress both lists without queueing; context changes never retarget writes.                        |
| RUI-AC-33  | FIT-109 | Existing edit/delete/import/create/progress/decimal flows and schema v2 remain compatible.                           |
| RUI-AC-34  | FIT-110 | Caller arrays and explicit parents are captured before queueing; latest-document validation prevents stale clobber.  |
| RUI-AC-35  | FIT-111 | Existing snapshots and future aggregate semantics remain unchanged except documented casing behavior.                |

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
