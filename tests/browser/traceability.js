// The accepted matrix deliberately assigns this non-user-triggerable concurrency
// edge to Developer white-box automation. Keeping the mapping here lets the FIT
// report remain complete before the integration branch contributes that test.
export const developerOwnedAutomation = Object.freeze({
  'FIT-029': Object.freeze({
    scenario: 'EXERCISE-10 stale-parent failures',
    command: 'npm run test:unit',
    owner: 'fitness-domain-storage and fitness-ui',
  }),
  // SRO-02 (cross-routine / foreign session-ID rejection) has no reachable UI
  // path — reorder controls only ever render inside one routine's list — so
  // the lowest sufficient proof is domain-level permutation validation.
  'FIT-054': Object.freeze({
    scenario: 'SRO-02 foreign routine session transfer refused',
    command: 'npm run test:unit',
    owner: 'fitness-domain',
  }),
  // RUI-AC-25: array-level permutation replacement is pure domain logic;
  // the browser lane proves the same commit through real input.
  'FIT-101': Object.freeze({
    scenario: 'RUI-AC-25 exercise permutation replaces canonical array only',
    command: 'npm run test:unit',
    owner: 'fitness-domain',
  }),
  // RUI-AC-26: malformed permutations and missing parents are negative
  // paths with no UI trigger — grips only emit member IDs.
  'FIT-102': Object.freeze({
    scenario:
      'RUI-AC-26 malformed exercise permutation and missing parents rejected',
    command: 'npm run test:unit',
    owner: 'fitness-domain',
  }),
  // RUI-AC-27: same-order object reference identity is domain-level;
  // browser covers the observable no-write behavior.
  'FIT-103': Object.freeze({
    scenario: 'RUI-AC-27 no-op reorder identity plus add/edit/delete semantics',
    command: 'npm run test:unit',
    owner: 'fitness-domain',
  }),
  // RUI-AC-34: pre-queue array copy, explicit parent capture, and stale
  // permutations queued behind add/edit are serialized-queue internals —
  // deterministic only in controller unit tests.
  'FIT-110': Object.freeze({
    scenario:
      'RUI-AC-34 queued caller-array copy and stale-permutation rejection',
    command: 'npm run test:unit',
    owner: 'fitness-controller',
  }),
  // RUI-AC-35: snapshot immutability and aggregate folded-key/maxima/casing
  // semantics are domain invariants with no dedicated UI surface.
  'FIT-111': Object.freeze({
    scenario:
      'RUI-AC-35 snapshot preservation and aggregate semantics unchanged',
    command: 'npm run test:unit',
    owner: 'fitness-domain',
  }),
});
