import { describe, expect, it } from 'vitest';
import type { Accident, GpvSchedule, SavedAddress } from '../api/types';
import { kyivClock } from './kyivTime';
import { buildPlaceSnapshots, buildingMatches, groupSnapshot, isCurrent, normalizeBuilding, scheduleDay, type PlaceData } from './places';

describe('building matching', () => {
  it('treats spelling variants of one building as equal', () => {
    for (const variant of ['12-А', '12 а', '12a', '12А', ' 12-а. ']) expect(normalizeBuilding(variant)).toBe('12а');
    expect(normalizeBuilding('20*')).toBe('20');
  });

  it('does not read a hyphenated number as a range', () => {
    expect(buildingMatches('19', '1-9, 21')).toBe(false);
    expect(buildingMatches('5', '1-9')).toBe(false);
    expect(buildingMatches('33-1', '33-1, 33-2')).toBe(true);
    expect(buildingMatches('33', '33-1, 33-2')).toBe(false);
  });

  it('keeps a lettered building separate from the numbered one', () => {
    expect(buildingMatches('109А', '109, 111')).toBe(false);
    expect(buildingMatches('109А', '109, 109-А, 111')).toBe(true);
  });
});

const today = '25.11.2026';
const tomorrow = '26.11.2026';
const now = new Date('2026-11-25T09:00:00Z'); // 11:00 in Kyiv
const clock = kyivClock(now);
const freshSync = '2026-11-25T10:00:00+02:00';

const schedule = (groups: Record<string, { from: string; to: string }[]>, withTomorrow = false): GpvSchedule => ({
  today: { date: today, updated: null, groups },
  tomorrow: withTomorrow ? { date: tomorrow, updated: null, groups } : null,
  stale: false,
});

const address: SavedAddress = {
  id: 'a', customName: 'Дім', otgId: 1, otgName: 'Львівська', cityId: 1, cityName: 'Львів',
  streetId: 1, streetName: 'Городоцька', buildingNumber: '12',
};

const snapshot = (place: PlaceData | undefined, gpv: GpvSchedule | null, failed = new Set<string>()) =>
  buildPlaceSnapshots([address], { data: place ? { a: place } : {}, failed }, gpv, clock, freshSync, now)[0];

const place = (group: PlaceData['group'], accidents: Accident[] = [], fetchedAt = now.getTime()): PlaceData =>
  ({ accidents, planned: [], group, fetchedAt });

const emergency = (dateEvent: string): Accident => ({
  id: 7, typeOff: 1, switchSubReason: 0, dateEvent, datePlanIn: '2026-11-25T14:00:00+02:00',
  buildingNames: '12', street: { name: '' }, city: { name: '' },
});

describe('schedule days', () => {
  it('finds a day by its date, even when the page still files it as tomorrow', () => {
    const shifted: GpvSchedule = { today: { date: '24.11.2026', updated: null, groups: {} }, tomorrow: { date: today, updated: null, groups: {} }, stale: false };
    expect(scheduleDay(shifted, today)).toBe(shifted.tomorrow);
    expect(scheduleDay(shifted, tomorrow)).toBeNull();
  });
});

describe('place snapshots', () => {
  it('is gray with no «Без черги» when the group never arrived', () => {
    const result = snapshot(place(undefined), schedule({ '1.1': [] }));
    expect(result).toMatchObject({ status: 'gray', dataKnown: false, group: undefined });
  });

  it('is green for the official «Не входить» with no events', () => {
    expect(snapshot(place(null), schedule({})).status).toBe('green');
  });

  it('is gray when the group line is missing from the published day', () => {
    expect(snapshot(place('3.1'), schedule({ '1.1': [] })).status).toBe('gray');
  });

  it('is green for a group the page lists as «Електроенергія є»', () => {
    expect(snapshot(place('3.1'), schedule({ '3.1': [] })).status).toBe('green');
  });

  it('shows the GPV window and counts down in real minutes', () => {
    const result = snapshot(place('3.1'), schedule({ '3.1': [{ from: '10:00', to: '12:30' }] }));
    expect(result).toMatchObject({ status: 'red', reason: 'Вікно ГПВ', next: { status: 'green', minute: 750 }, nextIn: 90 });
  });

  it('has no countdown into an unpublished tomorrow', () => {
    const result = snapshot(place('3.1'), schedule({ '3.1': [{ from: '20:00', to: '24:00' }] }));
    expect(result.tomorrowKnown).toBe(false);
    expect(result.next).toEqual({ status: 'red', minute: 1200 });
    const evening = buildPlaceSnapshots([address], { data: { a: place('3.1') }, failed: new Set() },
      schedule({ '3.1': [{ from: '20:00', to: '24:00' }] }), kyivClock(new Date('2026-11-25T19:00:00Z')), freshSync, new Date('2026-11-25T19:00:00Z'))[0];
    expect(evening.next).toBeNull();
  });

  it('tells a pending place from a failed one', () => {
    expect(snapshot(undefined, schedule({}))).toMatchObject({ pending: true, reason: 'Оновлюємо дані…' });
    expect(snapshot(undefined, schedule({}), new Set(['a']))).toMatchObject({ pending: false, reason: 'Не вдалося отримати дані' });
  });

  it('is gray with a reason when today is not published yet', () => {
    const old: GpvSchedule = { today: { date: '24.11.2026', updated: null, groups: { '3.1': [] } }, tomorrow: null, stale: false };
    expect(snapshot(place('3.1'), old)).toMatchObject({ status: 'gray', reason: 'Графік на цю добу ще не опубліковано' });
  });

  it('explains the most severe window, not the earliest', () => {
    const possible: Accident = {
      id: 9, typeOff: 30, switchSubReason: 0, dateEvent: '2026-11-25T08:00:00+02:00', datePlanIn: '2026-11-25T18:00:00+02:00',
      buildingNames: '', street: { name: '' }, city: { name: '' },
    };
    const result = snapshot(place('3.1', [possible]), schedule({ '3.1': [{ from: '10:00', to: '12:00' }] }));
    expect(result).toMatchObject({ status: 'red', reason: 'Вікно ГПВ' });
  });
});

describe('stored place data', () => {
  const sixDaysAgo = now.getTime() - 6 * 24 * 60 * 60 * 1000;
  const clear = schedule({ '3.1': [] });

  it('is not shown as current when its refetch failed', () => {
    const result = snapshot(place('3.1'), clear, new Set(['a']));
    expect(result).toMatchObject({ status: 'gray', dataKnown: false, pending: false, reason: 'Не вдалося отримати дані' });
  });

  it('is not shown as current when it is old and no fresh answer arrived yet', () => {
    expect(snapshot(place('3.1', [], sixDaysAgo), clear)).toMatchObject({ status: 'gray', dataKnown: false, reason: 'Оновлюємо дані…' });
    expect(snapshot({ accidents: [], planned: [], group: '3.1' }, clear)).toMatchObject({ status: 'gray' });
  });

  it('counts an answer as current for 15 minutes', () => {
    expect(isCurrent(now.getTime() - 15 * 60 * 1000, now)).toBe(true);
    expect(isCurrent(now.getTime() - 15 * 60 * 1000 - 1, now)).toBe(false);
    expect(isCurrent(undefined, now)).toBe(false);
  });

  it('shows on the offline screen as it was stored', () => {
    const data = { data: { a: place('3.1', [], sixDaysAgo) }, failed: new Set(['a']) };
    const [result] = buildPlaceSnapshots([address], data, clear, clock, freshSync, now, { acceptCached: true });
    expect(result).toMatchObject({ status: 'green', dataKnown: true });
  });
});

describe('unknown parts of the day', () => {
  it('still shows a known emergency when the group is unknown', () => {
    const result = snapshot(place(undefined, [emergency('2026-11-25T10:00:00+02:00')]), schedule({ '3.1': [] }));
    expect(result).toMatchObject({ status: 'purple', dataKnown: false, reason: 'з 10:00' });
  });

  it('is gray, not green, outside known events when the group is unknown', () => {
    const result = snapshot(place(undefined, [emergency('2026-11-25T12:00:00+02:00')]), schedule({ '3.1': [] }));
    expect(result).toMatchObject({ status: 'gray', next: null });
  });

  it('is gray, not green, when an event for the building has an unreadable start', () => {
    const result = snapshot(place('3.1', [emergency('25.11.2026 10:00')]), schedule({ '3.1': [] }));
    expect(result).toMatchObject({ status: 'gray', next: null });
  });
});

describe('group explorer', () => {
  it('turns gray when the sync is older than 48 hours', () => {
    const gpv = schedule({ '2.1': [{ from: '10:00', to: '12:00' }] });
    expect(groupSnapshot(gpv, '2.1', clock, freshSync, now).status).toBe('red');
    expect(groupSnapshot(gpv, '2.1', clock, '2026-11-20T10:00:00+02:00', now)).toMatchObject({ status: 'gray', known: false });
  });
});
