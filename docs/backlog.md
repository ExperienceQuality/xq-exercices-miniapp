# Backlog

Future work that is deliberately out of scope for current delivery.

## Implemented locally: operation-based persistence port

**Status:** implemented locally, unreleased — see
`docs/repository-port.md` for the shipped contract.

`FitnessRepository.commit(expectedRevision, candidate)` was replaced with an
operation-based `FitnessRepository.apply(expectedRevision, mutation)` over a
typed `FitnessMutation` union (`create-routine`, `add-session`,
`rename-session`, `delete-session`, `reorder-sessions`, `add-exercise`,
`update-exercise`, `delete-exercise`, `reorder-exercises`, `capture-snapshot`,
`replace-document`) applied through the shared `applyMutation` reducer.
Storage remains entirely local (IndexedDB); the operation vocabulary keeps a
future remote REST adapter honest — each mutation kind maps onto a resource
endpoint — but no backend work is part of this change.

Preserved behavior: offline-first revision-checked writes keep optimistic
concurrency (`storageRevision`), atomicity (primary/recovery write ordering
inside one transaction), fail-closed conflict and validation handling, and
the import flow (wrapped as `replace-document`).

Remaining follow-up if a backend ever ships: REST adapter implementation,
auth/user scoping injection, and HTTP-status → `FitnessError` mapping, as
listed under "Requirements a remote backend would have to meet" in
`docs/repository-port.md`.
