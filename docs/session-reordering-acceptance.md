# Session Reordering — Acceptance Criteria

This document defines the approved acceptance criteria for reordering named
sessions within a routine. Product language calls a routine a "split"; the two
terms denote the same entity — sessions belong directly to a routine, and there
is no nested split inside a routine. The sibling specification lives in
[session-reordering-spec.md](session-reordering-spec.md) and defines shared
requirement anchors SR-01…SR-08; criteria below map to those anchors.

**Status:** approved 2026-10-23; implemented on the feature branch;
verification in progress (see Test coverage below). The criteria are
mapped into the global `FIT-NNN` inventory as `SRO-N` → `FIT-(52+N)`, i.e.
SRO-01…SRO-24 → FIT-053…FIT-076. `npm run test:traceability` enforces the
extended inventory (FIT-001…FIT-076) by scanning `src/` and `tests/`, and the
implementation references each new ID from test code there. The
`tests/browser/traceability.js` developer-owned mapping alone is not
sufficient — SRO-02 (FIT-054) is additionally covered by real domain-test
references because it has no reachable UI path.

## Scope anchors (from sibling spec)

- SR-01 — reorder defines intended sequence; scope is one routine ("split").
- SR-02 — dedicated mouse/touch drag handle; tapping the row body (outside the
  handle and the move buttons) opens the session; scrolling outside the handle
  is normal.
- SR-03 — accessible keyboard-operable move-up/move-down controls.
- SR-04 — atomic persistence; survives reload; failed save restores committed
  order and shows error; no automatic retry.
- SR-05 — remove generated `Session {index}` labels only (list subtitle shows
  exercise count only, detail subtitle routine name only); user-provided names
  untouched.
- SR-06 — names/IDs/exercises/snapshots unchanged; new sessions append.
- SR-07 — cancellation, no-op drops, and boundary positions write nothing;
  offscreen drop destinations must be reachable via edge autoscroll.
- SR-08 — compatibility with existing persistence and mutation serialization;
  offline mutations once app assets are loaded; while a reorder save is pending,
  further reorder controls are disabled/suppressed (unrelated mutation
  serialization unchanged).

## Acceptance criteria

### Sequence and scope (SR-01)

- **SRO-01** Given a routine containing exactly three named sessions
  in committed order [A, B, C], when the user moves C above A via any
  supported reorder control and the save succeeds, then the routine's
  committed order is [C, A, B] and it defines the intended workout
  sequence.
- **SRO-02** Given two routines, when the user attempts to move a session
  from one routine's list into the other routine (cross-routine transfer
  or drop), then the move is refused: both routines keep their session
  membership and committed orders, and no save occurs.
- **SRO-03** Given two routines, when a session is reordered in the first
  routine, then the second routine's data is entirely unchanged.
- **SRO-04** Given a routine with zero or one session, when the session
  list is rendered, then no enabled reorder control (drag handle or move
  button) is offered.

### Pointer interaction (SR-02)

- **SRO-05** Given a multi-session routine on desktop, when the user
  drags a session by its dedicated drag handle with the mouse and drops
  it at a new position, then the session moves to that position and the
  change is saved.
- **SRO-06** Given a multi-session routine on a touch viewport, when the
  user performs a real touch drag starting on the drag handle, delivered
  as trusted browser-level touch input — e.g. Chromium CDP
  `Input.dispatchTouchEvent` (via `context.newCDPSession(page)`) or an
  equivalent trusted touch path — then the session moves to the drop
  position and the change is saved. Synthetic DOM `TouchEvent`s
  dispatched via `page.dispatchEvent` and mouse input at a mobile
  viewport do not satisfy this.
- **SRO-07** Given any session row, when the user taps or clicks the row
  body — the row area outside the drag handle and outside the
  move-up/move-down buttons — then the session detail opens and no
  reorder occurs.
- **SRO-08** Given a session list taller than the viewport, when the
  user scrolls starting outside a drag handle, then normal scrolling
  occurs and no reorder starts. Touch-based verification uses the same
  trusted browser-level input as SRO-06; a DOM-only event substitute
  does not prove native scrolling.
- **SRO-09** Given a drag in progress, when the pointer travels over
  interactive row content or toward a navigation affordance, then the
  drag can never trigger navigation or activate another control.

### Accessible move controls (SR-03)

- **SRO-10** Given a session in a multi-position routine, when the user
  focuses its move-up/move-down controls with the keyboard and activates
  one, then the session moves one position in that direction, focus
  stays with the moved session, and the change is saved.
- **SRO-11** Given a routine with at least two sessions, when the top
  session's move controls render, then move-up is disabled and move-down
  is enabled; symmetrically the bottom session has move-down disabled
  and move-up enabled; disabled controls cause no write when activated.
  (A singleton list offers no enabled reorder action at all — see
  SRO-04.)
- **SRO-12** Given a completed move by keyboard, when the move finishes,
  then a screen reader announcement reports the result; announcing the
  new position is permitted even though visible numeric labels were
  removed.

### Persistence (SR-04, SR-08)

- **SRO-13** Given the app already loaded and a successful reorder
  committed with the network disabled, when connectivity is restored (or
  assets are otherwise ensured available) and the app is reloaded, then
  the committed order is displayed exactly as saved. The app is
  offline-first but ships no service worker: persisting mutations offline
  once assets are loaded is covered; loading the app cold while offline
  is not promised and is not part of this criterion.
- **SRO-14** Given a reorder save that fails for any non-conflict
  reason, when the failure is surfaced, then the prior committed order
  is restored in the UI and an error message is shown; no partial order
  persists across reload.
- **SRO-15** Given a storage revision conflict detected during a reorder
  save, when the save completes, then it fails closed: the local preview
  order is rolled back, an error is shown, the conflicting stored order
  is not overwritten, and no automatic retry occurs. A manual retry
  requires reloading the latest committed state first and must never
  silently overwrite the conflicting order.
- **SRO-16** Given a reorder save already pending, when the user
  attempts another reorder via any reorder control, then the reorder
  controls are disabled or suppressed until the pending save settles and
  no second reorder is queued or written. Unrelated mutations keep the
  existing serialization rules; no new global restriction is introduced.
- **SRO-17** Given a reorder save, when it is written, then the routine
  update is atomic: the stored record never exposes a partially applied
  order.

### Labels, identity, and data preservation (SR-05, SR-06)

- **SRO-18** Given sessions with generated ordering, when the list and
  the session detail render, then no generated visible `Session {index}`
  numbering appears — the list row subtitle shows only the exercise
  count and the detail subtitle only the routine name; internal numeric
  order values may still exist.
- **SRO-19** Given a session literally named "Session 1" by the user,
  when reorder UI renders, then that user-provided name is displayed
  unchanged.
- **SRO-20** Given two sessions sharing the same name, when one is
  reordered, then the correct session moves — identity is resolved by
  stable session ID, not by name.
- **SRO-21** Given a committed reorder, when session data is inspected
  or a snapshot is taken, then names, IDs, exercise contents, and
  snapshot behavior are unchanged; a successful reorder may reassign
  internal numeric order values to form a unique valid permutation, and
  the exact numbering is not part of the contract. Existing
  noncontiguous order values remain valid; deletion does not trigger
  renumbering. Schema version stays v2 and previously stored documents
  remain importable.
- **SRO-22** Given a committed reorder, when a new session is created in
  the same routine, then it appends after the last session and does not
  disturb the committed order; deleting a session after reorder leaves
  the remaining committed order intact.

### Cancellation and boundaries (SR-07)

- **SRO-23** Given an in-progress drag, when it is cancelled (Escape,
  pointer cancel, or drop back on the original position), then no write
  occurs and the displayed order equals the committed order.

### Long-list autoscroll (SR-02, SR-07)

- **SRO-24** Given a session list taller than the viewport with at least
  one drop destination initially offscreen, when the user drags a session
  by its handle toward the viewport edge using trusted browser-level
  input (real mouse, or trusted touch per SRO-06), then the list
  autoscrolls far enough to reveal and reach the offscreen destination,
  and dropping there saves the correct committed order; cancelling the
  same drag (Escape or pointer cancel) still produces no write. Every
  position, including offscreen ones, must be reachable; autoscroll
  thresholds and velocity are implementation tuning, and no drag-and-drop
  library is prescribed.

## Test coverage

All lanes below are authored: `src/fitness/domain/session-ordering.test.ts`,
`src/app/fitness-controller-reordering.test.ts`, `src/app/SessionList.test.ts`, and
`tests/browser/session-reordering.spec.ts` with helpers in
`tests/browser/support/session-reordering.ts`. Verification 2026-10-23:
the unit lane passes **106 tests** with coverage thresholds met; the
isolated browser gate observed **152/153** — one trusted-touch placement
flake (FIT-058, `390x844-touch`) traced to inertial scroll momentum racing
drop measurement, fixed by reloading and settling the viewport before
measurement (20/20 stability passes on both touch projects). A clean
full-suite browser run is pending CI. Existing suites
(`src/fitness/persistence/indexeddb-fitness-repository.test.ts`, the other
Playwright spec files) continue to cover FIT-001…FIT-052. Commands from
[docs/testing.md](testing.md): `npm run test:unit`,
`npm run test:browser`, `npm run test:traceability`.

| Criteria                                        | Lowest sufficient lane                                                                                                          | Proposed coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SRO-01–03, 20, 22 (order math, scope, identity) | Domain Vitest (`src/fitness/domain/session-ordering.test.ts`)                                                                   | Reorder permutations (multi-position moves), reorder scoped to one routine — a reorder referencing another routine's session is refused with no write, invalid/unknown session IDs rejected, duplicate names resolve by ID, no session loss or duplication, append-after-reorder, delete-after-reorder.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SRO-13–17, 21                                   | Controller/repository Vitest + fake-indexeddb (`fitness-controller-reordering.test.ts`, `indexeddb-fitness-repository.test.ts`) | Atomic commit, a second reorder suppressed — not queued or written — while a save is pending, unrelated mutation serialization unchanged, revision-conflict fail-closed with rollback and no retry, generic save failure restoring committed order, reload persistence, v2 schema/import compatibility, noncontiguous orders preserved, no renumber-on-delete.                                                                                                                                                                                                                                                                                                                                                                                                  |
| SRO-04, 10–12, 18–19, 23                        | Svelte component test (jsdom + @testing-library/svelte, colocated `*.test.ts`)                                                  | Disabled states at boundaries and empty/single-session lists, keyboard operability and focus retention, live-region announcement, absence of generated numbering while user name "Session 1" persists, Escape and no-op drops producing no mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| SRO-03, 05–13, 18, 23–24                        | Playwright (`npm run test:browser`), authoritative                                                                              | `desktop-chrome` 1440×900 for real mouse handle drag and multi-position drops; `390x844-touch` and `320x568-touch` for trusted browser-level touch input — Chromium CDP `Input.dispatchTouchEvent` via a CDP session (or `page.touchscreen` where a tap suffices); DOM-dispatched `TouchEvent`s and mouse-in-a-mobile-viewport do not count; row-body tap navigation, native touch scrolling outside the handle at browser level, no drag navigation, keyboard move controls and focus retention end-to-end, long-list edge autoscroll reaching an initially offscreen drop target, cancellation with no write, offline save with the network disabled followed by reload after connectivity is restored, other routine unchanged, responsive layout, axe scan. |

Playwright projects follow `playwright.config.ts`: `desktop-chrome`
(1440×900), `390x844-touch`, `320x568-touch`. Component DOM tests cannot
prove native drag-versus-scroll arbitration, trusted touch input, or
browser autoscroll — the browser lane is authoritative for those. There
is no physical-device validation in this repo.

## Approval gate

This document and
[session-reordering-spec.md](session-reordering-spec.md) were approved on
2026-10-23. Implementation and the FIT-053…FIT-076 traceability extension
are on the feature branch: unit, check, build, and traceability gates are
green (106 unit tests, FIT-001…FIT-076 enforced); the isolated browser
gate observed 152/153 plus one touch flake that is now deterministic
(see Test coverage), with a clean full-suite run pending CI.
