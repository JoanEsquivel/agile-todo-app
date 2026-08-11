import { loadThemePreference, applyThemePreference, THEME_STORAGE_KEY } from './theme';
import { useAppStore } from './store';

afterEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  delete document.documentElement.dataset.theme;
});

describe('theme preference storage', () => {
  it('defaults to system when nothing is stored', () => {
    expect(loadThemePreference()).toBe('system');
  });

  it('loads a stored explicit preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(loadThemePreference()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(loadThemePreference()).toBe('light');
  });

  it('treats an unrecognised stored value as system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'solarized');
    expect(loadThemePreference()).toBe('system');
  });

  it('applies an explicit preference to the document and storage', () => {
    applyThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('system clears both the attribute and the stored key', () => {
    applyThemePreference('light');
    applyThemePreference('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});

describe('setTheme action', () => {
  it('updates state, the document attribute, and the stored key together', () => {
    useAppStore.getState().setTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    useAppStore.getState().setTheme('system');
    expect(useAppStore.getState().theme).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('announces the change for screen readers', () => {
    useAppStore.getState().setTheme('dark');
    expect(useAppStore.getState().announcement).toMatch(/dark/i);
  });
});
