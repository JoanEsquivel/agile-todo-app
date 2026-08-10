import type { StateStorage } from 'zustand/middleware';

export function createDebouncedStorage(delayMs = 300): StateStorage & { flush: () => void } {
  let pending: { key: string; value: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) { localStorage.setItem(pending.key, pending.value); pending = null; }
  };

  return {
    getItem: (key) => (pending?.key === key ? pending.value : localStorage.getItem(key)),
    setItem: (key, value) => {
      pending = { key, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, delayMs);
    },
    removeItem: (key) => {
      if (pending?.key === key) pending = null;
      localStorage.removeItem(key);
    },
    flush: write,
  };
}
