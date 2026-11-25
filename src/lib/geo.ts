import { apiClient } from '../api/client';
import type { City, Street } from '../api/types';
import { matchesDirectoryName } from './directory';

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
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) return [];
  const rows = await response.json() as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: Record<string, string>;
  }>;
  const hits: GeocodeHit[] = rows.map(row => {
    const address = row.address ?? {};
    return {
      lat: Number(row.lat),
      lon: Number(row.lon),
      label: row.display_name,
      road: address.road || address.pedestrian || address.footway || address.residential || address.square || address.place,
      city: address.city || address.town || address.village || address.county,
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
  if (!best) return [];
  if (signal?.aborted) return [];

  return geocode(best.name, signal);
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<GeocodeHit | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=uk`;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  const row = await response.json() as { display_name?: string; address?: Record<string, string>; lat: string; lon: string };
  const address = row.address ?? {};
  return {
    lat,
    lon,
    label: row.display_name ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    road: address.road || address.pedestrian || address.footway || address.residential || address.square || address.place,
    city: address.city || address.town || address.village || address.county,
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

/** Resolve a geocoder hit to ids in the official address directory. */
export async function resolveOfficial(hit: GeocodeHit, streetId?: number): Promise<OfficialAddress | null> {
  if (!hit.city || !hit.road) return null;
  const cities = await apiClient.findCities(hit.city);
  const wantedCity = normalizeStreetName(hit.city);
  const city = cities.find(item => normalizeStreetName(item.name) === wantedCity)
    ?? cities.find(item => {
      const name = normalizeStreetName(item.name);
      return name.includes(wantedCity) || wantedCity.includes(name);
    })
    ?? cities[0];
  if (!city) return null;

  const otgId = Number(city.otg?.['@id']?.split('/').pop());
  if (!Number.isFinite(otgId) || otgId <= 0) return null;

  const byName = await apiClient.findStreets(city.id, hit.road);
  const pool = byName.length ? byName : await apiClient.getStreets(city.id);
  const ranked = rankStreets(hit.road, pool).slice(0, 6);
  const chosen = streetId ? ranked.find(row => row.street.id === streetId)?.street : ranked[0]?.street;
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

export async function officialStreetOptions(hit: GeocodeHit) {
  if (!hit.city || !hit.road) return [];
  const cities = await apiClient.findCities(hit.city);
  const wantedCity = normalizeStreetName(hit.city);
  const city = cities.find(item => normalizeStreetName(item.name) === wantedCity) ?? cities[0];
  if (!city) return [];
  const byName = await apiClient.findStreets(city.id, hit.road);
  const pool = byName.length ? byName : await apiClient.getStreets(city.id);
  return rankStreets(hit.road, pool).slice(0, 6).map(row => row.street);
}

export function cityFromApi(city: City & { otg?: { '@id': string; name: string } }) {
  return {
    id: city.id,
    name: city.name,
    otgId: Number(city.otg?.['@id']?.split('/').pop()),
    otgName: city.otg?.name ?? '',
  };
}
