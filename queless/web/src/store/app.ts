import { create } from 'zustand';
import { getCookie, setCookie } from '../lib/cookies';
import type { LocationState, Theme } from '../types';

function readLoc(): LocationState | null {
  try {
    const raw = getCookie('ql_loc');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Small global UI state: location (ql_loc cookie, 30 days) and theme (ql_theme). */
export const useApp = create<{
  location: LocationState | null;
  theme: Theme;
  setLocation: (location: LocationState | null) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}>((set, get) => ({
  location: readLoc(),
  theme: (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'light',
  setLocation: (location: LocationState | null) => {
    if (location) setCookie('ql_loc', JSON.stringify(location), 30);
    else setCookie('ql_loc', '', -1);
    set({ location });
  },
  setTheme: (theme: Theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    setCookie('ql_theme', theme, 365);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));

/** Counter chosen on the console, remembered per business on this device. */
export const counterPref = {
  get: (businessId: string): string | null => {
    try {
      return localStorage.getItem(`ql_counter_${businessId}`);
    } catch {
      return null;
    }
  },
  set: (businessId: string, counterId: string): void => {
    try {
      localStorage.setItem(`ql_counter_${businessId}`, counterId);
    } catch {
      /* ignore */
    }
  },
};
