export type ThemePref = 'auto' | 'light' | 'dark';

declare global {
  interface Window {
    gbTheme?: { get: () => ThemePref; set: (p: ThemePref) => void };
  }
}

export function getThemePref(): ThemePref {
  return window.gbTheme?.get() ?? 'auto';
}

export function setThemePref(p: ThemePref) {
  window.gbTheme?.set(p);
}
