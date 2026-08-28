/**
 * Monotonic wall clock for the search budgets (FR-009).
 *
 * `performance.now()` exists in browsers, in Web Workers and in Node 16+, so
 * one implementation covers the UI thread, the AI worker and the test runner.
 */
export const now: () => number = () => performance.now();
