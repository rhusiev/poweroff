import { beforeEach, describe, expect, it } from 'vitest';
import { loadCompare, loadLastSync, loadPlaces, loadTheme, savePlaces } from './storage';

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
  clear() { this.items.clear(); }
}

const legacyPlace = {
  id: 'old-1', customName: 'Дім', otgId: 1, otgName: 'Громада', cityId: 2, cityName: 'Львів',
  streetId: 3, streetName: 'Городоцька', buildingNumber: '12',
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
});

describe('places', () => {
  it('carries places over from the pre-redesign key', () => {
    localStorage.setItem('saved_addresses', JSON.stringify([legacyPlace]));
    expect(loadPlaces()).toMatchObject([legacyPlace]);
  });

  it('prefers the current key once it exists', () => {
    localStorage.setItem('saved_addresses', JSON.stringify([legacyPlace]));
    savePlaces([]);
    expect(loadPlaces()).toEqual([]);
  });

  it('backfills records instead of dropping them', () => {
    localStorage.setItem('po:places', JSON.stringify([{ id: 7, name: 'Робота', street: { name: 'Зелена' }, number: 5 }]));
    expect(loadPlaces()).toMatchObject([{ id: '7', customName: 'Робота', streetName: 'Зелена', buildingNumber: '5' }]);
  });

  it('keeps an unreadable value before it can be overwritten', () => {
    localStorage.setItem('po:places', '{broken');
    expect(loadPlaces()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('po:places-unreadable')!)).toEqual(['{broken']);
  });

  it('keeps a second, different unreadable value too', () => {
    localStorage.setItem('po:places', '{first');
    loadPlaces();
    localStorage.setItem('po:places', '{second');
    loadPlaces();
    loadPlaces();
    expect(JSON.parse(localStorage.getItem('po:places-unreadable')!)).toEqual(['{first', '{second']);
  });

  it('falls back to the pre-redesign key when the current value is unreadable', () => {
    localStorage.setItem('saved_addresses', JSON.stringify([legacyPlace]));
    localStorage.setItem('po:places', '{broken');
    expect(loadPlaces()).toMatchObject([legacyPlace]);
  });

  it('survives blocked storage', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } },
      configurable: true,
    });
    expect(loadPlaces()).toEqual([]);
    expect(() => savePlaces([])).not.toThrow();
    expect(loadTheme()).toBe('auto');
  });
});

describe('settings', () => {
  it('reads the old theme key and defaults to auto', () => {
    expect(loadTheme()).toBe('auto');
    localStorage.setItem('theme', 'dark');
    expect(loadTheme()).toBe('dark');
  });

  it('reads a sync time stored JSON-quoted by earlier builds', () => {
    localStorage.setItem('po:lastSync', '"2026-11-25T15:45:18+02:00"');
    expect(loadLastSync()).toBe('2026-11-25T15:45:18+02:00');
  });

  it('has no compare selection until the user makes one', () => {
    expect(loadCompare()).toBeNull();
    localStorage.setItem('po:compare', JSON.stringify(['a', 3]));
    expect(loadCompare()).toEqual(['a']);
  });
});
