import { useEffect } from 'react';
import { useAppStore } from '../store/store';

export function useDayChangeWatcher(): void {
  useEffect(() => {
    const tick = () => useAppStore.getState().checkDayTick();
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);
}
