import type { OTG, City, Street, Accident, PwAccount, GpvSchedule, SyncStatus } from './types';

const BASE_URL = '/api-proxy';

type QueryValue = string | number | boolean;

async function fetchFromAPI<T>(
  endpoint: string,
  params: Record<string, QueryValue | QueryValue[]> = {},
  signal?: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams();
  Object.keys(params).forEach(key => {
    const value = params[key];
    if (Array.isArray(value)) value.forEach(item => query.append(key, String(item)));
    else query.append(key, String(value));
  });
  
  const queryString = query.toString();
  const url = `${BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/ld+json, application/json' },
    signal,
  });
  if (!response.ok) {
    console.error(`[API] ${endpoint} responded ${response.status}`);
    throw new Error(`API error ${response.status} on ${endpoint}`);
  }
  return await response.json() as T;
}

function buildingNameVariants(buildingName: string): string[] {
  const base = buildingName.trim().toUpperCase().replace(/\s+/g, '');
  if (!base) return [];

  const variants = new Set([
    base,
    base.replace(/^(\d+)([А-ЯІЇЄA-Z])$/, '$1-$2'),
    base.replace(/^(\d+)-([А-ЯІЇЄA-Z])$/, '$1$2'),
  ]);

  return [...variants];
}

/**
 * A building's hourly-schedule group: "1.1"-"6.2", null for the official
 * «Не входить», undefined when the operator gave no usable value.
 */
export type BuildingGroup = string | null | undefined;

const NO_GROUP = 'Не входить';

export function normalizeGroup(value: string | null | undefined): BuildingGroup {
  const raw = (value ?? '').trim();
  if (raw === NO_GROUP) return null;
  if (/^\d{2}$/.test(raw)) return `${raw[0]}.${raw[1]}`;
  return /^\d\.\d$/.test(raw) ? raw : undefined;
}

/** The most common group across the building's accounts; a tie or no data is unknown. */
export function pickBuildingGroup(accounts: Pick<PwAccount, 'chergGpv'>[]): BuildingGroup {
  const counts = new Map<string | null, number>();
  accounts.forEach(account => {
    const group = normalizeGroup(account.chergGpv);
    if (group !== undefined) counts.set(group, (counts.get(group) ?? 0) + 1);
  });
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[1]?.[1] === ranked[0][1]) return undefined;
  return ranked[0][0];
}

function getMembers<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'hydra:member' in data) {
    return (data as { 'hydra:member': T[] })['hydra:member'];
  }
  throw new Error('API response has no member list');
}

export const apiClient = {
  getOTGs: async (signal?: AbortSignal) => {
    const data = await fetchFromAPI<unknown>('/pw_otgs', { pagination: false }, signal);
    return getMembers<OTG>(data);
  },

  getCities: async (otgId: number, signal?: AbortSignal) => {
    const data = await fetchFromAPI<unknown>('/pw_cities', {
      pagination: false,
      'otg.id': otgId,
    }, signal);
    return getMembers<City>(data);
  },

  getStreets: async (cityId: number, signal?: AbortSignal) => {
    const data = await fetchFromAPI<unknown>('/pw_streets', {
      pagination: false,
      'city.id': cityId,
    }, signal);
    return getMembers<Street>(data);
  },

  findCities: async (name: string) => {
    const data = await fetchFromAPI<unknown>('/pw_cities', { pagination: false, name });
    return getMembers<City & { otg: { '@id': string; name: string } }>(data);
  },

  findStreets: async (cityId: number, name: string) => {
    const data = await fetchFromAPI<unknown>('/pw_streets', {
      pagination: false,
      'city.id': cityId,
      name,
    });
    return getMembers<Street>(data);
  },

  /** Search the whole street directory by name, without a city filter. */
  findStreetsByName: async (name: string) => {
    const data = await fetchFromAPI<unknown>('/pw_streets', { pagination: false, name });
    return getMembers<Street>(data);
  },

  getAccidents: async (cityId: number, streetId: number) => {
    const data = await fetchFromAPI<unknown>('/pw_accidents', {
      pagination: false,
      'city.id': cityId,
      'street.id': streetId,
    });
    return getMembers<Accident>(data);
  },

  getPlannedAccidents: async (cityId: number, streetId: number) => {
    const data = await fetchFromAPI<unknown>('/pw_accident_planeds', {
      pagination: false,
      'city.id': cityId,
      'street.id': streetId,
    });
    return getMembers<Accident>(data);
  },

  getBuildingGroup: async (cityId: number, streetId: number, buildingName: string): Promise<BuildingGroup> => {
    const names = buildingNameVariants(buildingName);
    if (!names.length) return undefined;
    const data = await fetchFromAPI<unknown>('/pw_accounts', {
      pagination: false,
      'city.id': cityId,
      'street.id': streetId,
      'buildingName': names,
    });
    return pickBuildingGroup(getMembers<PwAccount>(data));
  },

  getGpvSchedule: async (): Promise<GpvSchedule> => {
    const response = await fetch('/gpv');
    if (!response.ok) throw new Error(`GPV schedule: ${response.status}`);
    return await response.json() as GpvSchedule;
  },

  getLastSync: async () => {
    const data = await fetchFromAPI<unknown>('/options', {
      option_key: 'successful_last_synk',
    });
    const members = getMembers<SyncStatus>(data);
    return members[0]?.date || members[0]?.option_value || null;
  },
};
