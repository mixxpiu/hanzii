export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'hanviet_hsk1_323_theme_v1';

export function resolveInitialTheme(
  storedValue: string | null | undefined,
  prefersDark: boolean
): ThemeMode {
  if (storedValue === 'dark') return 'dark';
  if (storedValue === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return resolveInitialTheme(stored, prefersDark);
}

export function writeStoredTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function applyDocumentTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.style.colorScheme = theme;
}
