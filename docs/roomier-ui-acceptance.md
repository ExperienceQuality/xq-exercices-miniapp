# Roomier Mobile UI — Acceptance Criteria

This document defines the approved acceptance criteria for the cohesive "roomier"
mobile UI update covering the Routines, Routine Detail, and Session Detail
screens, the shared editor/confirmation sheets, the grip-only session
reorder affordance, and the new exercise reorder. The sibling specification
lives in [roomier-ui-spec.md](roomier-ui-spec.md) and defines the shared
requirement anchors RUI-01…RUI-09; criteria below map to those anchors.

**Status:** Approved 2026-10-23 by user. Implemented; ready for PR
review; not released. Verified on `feat/roomier-ui` @ `2060a2e`:
166/166 unit tests, 225/225 Chromium browser tests, 111/111 FIT
traceability. Chromium-only — no physical-device or Safari validation
was run, and no production release is claimed.

**Supersession (narrow):** where these criteria overlap
[session-reordering-acceptance.md](session-reordering-acceptance.md), they
replace only the visible move-up/move-down affordance — SR-03 and the
disabled-boundary-controls portions of SRO-10, SRO-11, SRO-12, and the
"move button" phrasing of SRO-04. All other session criteria stand.

**Traceability:** the mapping is frozen on the verified `2060a2e` baseline:
RUI-AC-n → FIT-(76+n), so RUI-AC-01…35 occupy FIT-077…FIT-111.
FIT-001…FIT-076 are preserved — including updating session-reordering
tests to the new affordance rather than deleting coverage. The
traceability generator is extended to the 111-entry inventory.

## Acceptance criteria

### Readability and layout (RUI-01, RUI-02)

- **RUI-AC-01** Given any of the three screens at 390px, when rows render,
  then item names are ≥20px; body, button, and input text ≥18px; and
  metadata, helper, and section-label text ≥15px — with page titles at
  36px and sheet titles at 24px — measured in CSS px at 100% zoom.
  Progress report detail text is an exception: it renders at 18px.
- **RUI-AC-02** Given a routine, session, or exercise with a very long
  name, when it renders at 320px, then the full name wraps to multiple
  lines and is never truncated, clipped, or ellipsized.
- **RUI-AC-03** Given any screen, when viewport width is 320, 390, 768, or
  1440, then no horizontal scrolling occurs and all content stays inside
  the viewport; screen padding is 20px (16px at ≤360px) with 20px section
  gaps and consistent safe-area padding.
- **RUI-AC-04** Given a desktop viewport, when the app renders, then the
  shell remains the existing centered narrow app (max ~520px) on the gray
  background — no fake phone frame, status bar, or prototype chrome.
- **RUI-AC-05** Given a narrow header where actions do not fit on one line
  (e.g. "Import Fitness JSON" beside the create button at 320px), when it
  renders, then the actions wrap or stack rather than shrinking text or
  squeezing names.
- **RUI-AC-06** Given the app rendered at 320px with 200% text scaling,
  when the user navigates and uses every control, then no functionality
  is lost and no content becomes unreachable.
- **RUI-AC-07** Given the exercise list, when it renders, then no initials
  badge or generated number label competes with the exercise name.

### Controls and targets (RUI-03)

- **RUI-AC-08** Given any screen or sheet, when interactive elements are
  measured, then every target is ≥52×52px (text actions ≥52px content
  width), primary CTAs are ≥56px high, and top-level list rows are ≥88px.
- **RUI-AC-09** Given any screen, when icons render, then action/chevron/
  grip SVGs occupy a 28px box with a proportionate glyph stroke — not a
  small glyph inside an oversized box. Progress glyph arrows are text
  characters rendered at 24px, not SVG icons and not subject to the 28px
  SVG rule.
- **RUI-AC-10** Given any interactive element, when focused by keyboard,
  then a visible focus indicator is shown; actionable icons meet ≥3:1 and
  body text ≥4.5:1 contrast.

### Drag reorder — both lists (RUI-04)

- **RUI-AC-11** Given a multi-item session or exercise list, when the user
  drags a row by its grip with a real mouse and drops at a new position,
  then the item moves there and the change is saved once.
- **RUI-AC-12** Given a touch viewport, when the user performs a real
  touch drag starting on a grip — trusted browser-level input such as
  Chromium CDP `Input.dispatchTouchEvent` — then the item moves to the
  drop position and is saved. DOM-dispatched `TouchEvent`s and mouse
  input at a mobile viewport do not satisfy this.
- **RUI-AC-13** Given a drag that has not crossed the 6px vertical
  threshold, when the pointer is released, then no reorder commit occurs
  (and the tap may open the move menu — see RUI-AC-19).
- **RUI-AC-14** Given an in-progress drag, when it ends via Escape,
  `pointercancel`, navigation, unmount, or a parent membership change,
  then the preview is discarded, no write occurs, and listeners/
  autoscroll are removed — including across a screen switch.
- **RUI-AC-15** Given a drag released at the item's original position,
  when it settles, then no mutation is attempted.
- **RUI-AC-16** Given a list taller than the viewport with an initially
  offscreen destination (including variable-height wrapped exercise
  rows), when the user drags toward the edge, then autoscroll reveals and
  reaches it; cancelling that same drag writes nothing.
- **RUI-AC-17** Given scrolling that starts anywhere outside the grip,
  when the gesture runs, then native scrolling occurs and no drag starts;
  a drag never activates another control.
- **RUI-AC-18** Given session rows, when they render, then each shows the
  opener (name, count, chevron) and one 52px grip — no visible up/down
  buttons and no separate control strip. The same grip appears beside
  each exercise's name/metadata with Edit/Delete on their own row below.
- **RUI-AC-19** Given a grip activation that produced no drag (tap,
  click, Enter, or Space), when it completes, then a small anchored menu
  opens offering "Move earlier" and "Move later" — **approved accessibility
  refinement, not demonstrated in the prototype** — and
  releasing a completed drag never opens the menu.
- **RUI-AC-20** Given the move menu open, when the user activates an
  item with a single pointer press, then the item moves one position via
  the same reorder pipeline; Escape or outside interaction dismisses
  without mutation and returns focus to the grip, boundary items are
  visibly unavailable, and the menu is suppressed while a save is pending.

### Keyboard reorder and announcements (RUI-05)

- **RUI-AC-21** Given a focused grip in either list, when the user presses
  ArrowUp/ArrowDown, then the item moves one position per press via the
  same reorder pipeline, focus stays on that grip, and no pickup mode is
  required.
- **RUI-AC-22** Given a grip on the first or last row, when the user
  presses the arrow toward the boundary, then nothing moves and nothing
  is written.
- **RUI-AC-23** Given a persisted keyboard/menu/drag move, when it
  settles, then a polite live region announces `"{name} moved to position
{n}."` and save failure is announced accessibly as well; the grip
  carries a usage description and `aria-keyshortcuts`.
- **RUI-AC-24** Given a list with zero or one item, when it renders, then
  no enabled reorder affordance exists (grip hidden or disabled); empty
  lists keep their existing CTAs.

### Exercise order data contract (RUI-06)

- **RUI-AC-25** Given a session with exercises [A, B, C], when a valid
  permutation [C, A, B] is committed, then `session.exercises` becomes
  exactly that permutation — only that array changes; every other routine,
  session, exercise, and snapshot field is untouched.
- **RUI-AC-26** Given a permutation missing an ID, duplicating an ID,
  containing a foreign/unknown ID, or of the wrong length, when the
  command runs, then it rejects with the existing `'validation'` error
  vocabulary and writes nothing; missing routine/session parents reject
  with the existing `missing-*` codes.
- **RUI-AC-27** Given an identical permutation, when reorder is invoked,
  then the original document is returned and no write occurs; after a
  successful reorder, adding an exercise appends after the last item,
  editing preserves position/ID, and deleting preserves relative order.
- **RUI-AC-28** Given two exercises with the same name, when one is
  reordered, then the correct item moves — identity resolves by stable
  ID, never by name.

### Persistence, concurrency, and failure (RUI-07, RUI-08)

- **RUI-AC-29** Given a committed reorder saved with the network disabled
  in an already-loaded app, when connectivity is restored (or assets are
  otherwise ensured available) and the app is reloaded, then the
  committed order displays exactly as saved. Given a v2 import fixture
  containing a reordered exercise array, when it is imported through the
  existing import path, then the exercise order is preserved — no export
  feature is required or added.
- **RUI-AC-30** Given any reorder save that fails non-conflict, when the
  failure lands, then the UI restores the latest locally committed order,
  a visible error is shown and announced, and no partial order persists
  across reload.
- **RUI-AC-31** Given a revision conflict during a reorder save, when it
  settles, then it fails closed: preview rolled back, error shown, stored
  order never overwritten, no automatic retry; a manual retry first
  reloads latest committed state.
- **RUI-AC-32** Given a pending reorder save, when the user attempts
  another reorder on either list, then it is suppressed until the save
  settles — nothing is queued or written twice; unrelated mutations and
  navigation keep existing rules, and a screen switch mid-pending never
  retargets the write.
- **RUI-AC-34** Given a caller-supplied permutation array, when a reorder
  is invoked, then the controller copies the array and captures the
  parent routine/session explicitly **before** entering the serialized
  queue; a queued add/edit/delete or reorder validates against the
  latest serialized document, so a stale permutation rejects instead of
  clobbering current content, and a context switch before queue execution
  never retargets the write.
- **RUI-AC-35** Given a committed reorder, when snapshots are inspected,
  then existing snapshot IDs, timestamps, and content are unchanged, and
  future snapshot aggregation keeps the current folded-key order, maxima,
  and classification semantics — except the documented duplicate-casing
  caveat for same-name exercises; the aggregation algorithm itself does
  not change.

### Compatibility (RUI-09)

- **RUI-AC-33** Given the shipped feature, when existing flows are
  exercised, then session Edit/Delete + confirmations, exercise Edit/
  Delete + confirmations, add/create/import actions, progress markers,
  and comma-decimal weight input behave exactly as before; schema stays
  v2 with no migration, no new dependency, and no backend change.

## Test coverage matrix

| Criteria group                                                | Cheapest sufficient lane(s)                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| RUI-AC-25–28, 35 (permutation math, isolation, snapshots)     | Domain/integration Vitest (`commands.test.ts`)                       |
| RUI-AC-29–32, 34 (gate, conflict, failure, queue, reload)     | Controller/repository Vitest + fake-indexeddb                        |
| RUI-AC-19–24 (menu, keyboard, focus, suppression)             | Svelte component tests (jsdom) + Playwright pointer-activation/focus |
| RUI-AC-01–10 (sizes, overflow, contrast, wrap)                | Component + Playwright layout projects (320/390/768/1440)            |
| RUI-AC-11–18, 29–33 (trusted input, autoscroll, offline, axe) | Playwright — authoritative                                           |

Component DOM tests cannot prove trusted touch, native scroll-vs-drag
arbitration, or autoscroll — the browser lane is authoritative for those.
Physical-device validation is optional and cannot be claimed before it
runs; the prototype's check results are not production evidence.

## Approval gate

This document and [roomier-ui-spec.md](roomier-ui-spec.md) were approved by
the user on 2026-10-23, including the tap-to-open move menu (RUI-AC-19/20) —
the only behavior not demonstrated in the prototype. The plan is approved
and the verified latest-main baseline is recorded in the spec §12; FIT IDs
are assigned per the traceability note above. No prototype check result is
a production-pass claim.
