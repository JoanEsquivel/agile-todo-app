import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// NOTE: deliberately NOT a static top-level `import { appStorage } from '../store/store'`.
// setupFiles execute before a test file's own (hoisted) `vi.mock('./clock', ...)` runs, so a
// static import here would link store.ts (and transitively clock.ts) to the REAL clock module
// before any per-test mock is registered — breaking clock mocking for every store test that
// relies on it (verified: store.test.ts / dayTick.test.ts got real dates instead of mocked
// ones). The dynamic import below resolves lazily inside afterEach, after the test file's own
// module graph (and its vi.mock, if any) has already been evaluated, so it reuses that same
// cached module instance instead of forcing an early, unmocked one.
afterEach(async () => {
  const { appStorage } = await import('../store/store');
  appStorage.flush(); // writes any pending value and clears the debounce timer
  localStorage.clear();
});
