import { describe, expect, it } from 'vitest';
import {
  formatKyivStamp,
  formatWallMinute,
  instantOfWallMinute,
  kyivClock,
  minutesUntil,
  parseOperatorDate,
  wallMinuteOf,
} from './kyivTime';

describe('kyivClock', () => {
  it('reads the Kyiv date and minute whatever the runtime zone', () => {
    // 22:30 UTC on 25 Nov is 00:30 on 26 Nov in Kyiv (UTC+2).
    const clock = kyivClock(new Date('2026-11-25T22:30:00Z'));
    expect(clock.todayKey).toBe('26.11.2026');
    expect(clock.tomorrowKey).toBe('27.11.2026');
    expect(clock.minute).toBe(30);
  });

  it('rolls the month and year for tomorrow', () => {
    expect(kyivClock(new Date('2026-12-31T12:00:00Z')).tomorrowKey).toBe('01.01.2027');
  });
});

describe('wall-clock axis', () => {
  const today = { year: 2026, month: 11, day: 25 };

  it('places an instant on the axis in Kyiv wall minutes', () => {
    expect(wallMinuteOf(new Date('2026-11-25T15:45:18+02:00'), today)).toBe(15 * 60 + 45);
    expect(wallMinuteOf(new Date('2026-11-26T01:00:00+02:00'), today)).toBe(25 * 60);
  });

  it('converts a wall minute back to its instant', () => {
    expect(instantOfWallMinute(today, 17 * 60).toISOString()).toBe('2026-11-25T15:00:00.000Z');
  });

  it('counts real minutes across the spring DST change', () => {
    // Kyiv moves 03:00 to 04:00 on 29 Mar 2026: 01:00 to 05:00 wall is 3 real hours.
    const day = { year: 2026, month: 3, day: 29 };
    const now = instantOfWallMinute(day, 60);
    expect(minutesUntil(day, 5 * 60, now)).toBe(180);
  });

  it('counts real minutes across the autumn DST change', () => {
    // 25 Oct 2026: 04:00 falls back to 03:00, so 01:00 to 05:00 wall is 5 real hours.
    const day = { year: 2026, month: 10, day: 25 };
    expect(minutesUntil(day, 5 * 60, instantOfWallMinute(day, 60))).toBe(300);
  });

  it('never counts down below zero', () => {
    expect(minutesUntil(today, 0, new Date('2026-11-25T12:00:00Z'))).toBe(0);
  });
});

describe('parseOperatorDate', () => {
  it('keeps the offset the API sends', () => {
    expect(parseOperatorDate('2026-11-25T15:45:18+02:00')?.toISOString()).toBe('2026-11-25T13:45:18.000Z');
  });

  it('reads a string without an offset as Kyiv wall time', () => {
    expect(parseOperatorDate('2026-11-25 15:45')?.toISOString()).toBe('2026-11-25T13:45:00.000Z');
  });

  it('returns null instead of an invalid date', () => {
    expect(parseOperatorDate('')).toBeNull();
    expect(parseOperatorDate('yesterday')).toBeNull();
    expect(parseOperatorDate('2026-13-45T99:00:00+02:00')).toBeNull();
  });
});

describe('formatting', () => {
  it('prints axis minutes as HH:MM', () => {
    expect(formatWallMinute(0)).toBe('00:00');
    expect(formatWallMinute(1440 + 9 * 60 + 5)).toBe('09:05');
  });

  it('adds the date when the stamp is not from today', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    expect(formatKyivStamp(new Date('2026-11-25T13:45:00Z'), now)).toBe('15:45');
    expect(formatKyivStamp(new Date('2026-11-22T13:45:00Z'), now)).toBe('22.11 15:45');
  });
});
