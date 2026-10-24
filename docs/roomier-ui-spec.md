# Roomier Mobile UI — Product & Technical Specification

**Status:** Approved 2026-10-23 by user. Implemented; ready for PR
review; not released. Verified on `feat/roomier-ui` @ `2060a2e`: 166/166
unit tests, 225/225 Chromium browser tests across all three projects,
111/111 FIT traceability, and all non-browser gates green. Verification
is Chromium-only — no physical-device or Safari validation was run, and
no production release is claimed.
**Sibling document:** acceptance criteria live in
[roomier-ui-acceptance.md](roomier-ui-acceptance.md) (written in parallel; this
document defines the shared requirement anchors RUI-01 through RUI-09 it
references).

**Supersession (narrow):** this document supersedes ONLY the visible
move-up/move-down button affordance in
[session-reordering-spec.md](session-reordering-spec.md): requirement **SR-03**
in full, the UX-contract paragraph describing move-up/move-down buttons as the
keyboard path (§4), and the disabled-boundary-controls portions of acceptance
criteria **SRO-10, SRO-11, SRO-12** plus the "move button" phrasing of
**SRO-04**. Every other session-reordering behavior, historical ID, and
traceability obligation is retained unchanged — session tests are to be
_updated_ to the new affordance, not deleted. No other prior specification is
modified.

**Superseded affordance, in one line:** the grip handle replaces visible
per-row up/down arrows on session rows; the same grip pattern is introduced
for exercises (see §5).

**Baseline clarification:** the verified main baseline uses
`commit(expectedRevision, candidate)` and pure commands returning
`FitnessDocumentV2`. A deferred `apply(expectedRevision, mutation)`
refactor remains only in the original dirty worktree and is excluded. This
feature does not change the shipped persistence port (see §12).

## 1. Objective

One cohesive "roomier" pass over the phone experience of XQ Fitness: larger,
more readable text and icons and less crowding across the three existing
screens — Routines, Routine Detail, Session Detail — and the shared
editor/confirmation bottom sheets. The existing iOS grouped-list visual style,
system font stack, and palette are retained. Alongside the visual pass, the
session reorder affordance changes (drag grip only, no permanent arrows) and
the same reorder capability is added for exercises inside a session.

The design target was demonstrated in a standalone prototype; all sizes and
behaviors below are the durable contract and stand alone without it.

## 2. Non-goals

- Any new feature beyond restyled screens, the session-affordance change, and
  exercise reordering: no new screens, no schema v3, no backend, no export.
- Moving items across parent lists (sessions between routines, exercises
  between sessions).
- A drag-and-drop or component library; any new dependency requires
  explicit user approval — it is not a delegated implementation decision.
- Renumbering sessions on delete, imposing contiguous `order` values, or any
  aggregate/snapshot algorithm change.
- Production-quality claims from the prototype: it is an ephemeral visual
  reference, not a deployable artifact and not the source of truth.

## 3. Requirement anchors

- **RUI-01 — Readability.** Larger text everywhere: 20px item names, 18px
  body/button/input text, 15px minimum metadata/helper/section-label text,
  36px page titles, 24px sheet titles. Names wrap; nothing truncates.
- **RUI-02 — Layout.** 20px screen padding (16px at ≤360px), 20px section
  gaps, consistent safe-area padding, ≥88px top-level list rows, no
  horizontal overflow at 320/390/768/1440, desktop remains a centered narrow
  app (existing 520px max) — no fake phone frame, status bar, or prototype
  chrome ships.
- **RUI-03 — Controls.** Every interactive target ≥52×52px (text actions
  ≥52px content width), primary CTAs ≥56px high, SVG icons drawn in a 28px
  box with meaningful glyph stroke — not a small glyph floating in a large
  box. Visible keyboard focus on everything.
- **RUI-04 — Drag reorder.** Pointer reorder on session and exercise lists
  via a dedicated 52px grip only: 6px threshold, speculative preview,
  single commit on release, full cancellation semantics, edge autoscroll
  reaching offscreen targets.
- **RUI-05 — Accessibility.** Keyboard ArrowUp/ArrowDown on the focused grip;
  no permanent up/down arrows; a small pointer+keyboard "move" menu as the
  WCAG 2.2 AA 2.5.7 non-drag alternative; live-region announcements; all
  contrast thresholds met.
- **RUI-06 — Exercise order.** `session.exercises` array position is the
  canonical order; reorder is an exact bijective ID permutation validated
  against the parent, replacing only that array.
- **RUI-07 — Persistence.** Reorders persist atomically under the existing
  revision-checked commit path, survive reload and import round-trip, work
  offline once assets are loaded.
- **RUI-08 — Concurrency.** One reorder save at a time across both lists;
  conflicts and failures fail closed with preview rollback; no silent
  overwrite, no automatic retry, no cross-context retargeting.
- **RUI-09 — Compatibility.** Schema v2 unchanged, no migration, no new
  dependency; all existing behavior (progress markers, comma-decimal input,
  snapshots, edit/delete/confirm flows) preserved.

## 4. Design contract

Authoritative sizes are CSS pixels at 100% zoom, implemented as `rem`
equivalents so they respect user font-size settings — no fixed-viewport or
fixed-pixel enforcement.

| Element                                  | Size / rule                                          |
| ---------------------------------------- | ---------------------------------------------------- |
| Page title (`h1`)                        | 36px, existing weight/letter-spacing                 |
| Sheet title (`h2`)                       | 24px                                                 |
| Item names (routine/session/exercise)    | 20px semibold, wraps, never ellipsized               |
| Body, button, and input text             | 18px                                                 |
| Metadata, helpers, section labels        | ≥15px (labels keep uppercase styling)                |
| Progress report detail text              | 18px (exception to the 15px metadata floor)          |
| Progress glyph arrows (↑/↓/→)            | 24px text glyph, bold — not an SVG icon              |
| Action icons (chevron, plus, grip, back) | 28px SVG box, meaningful glyph stroke                |
| Interactive controls                     | ≥52×52px; text actions ≥52px content width           |
| Primary CTA                              | ≥56px high, existing pill shape                      |
| Top-level list rows                      | ≥88px                                                |
| Screen padding                           | 20px; 16px at ≤360px                                 |
| Section gaps                             | 20px                                                 |
| Surfaces                                 | grouped-list white cards, existing radius/separators |

- Palette unchanged: background `#f2f2f7`, surfaces `#ffffff`, primary navy
  `#182b4f`, muted `#5c5f72`, danger `#c62828`. Active/actionable icons meet
  ≥3:1 contrast against their surface; normal text meets ≥4.5:1; keyboard
  focus remains visibly outlined.
- Narrow viewports: header and section-heading actions **wrap or stack**
  rather than shrinking fonts or squeezing names. Buttons such as
  "Import Fitness JSON" may take two lines.
- No generated number labels and no initials badge competing with the
  exercise name (the round initials marker is removed).
- Text resize: at 320px width with 200% text scaling, every control remains
  reachable and functional; no functionality may be lost.

### Row anatomy

- **Session row:** opener button (name + exercise count + 28px chevron) and
  a 52×52 grip on the same row. No visible up/down buttons, no extra control
  strip.
- **Exercise row:** top block with the 20px name and
  `N sets · N reps · N kg` metadata wrapping beside a 52×52 grip; a separate
  lower row holds Edit and Delete as ≥52px targets. Session-level Edit/Delete
  and the confirmation sheets keep their current behavior.
- Singleton lists expose no enabled reorder affordance (grip hidden or
  disabled). Empty lists keep their existing empty-state CTAs.
- Dragging a grip never triggers open, edit, delete, or navigation; tapping
  the opener area keeps its existing action.
- Identity is by stable item ID — duplicate names reorder correctly.

## 5. Interaction contract (both lists)

### Pointer drag

- Drag starts only from the dedicated grip — mouse and real touch. A 6px
  vertical activation threshold separates a tap from a drag.
- While dragging, the list renders a speculative local preview only; the
  drop position is chosen by row midpoint. Releasing at a changed position
  commits exactly once; releasing at the original position writes nothing.
- Escape, `pointercancel`, screen navigation, component unmount, or a
  membership change of the parent list cancels the drag: the preview is
  discarded, no write occurs, and all listeners/autoscroll are removed.
- Scrolling that starts outside the grip stays native; a drag never
  activates another control. No overlapping drags (one active drag total).
- Edge autoscroll is required for long lists: every destination, including
  initially offscreen ones and variable-height wrapped exercise rows, must
  be reachable. Threshold/velocity are implementation tuning; no library.

### Tap → move menu (approved accessibility refinement)

Approved as part of this spec; it was not demonstrated in the prototype —
keep that caveat visible when validating. A tap/click/Enter/Space on the
grip that produces no drag
opens a small anchored menu next to the grip with text actions
**"Move earlier"** and **"Move later"**:

- selectable with a single pointer activation — this is the non-dragging
  alternative required by WCAG 2.2 AA criterion 2.5.7 (not keyboard-only);
- boundary items are unavailable (visibly disabled, not hidden);
- Escape or outside interaction dismisses with no mutation and returns
  focus to the grip; menu actions ride the exact same reorder pipeline as
  the drag and arrows;
- the menu never opens after a released drag (threshold crossing
  distinguishes drag from tap), and is suppressed while a save is pending.

### Keyboard

- ArrowUp/ArrowDown on the focused grip moves the item one position per
  press — no pickup/lift mode.
- The grip retains focus across moves by stable row identity; boundary
  presses are no-ops that write nothing.
- The grip carries a programmatic description of its usage (plus
  `aria-keyshortcuts`); after a persisted move, a polite live region
  announces `"{name} moved to position {n}."` Saving and failure states are
  announced accessibly as well.
- No permanent up/down arrow buttons are rendered.

## 6. Data & persistence contract

- `ExerciseV2 = { id, name, sets, repetitions, weightKg }` is unchanged; no
  order field is added to exercises. `TrainingSessionV2.exercises` (a
  readonly array) **is** the canonical exercise order; session `order`
  numeric invariants (unique values, noncontiguous allowed) are unchanged.
- Add appends after the persisted last item; edit preserves position and ID;
  delete preserves the relative order of what remains.
- New pure command, same style as existing commands (readonly interfaces,
  `FitnessError` vocabulary — `'validation'` for an invalid permutation,
  `missing-routine`/`missing-session` for absent parents):

```ts
declare function reorderExercises(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  exerciseIds: readonly string[],
): FitnessDocumentV2;
```

- The command validates that `exerciseIds` is a complete bijection of the
  target session's exercise IDs — no missing, duplicated, foreign, or
  wrong-length inputs — and returns the original document unchanged for a
  same-order input (no write). It replaces only the targeted `exercises`
  array inside the candidate document.
- Controller method `reorderExercises(routineId, sessionId, exerciseIds):
Promise<void>`: captures the parent routine/session explicitly and copies
  the caller's array **before** entering the serialized mutation queue,
  validates the permutation against the latest serialized document, and
  commits through the same revision-checked repository path used by the
  other writes on latest main (`commit(expectedRevision, candidate)` — see
  §12). No `apply`/operation migration is part of this feature.
- The existing `reorderPending` gate is reused and widened: while any
  reorder save is pending, reorder controls on **both** lists are suppressed
  until it settles — no second reorder is queued or written. Unrelated
  mutations keep the existing serialization; navigation is not blocked
  beyond existing rules.
- Atomicity is unchanged: `expectedRevision` check plus primary/recovery
  write inside one transaction. Exercise order persists via the existing
  schema-v2 record and import round-trip; mutating an already-loaded app
  works offline; cold offline start is not promised.

## 7. Failure & concurrency contract

- Any non-conflict failure restores the preview to the **latest locally
  committed** document (not a stale full-document capture), surfaces a
  visible error, and announces it; no partial order is ever stored.
- A revision conflict fails closed: roll back the preview, show the error,
  never overwrite the stored order, never auto-retry. A manual retry must
  reload latest committed state first.
- Context switching while a save is pending never retargets the write;
  success/failure updates the IDs captured at queue time, not whichever
  screen happens to be selected.
- A membership change during a drag (e.g. an add/delete landing mid-gesture)
  cancels the drag; a stale serialized permutation is rejected safely rather
  than clobbering current content.
- Reorder preserves IDs, names, sets, reps, weights, all other session and
  routine ordering, and all snapshot IDs/timestamps/content. Future
  snapshots keep the existing folded-name sort/maxima/classification
  semantics — one caveat to record: for duplicate exercise names with
  differing casing, moving them can change which casing the aggregator
  displays first; full future-entry equality is explicitly not promised in
  that case, and the aggregation algorithm does not change.

## 8. Code map

- `src/styles/app.css` — the roomier token set and row anatomy live here.
- `src/app/RoutinesScreen.svelte`, `RoutineDetailScreen.svelte`,
  `SessionDetailScreen.svelte`, `App.svelte` — screens and shared sheets.
- `src/app/SessionList.svelte` — grip-only affordance; a shared
  pointer/keyboard reorder seam plus a proposed `ExerciseList.svelte`
  component is the expected shape (component split is an implementation
  decision, not this spec's requirement).
- `src/fitness/domain/commands.ts`, `model.ts`, `validation.ts`,
  `errors.ts`, `snapshots.ts` — new command + unchanged invariants
  (`mutations.ts` is part of the deferred in-progress refactor and is not
  a foundation for this feature).
- `src/app/fitness-controller.ts` — `reorderExercises`, `reorderPending`
  gate.
- `src/fitness/persistence/*` — port and adapter unchanged.
- Tests: `src/fitness/domain/commands.test.ts`,
  `src/app/fitness-controller.test.ts`, `src/app/SessionList.test.ts`,
  `src/app/ExerciseList.test.ts` (**proposed path**),
  `tests/browser/session-reordering.spec.ts`,
  `tests/browser/exercise-reordering.spec.ts`,
  `tests/browser/roomier-ui.spec.ts` (**proposed paths**).

## 9. Testing strategy

- **Unit (Vitest + jsdom + fake-indexeddb):** permutation math, no-op,
  wrong-length/foreign/duplicate-ID rejection, parent-scoped isolation.
- **Controller:** deferred gate across both lists, concurrency, conflict
  fail-closed, generic-failure restore.
- **Component:** grip keyboard moves + focus retention + announcements,
  move-menu open/dismiss/boundary states, singleton suppression.
- **Browser (authoritative, Playwright):** real mouse drag and trusted
  browser-level touch (Chromium CDP `Input.dispatchTouchEvent`), native
  scroll vs. drag arbitration, edge autoscroll to offscreen targets,
  offline save + reload persistence, error surfaces, axe serious/critical
  zero. Projects: `desktop-chrome` 1440×900, `390x844-touch`,
  `320x568-touch`, plus an additional 768px layout check.
- Coverage thresholds unchanged: 95% statements/branches for
  domain/persistence/import, 80% for controller and `src/fitness/ui`.
- Visual review via screenshots is expected; physical-device checks are
  optional and cannot be claimed pre-verified. The prototype's check count
  is not evidence for this implementation.

## 10. Relevant commands

Verified against `package.json` (no `dev` script exists):

- `npx vite --host 127.0.0.1 --port 5173` — local dev server
- `npm run build`, `npm run check`, `npm run lint`, `npm run format:check`
- `npm run test:unit`, `npm run test:browser`, `npm run test:traceability`
- Docs-only check for these files:
  `npx prettier --check docs/roomier-ui-spec.md docs/roomier-ui-acceptance.md`
- Focused future lanes (**proposed paths**):
  `npx vitest run src/fitness/domain/commands.test.ts src/app/fitness-controller.test.ts src/app/SessionList.test.ts src/app/ExerciseList.test.ts`
  `npx playwright test tests/browser/session-reordering.spec.ts tests/browser/exercise-reordering.spec.ts tests/browser/roomier-ui.spec.ts`

## 11. Boundaries

- **Always:** preserve user WIP, schema v2, coverage thresholds, and real
  app chrome (no prototype frame/status bar); no writes to production data.
- **Ask first:** any dependency (requires explicit user approval), schema
  change, architecture/CI change, or commit.
- **Never:** weaken existing checks, import prototype static data or its
  chrome, or delete session-reorder test coverage instead of updating it.

## 12. Implementation baseline (verified)

Verified 2026-10-23 after an authorized fetch: `origin/main` is
`2060a2e0f4070be4d2387c1ae89ed89522f42ecf` and the PR9 squash commit
`690a0cc` is an ancestor (`git merge-base --is-ancestor`), confirming the
merge. The shipped repository port is
`commit(expectedRevision, candidate)` (`fitness-repository.ts`) with pure
domain commands returning `FitnessDocumentV2` — the shape this spec
assumes. A deferred local `apply`-port refactor exists only in a
separate uncommitted worktree; it is excluded and no product
architecture is changed by this feature. Baseline evidence: focused
Vitest 46/46 and `svelte-check` 0/0 on the clean `feat/roomier-ui`
worktree.

## 13. Resolved implementation decisions

- Shared list structure: one generic `ReorderableList.svelte` with thin
  `SessionList`/`ExerciseList` adapters was chosen.
- Drag tuning (as implemented in `ReorderableList.svelte`): 6px activation
  threshold, 56px edge autoscroll zone, 14px/frame maximum scroll step.

## 14. PR verification

Final gate on the reviewed code, observed 2026-10-24:

- `npm run format:check`, `npm run lint`, `npm run check` — all clean
  (0 errors, 0 warnings).
- `npm run test:unit` — 166/166 passing.
- `npm run test:traceability` — 111/111 criteria discovered.
- `npm run build` — clean.
- Playwright with local preview-port override; all configured Chromium
  projects (`desktop-chrome`, `390x844-touch`, `320x568-touch`) —
  225/225 passing, equivalent to `npm run test:browser` against a local
  preview build.
