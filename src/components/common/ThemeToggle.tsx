import { useAppStore } from '../../store/store';
import type { ThemePreference } from '../../store/theme';
import styles from './ThemeToggle.module.css';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

function Icon({ theme }: { theme: ThemePreference }) {
  // system: a half-filled circle; light: sun; dark: moon.
  if (theme === 'light') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="3.2" fill="currentColor" />
        <path
          d="M8 0v2.2M8 13.8V16M0 8h2.2M13.8 8H16M2.3 2.3l1.6 1.6M12.1 12.1l1.6 1.6M13.7 2.3l-1.6 1.6M3.9 12.1l-1.6 1.6"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    );
  }
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M13.5 9.8A6 6 0 0 1 6.2 2.5a6 6 0 1 0 7.3 7.3z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5v11a5.5 5.5 0 0 1 0-11z" fill="currentColor" />
    </svg>
  );
}

/** Cycles system → light → dark. The accessible name announces the current
 *  preference; the durable copy lives in theme.ts's own localStorage key. */
export function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme} — click for ${NEXT[theme]}`}
      onClick={() => setTheme(NEXT[theme])}
    >
      <Icon theme={theme} />
    </button>
  );
}
