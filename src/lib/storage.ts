import type { SavedAddress } from '../api/types';

/**
 * Local persistence. Every key is read and written through these helpers, so a
 * blocked or full storage never throws into the UI.
 *
 * Releases before the 2026-11 redesign stored places under `saved_addresses`
 * and the theme under `theme`. Those keys are read when the new ones are absent
 * and left in place, so going back to an older build keeps working.
 */
const KEYS = {
  places: 'po:places',
  theme: 'po:theme',
  compare: 'po:compare',
  lastSync: 'po:lastSync',
  placeData: 'po:placeData',
  schedule: 'po:schedule',
} as const;
const LEGACY_PLACES = 'saved_addresses';
const LEGACY_THEME = 'theme';
/** Unreadable places values are kept here, as a JSON list, before they can be overwritten. */
const UNREADABLE_PLACES = 'po:places-unreadable';

export type Theme = 'light' | 'dark' | 'auto';
const THEMES: readonly Theme[] = ['light', 'dark', 'auto'];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked or full; the in-memory state still works.
  }
}

export const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `addr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** A name stored either as a plain string or as an object with a `name`. */
const nameOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') {
    return (value as { name: string }).name;
  }
  return '';
};

const text = (...values: unknown[]) => {
  const found = values.find(value => (typeof value === 'string' && value) || typeof value === 'number');
  return found === undefined ? '' : String(found);
};

const coordinate = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Backfill one stored record. Missing fields get neutral values instead of dropping the place. */
function placeFrom(item: Record<string, unknown>): SavedAddress {
  return {
    id: text(item.id) || newId(),
    customName: text(item.customName, item.name) || 'Адреса',
    favorite: Boolean(item.favorite),
    otgId: Number(item.otgId) || 0,
    otgName: nameOf(item.otgName) || nameOf(item.otg),
    cityId: Number(item.cityId) || 0,
    cityName: nameOf(item.cityName) || nameOf(item.city),
    streetId: Number(item.streetId) || 0,
    streetName: nameOf(item.streetName) || nameOf(item.street),
    buildingNumber: text(item.buildingNumber, item.number),
    lat: coordinate(item.lat),
    lon: coordinate(item.lon),
  };
}

/** Parse a stored places value; null when it is not a readable list. */
export function parsePlaces(raw: string): SavedAddress[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(placeFrom);
  } catch {
    return null;
  }
}

export const PLACES_KEY = KEYS.places;

/** Add an unreadable places value to the kept list, once. */
function keepUnreadable(raw: string) {
  let kept: unknown;
  try {
    kept = JSON.parse(read(UNREADABLE_PLACES) ?? '[]');
  } catch {
    kept = [];
  }
  const list = Array.isArray(kept) ? kept : [kept];
  if (!list.includes(raw)) write(UNREADABLE_PLACES, JSON.stringify([...list, raw]));
}

export function loadPlaces(): SavedAddress[] {
  // An unreadable current value falls back to the legacy key before giving up.
  for (const key of [KEYS.places, LEGACY_PLACES]) {
    const raw = read(key);
    if (raw === null) continue;
    const places = parsePlaces(raw);
    if (places) return places;
    keepUnreadable(raw);
  }
  return [];
}

export const savePlaces = (places: SavedAddress[]) => write(KEYS.places, JSON.stringify(places));

export function loadTheme(): Theme {
  const saved = read(KEYS.theme) ?? read(LEGACY_THEME);
  return THEMES.find(theme => theme === saved) ?? 'auto';
}

export const saveTheme = (theme: Theme) => write(KEYS.theme, theme);

/** The stored compare selection, or null when the user never chose one. */
export function loadCompare(): string[] | null {
  const raw = read(KEYS.compare);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

export const saveCompare = (ids: string[]) => write(KEYS.compare, JSON.stringify(ids));

/** The operator's last sync time seen online; earlier builds stored it JSON-quoted. */
export function loadLastSync(): string | null {
  const raw = read(KEYS.lastSync);
  if (!raw?.startsWith('"')) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export const saveLastSync = (value: string) => write(KEYS.lastSync, value);

function readObject<T>(key: string): T | null {
  const raw = read(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
  }
}

/** The last good operator answers, so the offline screen has something true to show. */
export const loadPlaceData = <T,>(): Record<string, T> => readObject<Record<string, T>>(KEYS.placeData) ?? {};
export const savePlaceData = <T,>(data: Record<string, T>) => write(KEYS.placeData, JSON.stringify(data));
export const loadSchedule = <T,>(): T | null => readObject<T>(KEYS.schedule);
export const saveSchedule = <T,>(schedule: T) => write(KEYS.schedule, JSON.stringify(schedule));
