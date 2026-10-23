# Session Reordering — Product & Technical Specification

**Status:** Approved 2026-10-23; implemented on the feature branch. Unit
lane green (106 tests, coverage thresholds met); the isolated browser gate
observed 152/153 with one trusted-touch placement flake (FIT-058 on
390x844-touch), since made deterministic (reload + viewport-settle
isolation; 20/20 stability passes on both touch projects). A clean
full-suite run is pending CI.
**Sibling document:** acceptance criteria live in
[session-reordering-acceptance.md](session-reordering-acceptance.md) (written in
parallel; this document defines the shared requirement anchors SR-01 through SR-08 it
references).

## 1. Objective

Allow customers to reorder the named training sessions inside a routine — "split" and
"routine" are two names for the same entity here (product language says "split"; the
data model and UI say "routine"). Sessions belong directly to a routine; there is no
nested split object inside a routine. The order is the intended workout sequence — a
meaningful product behavior, not a cosmetic sort — so changing it must persist,
survive reload, and respect the app's offline-first, revision-checked storage model.

## 2. Non-goals

- Moving sessions across splits/routines.
- Changing session names, IDs, exercise content, or snapshot/history records.
- Renumbering sessions on delete, or imposing contiguous order values.
- Choosing a drag-and-drop library or adding any dependency (implementation decision,
  requires Lead approval if a new dependency is proposed).

## 3. Requirement anchors

- **SR-01 — Sequence and scope.** Reorder applies within a single routine. Order
  represents intended workout sequence for all surfaces that sort sessions by
  `order`.
- **SR-02 — Pointer interaction.** Reorder via a dedicated drag handle supporting
  mouse and touch. The "row body" is the row area outside the drag handle and
  outside the move-up / move-down controls: tapping the row body still opens the
  session, while activating a move control never opens it. Scrolling outside the
  handle behaves normally. The handle drag must never navigate.
- **SR-03 — Accessible controls.** Each row exposes keyboard-operable move-up /
  move-down controls with accessible names. Focus stays with the moved session and
  the result is announced to assistive technology; position announcements ("moved
  to position 3") are allowed. These are announcements, not generated display labels.
- **SR-04 — Atomic persistence.** A committed reorder is persisted atomically within
  the routine, survives reload, and on failure restores the previous committed order
  and surfaces an error. No automatic retry; a manual retry is allowed, and after a
  revision conflict it requires reloading the latest committed state first —
  retrying never silently overwrites the conflicting committed order.
- **SR-05 — Remove generated numbering.** Remove the generated "Session {index}"
  text from the session list subtitle and the session detail subtitle (approved
  direction: the list subtitle then shows only the exercise count, the detail
  subtitle only the routine name). Internal `order` is retained; it is not
  displayed. User-authored names like "Session 1" must never be rewritten.
- **SR-06 — Data preservation and append.** Names, IDs, exercises, and snapshots are
  unchanged by reorder. Newly added sessions continue to append (current
  `max(order) + 1` behavior).
- **SR-07 — Cancellation, no-op, boundaries.** Dropping at the original position,
  Escape cancellation, and pointer cancel produce no persistence. Empty or one-row
  lists expose no enabled reorder actions; move-up on the first row and move-down on
  the last row are disabled.
- **SR-08 — Compatibility, offline, concurrency.** Reorder mutations work offline
  once the app's assets are loaded; the app is offline-first but ships no service
  worker, so cold offline startup is not promised. Schema v2 and the existing
  numeric `order` field are preserved; existing persisted noncontiguous order
  values remain valid. `storageRevision` conflicts fail closed: roll back only the
  local preview, never overwrite another tab's committed state. While a reorder
  save is pending, further reorder controls are disabled or suppressed until it
  settles — no second reorder is queued or written. Serialization of unrelated
  mutations is unchanged (the existing controller queue governs those).

## 4. UX and state contract

- Each session row gains a drag handle affordance, visually distinct from the row
  body, usable with mouse drag and touch drag. The row body — everything outside
  the handle and outside the move-up / move-down buttons — keeps its open-session
  action; dragging the handle or pressing a move button never triggers navigation.
- During drag, the list renders a local preview of the proposed order. The preview
  is speculative until the drop commits.
- On drop at a new position: commit → persist → confirm. On drop at the original
  position, Escape, or pointer cancellation: discard preview, no mutation.
- Move-up / move-down buttons are the keyboard and assistive-technology path. They
  move one position per activation, are disabled at list boundaries, keep focus on
  the moved session's controls, and announce the result via a polite live region.
- While a reorder save is pending, further reorder controls are disabled or
  suppressed until the save settles; no second reorder is queued or written. The
  implemented affordance is disabled controls plus `aria-busy` on the list —
  it must not block unrelated edits, and the existing controller mutation
  serialization still governs those and is unchanged.
- On save failure or revision conflict: the list reverts to the last committed
  order and an error message is shown. There is no automatic retry. The user may
  retry manually; after a revision conflict this requires reloading the latest
  committed state first — a manual retry must never silently overwrite the
  conflicting committed order.
- Autoscroll during drag near the viewport edge is required behavior for long
  session lists: every destination position, including initially offscreen ones,
  must be reachable by dragging toward the list's edge. Exact threshold and
  velocity values are implementation tuning; no library choice is made here.

## 5. Data contract

- `TrainingSessionV2` keeps `{ id, name, order, exercises }`; `order` stays numeric.
- On a successful reorder, `order` values may be reassigned to reflect the
  permutation. The concrete numbering algorithm is an implementation choice; the
  outcome must satisfy unique, valid order values within the routine. Noncontiguous
  values remain acceptable (today's data may already be noncontiguous).
- Reorder produces a candidate document through the existing port:
  `commit(expectedRevision, candidate)` returning `{ storageRevision }`.
  Reorder rides the same optimistic-concurrency path as all other edits;
  conflicts reject and the controller restores prior state.
- Snapshots/history are untouched — reorder only changes future sequence.

## 6. Code map (implemented state)

- `src/app/SessionList.svelte` — owns the session list: sorted display,
  pointer-drag handle with local preview, autoscroll, cancellation,
  keyboard move controls, focus retention, live-region announcement, and
  pending suppression (local save or `reorderPending` prop).
- `src/app/RoutineDetailScreen.svelte` — renders `SessionList` keyed by
  `routine.id` and forwards the controller's `reorderPending` state.
- `src/app/App.svelte` — subscribes to the controller and passes
  `reorderPending` down to the routine detail screen.
- `src/app/SessionDetailScreen.svelte` — subtitle is now `{routine.name}`
  only (line ~73); generated numbering removed.
- `src/fitness/domain/model.ts` — `TrainingSessionV2` with `order: number`.
- `src/fitness/domain/commands.ts` — `reorderSessions` validates an exact
  permutation and reassigns order values; `addSession` assigns
  `max(order) + 1` (append). Reorder supersedes the append-only restriction
  on `order`; [docs/capabilities.md](capabilities.md) line 20 documents
  "never renumbered on delete" and remains accurate for deletes.
- `src/app/fitness-controller.ts`,
  `src/fitness/persistence/fitness-repository.ts` — serialized
  `commit(expectedRevision, candidate)` pipeline with optimistic-concurrency
  checks; reorder rides the same path and
  `FitnessController.reorderSessions` suppresses concurrent reorders via
  `reorderPending`.
- Deferred design note: an operation-based repository port
  (`apply(expectedRevision, mutation)` over a typed mutation union with a
  shared reducer) was considered and moved to
  [docs/backlog.md](backlog.md); it is not part of this change.

### Existing style reference (pre-change row markup, historical example)

```svelte
{#each [...routine.sessions].sort((a, b) => a.order - b.order) as item (item.id)}
  <li class="grouped-row">
    <button
      class="list-button"
      type="button"
      onclick={() => onOpenSession(item.id)}
      ><span class="row-copy"
        ><strong>{item.name}</strong><small
          >Session {item.order} · {item.exercises.length}
          {item.exercises.length === 1 ? 'exercise' : 'exercises'}</small
        ></span
      ></button
    >
  </li>
{/each}
```

This shows the markup as it existed before this change (the trailing chevron
icon is elided for brevity); the generated `Session {item.order}` subtitle
above is exactly what SR-05 removed. Shipped markup keeps the same
conventions: keyed `#each`, `grouped-row`/`list-button` classes, and typed
`onclick` handlers.

## 7. Testing strategy (mapped to acceptance document)

- Unit (Vitest + fake-indexeddb): reorder permutes `order` correctly;
  noncontiguous orders remain valid; `addSession` still appends; failed
  `expectedRevision` restores prior order.
- Component (Testing Library): handle drag vs. row tap vs. scroll disambiguation;
  move-up/down disabled at boundaries; Escape/no-op produces no mutation;
  generated "Session {index}" labels absent; user-named "Session 1" untouched.
- Accessibility (axe + keyboard tests): controls operable by keyboard, focus
  retention after move, live-region announcement.
- Browser (Playwright): real mouse handle drag and trusted browser-level touch
  input (Chromium CDP `Input.dispatchTouchEvent` or equivalent — not
  DOM-dispatched `TouchEvent`s and not mouse input at a mobile viewport); row-body
  tap navigation; native scroll vs. drag arbitration; long-list edge autoscroll
  reaching offscreen drop targets; keyboard and focus end-to-end; persistence
  across reload; conflict rollback in a second context/tab.
- Traceability: `npm run test:traceability` runs
  `scripts/generate-fit-traceability.mjs`, which scans `src/` and `tests/` for
  references to a fixed inventory of exactly FIT-001…FIT-076. The feature
  occupies FIT-053…FIT-076 (`SRO-N` → `FIT-(52+N)`); the original 52 criteria
  are preserved unchanged. Test code references each new ID by its actual
  behavior — updating `tests/browser/traceability.js` alone is not
  sufficient.

## 8. Relevant commands (from `package.json`; no `dev` script exists)

- `npm run check` — svelte-check type check
- `npm run lint` — ESLint plus no-focused-tests check
- `npm run test:unit` — Vitest with coverage
- `npm run test:browser` — Playwright; the `webServer` block in
  `playwright.config.ts` auto-starts `npm run preview:test`, which serves `dist/`,
  so a production build (`npm run build`) is a prerequisite
- `npm run test:traceability` — traceability enforcement
- `npm run format:check` — Prettier check
- `npm run build` — Vite production build

## 9. Boundaries

- Approved scope only; no scope expansion.
- No dependency selection; no renumber-on-delete change; no cross-split moves.
- [docs/capabilities.md](capabilities.md) was updated alongside this feature:
  it documents reorder within a routine while retaining append-on-create and
  never-renumber-on-delete; no follow-up doc change is outstanding.

## 10. Open questions

- Exact autoscroll threshold/velocity values (implementation tuning; §4 only fixes
  the reachability requirement).
