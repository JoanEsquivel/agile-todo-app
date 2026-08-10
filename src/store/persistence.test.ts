import { createDebouncedStorage } from './persistence';

describe('createDebouncedStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('debounces rapid writes into a single localStorage write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const storage = createDebouncedStorage(300);
    storage.setItem('k', 'v1');
    storage.setItem('k', 'v2');
    storage.setItem('k', 'v3');
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('k')).toBe('v3');
  });

  it('getItem returns the pending value before the write lands', () => {
    const storage = createDebouncedStorage(300);
    storage.setItem('k', 'pending');
    expect(storage.getItem('k')).toBe('pending');
  });

  it('flush writes immediately', () => {
    const storage = createDebouncedStorage(300);
    storage.setItem('k', 'v');
    storage.flush();
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('removeItem drops a pending write for that key', () => {
    const storage = createDebouncedStorage(300);
    storage.setItem('k', 'v');
    storage.removeItem('k');
    vi.advanceTimersByTime(300);
    expect(localStorage.getItem('k')).toBe(null);
  });

  it('removeItem removes an already-persisted key', () => {
    localStorage.setItem('k', 'v');
    const storage = createDebouncedStorage(300);
    storage.removeItem('k');
    expect(localStorage.getItem('k')).toBe(null);
  });
});
