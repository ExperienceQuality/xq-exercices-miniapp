// The accepted matrix deliberately assigns this non-user-triggerable concurrency
// edge to Developer white-box automation. Keeping the mapping here lets the FIT
// report remain complete before the integration branch contributes that test.
export const developerOwnedAutomation = Object.freeze({
  'FIT-029': Object.freeze({
    scenario: 'EXERCISE-10 stale-parent failures',
    command: 'npm run test:unit',
    owner: 'fitness-domain-storage and fitness-ui',
  }),
});
