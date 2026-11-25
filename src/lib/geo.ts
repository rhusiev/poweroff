import { apiClient } from '../api/client';
import type { Street } from '../api/types';
import { matchesDirectoryName } from './directory';
import { withTimeout } from './net';

export interface GeocodeHit {
  lat: number;
  lon: number;
  label: string;
  road?: string;
  city?: string;
  building?: string;
  state?: string;
}

/** Street names in the official directory carry prefixes and odd spellings. */
export function normalizeStreetName(value: string): string {
  // \b is ASCII-only in JS, so strip prefixes with explicit space boundaries.
  return ` ${value.toLowerCase().replace(/[.,'’\-–]/g, ' ')} `
    .replace(/\s(вул|вулиця|просп|проспект|пл|площа|бул|бульвар|шосе|ш|пер|провулок|ал|алея)\s/g, ' ')
    .replace(/\s[а-яіїєa-z]\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return prev[b.length];
}

/** Match a geocoder road name to the peculiar names in the official directory. */
export function rankStreets(query: string, candidates: Street[]) {
  const wanted = normalizeStreetName(query);
  if (!wanted) return [];

  return candidates
    .map(street => {
      const name = normalizeStreetName(street.name);
      if (!name) return null;
      const aWords = wanted.split(' ');
      const bWords = name.split(' ');
      const exact = aWords.filter(word => bWords.includes(word)).length;
      const prefix = aWords.filter(word => bWords.some(other => other.startsWith(word) || word.startsWith(other))).length;
      const close = aWords.filter(word => bWords.some(other =>
        (word.length >= 4 || other.length >= 4) && editDistance(word, other) <= 1,
      )).length;
      const matched = Math.max(exact, prefix, close);
      const score = (matched / aWords.length) * 0.7 + (matched / bWords.length) * 0.3;
      return { street, score, exact: name === wanted };
    })
    .filter((row): row is { street: Street; score: number; exact: boolean } => row !== null)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
}

export function matchStreet(query: string, candidates: Street[]): Street | null {
  const ranked = rankStreets(query, candidates);
  const best = ranked[0];
  if (best?.exact) return best.street;
  return ranked.length && best.score >= 0.8 ? best.street : null;
}

// Lviv Oblast bounding box: lon 23.4-25.9, lat 48.9-50.1.
const LVIV_OBLAST_VIEWBOX = '23.4,50.1,25.9,48.9';

/** Keep one row per road + city + building; Nominatim repeats some streets. */
export function uniqueGeocodeHits(hits: GeocodeHit[]): GeocodeHit[] {
  const seen = new Set<string>();
  return hits.filter(hit => {
    const key = `${hit.road ?? ''}\u0000${hit.city ?? ''}\u0000${hit.building ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
/** Nominatim's usage policy allows one request per second; keep a margin. */
const NOMINATIM_SPACING_MS = 1100;
const NOMINATIM_CACHE_SIZE = 200;

let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;
const nominatimCache = new Map<string, Promise<unknown>>();

const abortError = () => new DOMException('Aborted', 'AbortError');

function waitFor(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

async function requestNominatim(url: string, signal?: AbortSignal): Promise<unknown> {
  await waitFor(Math.max(0, lastNominatimAt + NOMINATIM_SPACING_MS - Date.now()), signal);
  lastNominatimAt = Date.now();
  const response = await fetch(url, { signal: withTimeout(signal), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Nominatim responded ${response.status}`);
  return response.json();
}

/**
 * Every Nominatim request in the app goes through here: one at a time, at
 * most one per second, and each distinct URL fetched once per session. A
 * request that fails or is aborted is forgotten, so it can be tried again.
 */
export function nominatim(path: 'search' | 'reverse', params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const url = `${NOMINATIM_URL}/${path}?${params}`;
  const known = nominatimCache.get(url);
  if (known) return known;
  const run = nominatimQueue.then(() => requestNominatim(url, signal));
  nominatimQueue = run.catch(() => undefined);
  if (nominatimCache.size >= NOMINATIM_CACHE_SIZE) nominatimCache.delete(nominatimCache.keys().next().value!);
  nominatimCache.set(url, run);
  run.catch(() => nominatimCache.delete(url));
  return run;
}

interface NominatimRow {
  lat: string;
  lon: string;
  display_name?: string;
  address?: Record<string, string>;
}

const roadOf = (address: Record<string, string>) =>
  address.road || address.pedestrian || address.footway || address.residential || address.square || address.place;
const cityOf = (address: Record<string, string>) => address.city || address.town || address.village || address.county;

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    'accept-language': 'uk',
    viewbox: LVIV_OBLAST_VIEWBOX,
    bounded: '1',
    countrycodes: 'ua',
    q: query,
  });
  const rows = await nominatim('search', params, signal) as NominatimRow[];
  const hits: GeocodeHit[] = rows.map(row => {
    const address = row.address ?? {};
    return {
      lat: Number(row.lat),
      lon: Number(row.lon),
      label: row.display_name ?? '',
      road: roadOf(address),
      city: cityOf(address),
      building: address.house_number,
      state: address.state || address.region,
    };
  });

  // The bounding box is coarse; keep only addresses in Lviv Oblast.
  return uniqueGeocodeHits(hits.filter(hit => hit.state === 'Львівська область'));
}

/**
 * Geocode a query, falling back to the official street directory on zero hits.
 * A truncated stem such as «симоненк» is absent from Nominatim, so resolve it
 * to a full official street name first, then geocode that name for real
 * coordinates. The fallback only runs when the direct search found nothing.
 */
export async function geocodeWithDirectoryFallback(query: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const direct = await geocode(query, signal);
  if (direct.length) return direct;
  if (signal?.aborted) return [];

  const official = await apiClient.findStreetsByName(query);
  if (signal?.aborted) return [];
  const candidates = official.filter(street => matchesDirectoryName(street.name, query));
  const best = rankStreets(query, candidates)[0]?.street;
  return best ? geocode(best.name, signal) : [];
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lon), 'accept-language': 'uk' });
  const row = await nominatim('reverse', params, signal) as Partial<NominatimRow>;
  const address = row.address ?? {};
  return {
    lat,
    lon,
    label: row.display_name ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    road: roadOf(address),
    city: cityOf(address),
    building: address.house_number,
  };
}

export interface OfficialAddress {
  otgId: number;
  otgName: string;
  cityId: number;
  cityName: string;
  streetId: number;
  streetName: string;
}

async function officialCity(name: string) {
  const cities = await apiClient.findCities(name);
  const wanted = normalizeStreetName(name);
  return cities.find(item => normalizeStreetName(item.name) === wanted)
    ?? cities.find(item => {
      const official = normalizeStreetName(item.name);
      return official.includes(wanted) || wanted.includes(official);
    })
    ?? cities[0];
}

async function rankedOfficialStreets(cityId: number, road: string) {
  const byName = await apiClient.findStreets(cityId, road);
  const pool = byName.length ? byName : await apiClient.getStreets(cityId);
  return rankStreets(road, pool).slice(0, 6).map(row => row.street);
}

/** Resolve a geocoder hit to ids in the official address directory. */
export async function resolveOfficial(hit: GeocodeHit, streetId?: number): Promise<OfficialAddress | null> {
  if (!hit.city || !hit.road) return null;
  const city = await officialCity(hit.city);
  if (!city) return null;
  const otgId = Number(city.otg?.['@id']?.split('/').pop());
  if (!Number.isFinite(otgId) || otgId <= 0) return null;

  const streets = await rankedOfficialStreets(city.id, hit.road);
  const chosen = streetId ? streets.find(street => street.id === streetId) : streets[0];
  if (!chosen) return null;

  return {
    otgId,
    otgName: city.otg?.name ?? '',
    cityId: city.id,
    cityName: city.name,
    streetId: chosen.id,
    streetName: chosen.name,
  };
}

/** Candidate official streets for a geocoder hit, best first. */
export async function officialStreetOptions(hit: GeocodeHit) {
  if (!hit.city || !hit.road) return [];
  const city = await officialCity(hit.city);
  return city ? rankedOfficialStreets(city.id, hit.road) : [];
}
