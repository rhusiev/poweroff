import { useEffect, useState } from 'react';
import { loadTheme, saveTheme, type Theme } from '../lib/storage';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Apply a theme to the page: the `data-theme` attribute and the browser bar color. */
export function applyTheme(theme: Theme) {
  const resolved = theme === 'auto' ? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light') : theme;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  const background = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
    if (theme !== 'auto') return;
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => applyTheme(theme);
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [theme]);
  return [theme, setTheme] as const;
}
