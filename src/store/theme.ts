/*
 * The manual theme preference lives in its own localStorage key, deliberately
 * OUTSIDE the zustand persisted blob: the FOUC-preventing inline script in
 * index.html has to read it before React (or the store) exists, and a
 * per-device display preference doesn't belong in export/import backups or
 * behind a schema version. 'system' is represented by absence — no key, no
 * data-theme attribute — so the color-scheme declaration in tokens.css
 * follows the OS.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'agile-todo-app.theme';

export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(theme: ThemePreference): void {
  try {
    if (theme === 'system') {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Storage can be unavailable (private mode quotas); the in-memory state
    // and attribute still applied where possible, so the toggle degrades to
    // session-only rather than throwing.
  }
}
