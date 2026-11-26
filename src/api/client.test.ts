import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, normalizeGroup, pickBuildingGroup } from './client';

describe('building group', () => {
  it('keeps the official «Не входить» apart from a missing value', () => {
    expect(normalizeGroup('Не входить')).toBeNull();
    expect(normalizeGroup('')).toBeUndefined();
    expect(normalizeGroup(null)).toBeUndefined();
    expect(normalizeGroup('7')).toBeUndefined();
    expect(normalizeGroup('31')).toBe('3.1');
    expect(normalizeGroup('3.1')).toBe('3.1');
  });

  it('is unknown with no accounts or a tie', () => {
    expect(pickBuildingGroup([])).toBeUndefined();
    expect(pickBuildingGroup([{ chergGpv: '1.1' }, { chergGpv: '2.1' }])).toBeUndefined();
    expect(pickBuildingGroup([{ chergGpv: '' }])).toBeUndefined();
  });

  it('takes the most common value, including «Не входить»', () => {
    expect(pickBuildingGroup([{ chergGpv: '1.1' }, { chergGpv: '1.1' }, { chergGpv: '2.1' }])).toBe('1.1');
    expect(pickBuildingGroup([{ chergGpv: 'Не входить' }, { chergGpv: null }])).toBeNull();
  });
});

describe('building group request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends every name variant as one array filter the API reads in full', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ 'hydra:member': [{ chergGpv: '4.1' }] })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.getBuildingGroup(693, 12445, '111-Г')).resolves.toBe('4.1');

    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), 'http://localhost');
    // A repeated plain key would keep only its last value, «111Г», and match no account.
    expect(url.searchParams.getAll('buildingName')).toEqual([]);
    expect(url.searchParams.getAll('buildingName[]')).toEqual(['111-Г', '111Г']);
  });
});
