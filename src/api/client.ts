import type { OTG, City, Street, Accident, PwAccount, GpvSchedule, SyncStatus } from './types';

const BASE_URL = '/api-proxy';

type QueryValue = string | number | boolean;

async function fetchFromAPI<T>(endpoint: string, params: Record<string, QueryValue | QueryValue[]> = {}): Promise<T> {
  const query = new URLSearchParams();
  Object.keys(params).forEach(key => {
    const value = params[key];
    if (Array.isArray(value)) value.forEach(item => query.append(key, String(item)));
    else query.append(key, String(value));
  });
  
  const queryString = query.toString();
  const url = `${BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;

  console.log(`[API Request] Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/ld+json, application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[API Error] ${response.status} ${response.statusText}`, text);
    throw new Error(`API error: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`[API Success] Received from ${url}:`, data);
  return data;
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

function normalizeGroup(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw || raw === 'Не входить' || raw === '0') return null;
  if (/^\d{2}$/.test(raw)) return `${raw[0]}.${raw[1]}`;
  return /^\d\.\d$/.test(raw) ? raw : null;
}

function getMembers<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'hydra:member' in data) {
    return (data as { 'hydra:member': T[] })['hydra:member'];
  }
  console.warn('[API Client] Response does not have hydra:member envelope:', data);
  return [];
}

export const apiClient = {
  getOTGs: async () => {
    const data = await fetchFromAPI<unknown>('/pw_otgs', { pagination: false });
    return getMembers<OTG>(data);
  },

  getCities: async (otgId: number) => {
    const data = await fetchFromAPI<unknown>('/pw_cities', {
      pagination: false,
      'otg.id': otgId,
    });
    return getMembers<City>(data);
  },

  getStreets: async (cityId: number) => {
    const data = await fetchFromAPI<unknown>('/pw_streets', {
      pagination: false,
      'city.id': cityId,
    });
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

  getBuildingGroup: async (cityId: number, streetId: number, buildingName: string) => {
    const names = buildingNameVariants(buildingName);
    if (!names.length) return null;

    const data = await fetchFromAPI<unknown>('/pw_accounts', {
      pagination: false,
      'city.id': cityId,
      'street.id': streetId,
      'buildingName': names,
    });

    const counts = new Map<string, number>();
    getMembers<PwAccount>(data).forEach(account => {
      const group = normalizeGroup(account.chergGpv);
      if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
    });

    let best: string | null = null;
    let bestCount = 0;
    for (const [group, count] of counts) {
      if (count > bestCount) {
        best = group;
        bestCount = count;
      }
    }

    return best;
  },

  getGpvSchedule: async (): Promise<GpvSchedule | null> => {
    try {
      const response = await fetch('/gpv');
      if (!response.ok) return null;
      return await response.json() as GpvSchedule;
    } catch (error) {
      console.warn('[API Client] Failed to get GPV schedule', error);
      return null;
    }
  },

  checkLight: async (accountNumber: string) => {
    return await fetchFromAPI<{ light: boolean, res: boolean, date_plan_in?: string, comment?: string }>('/check-light', {
      number: accountNumber,
    });
  },

  getLastSync: async () => {
    try {
      const data = await fetchFromAPI<unknown>('/options', {
        option_key: 'successful_last_synk',
      });
      const members = getMembers<SyncStatus>(data);
      return members[0]?.date || members[0]?.option_value || null;
    } catch (e) {
      console.warn('[API Client] Failed to get sync time', e);
      return null;
    }
  },
};
