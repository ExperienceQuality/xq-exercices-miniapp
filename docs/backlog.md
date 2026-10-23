# Backlog

Future work that is deliberately out of scope for current delivery.

## Deferred: operation-based persistence port

**Status:** deferred — not implemented; described here so the design is not
lost.

Replace `FitnessRepository.commit(expectedRevision, candidate)` with an
operation-based `FitnessRepository.apply(expectedRevision, mutation)` over a
typed `FitnessMutation` union (`create-routine`, `add-session`,
`reorder-sessions`, `replace-document`, …) applied through a shared reducer.
Rationale: a remote REST adapter could map each mutation kind to resource
endpoints, and the IndexedDB adapter would replay mutations instead of storing
whole candidate documents.

Preserved requirements when this ships: the offline-first, revision-checked
commit path keeps optimistic concurrency (`storageRevision`), atomicity
(primary/recovery write ordering), fail-closed conflict handling, and the
existing import/replace-document flow. Local exploration exists as unshipped
work-in-progress on the development machine; this entry records the intent,
not an implementation commitment.
