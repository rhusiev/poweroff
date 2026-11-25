import { describe, expect, it } from 'vitest';
import { normalizeGroup, pickBuildingGroup } from './client';

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
