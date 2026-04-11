import type { OTG, City, Street, Accident, SyncStatus } from './types';

const BASE_URL = '/api-proxy';

async function fetchFromAPI<T>(endpoint: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const query = new URLSearchParams();
  Object.keys(params).forEach(key => query.append(key, String(params[key])));
  
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

// Helper to extract member array from Hydra response
function getMembers<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data; // Some APIs return array directly
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
      // Priority: n.date, then n.option_value
      return members[0]?.date || members[0]?.option_value || null;
    } catch (e) {
      console.warn('[API Client] Failed to get sync time', e);
      return null;
    }
  },
};
