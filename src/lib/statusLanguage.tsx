import type { ReactNode } from 'react';
import type { Status } from './status';

export type StatusKey = 'on' | 'planned' | 'emergency' | 'possible' | 'unknown';

export const FROM_STATUS: Record<Status, StatusKey> = {
  green: 'on',
  red: 'planned',
  purple: 'emergency',
  yellow: 'possible',
  gray: 'unknown',
};

export const STATUS: Record<StatusKey, { word: string; icon: ReactNode }> = {
  on: {
    word: 'Є світло',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>,
  },
  planned: {
    word: 'Планове',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
  },
  emergency: {
    word: 'Аварійне',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3L2 20h20z" /><path d="M12 10v5M12 18v.01" /></svg>,
  },
  possible: {
    word: 'Можливе',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" strokeDasharray="3 3" /><path d="M9 9a3 3 0 1 1 4.6 2.5c-.8.7-1.6 1-1.6 2.5M12 17v.01" /></svg>,
  },
  unknown: {
    word: 'Немає даних',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3"><circle cx="12" cy="12" r="9" /></svg>,
  },
};

export const NAV = [
  { id: 'dashboard', label: 'Головна', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg> },
  { id: 'groups', label: 'Черги', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="8" height="8" rx="2" /><rect x="13" y="4" width="8" height="8" rx="2" /><rect x="3" y="14" width="8" height="6" rx="2" /><rect x="13" y="14" width="8" height="6" rx="2" /></svg> },
  { id: 'compare', label: 'Порівняння', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5v14M12 5v14M20 5v14" /></svg> },
  { id: 'map', label: 'Мапа', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /><circle cx="12" cy="11" r="2" /></svg> },
  { id: 'settings', label: 'Налаштування', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="var(--bg)" /><circle cx="15" cy="12" r="2" fill="var(--bg)" /><circle cx="8" cy="18" r="2" fill="var(--bg)" /></svg> },
] as const;

export type NavId = typeof NAV[number]['id'];
