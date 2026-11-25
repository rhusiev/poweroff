import { describe, expect, it } from 'vitest';
import type { Accident } from '../api/types';
import {
  accidentStatus,
  buildSegments,
  buildWindows,
  changeVerb,
  isSyncOld,
  nextChange,
  statusAt,
  timeToMinutes,
  windowLabel,
} from './status';

const today = { year: 2026, month: 11, day: 25 };
const at = (hours: number, minutes = 0) => hours * 60 + minutes;

const accident = (overrides: Partial<Accident>): Accident => ({
  id: 1,
  typeOff: 0,
  switchSubReason: 0,
  dateEvent: '2026-11-25T10:00:00+02:00',
  datePlanIn: '2026-11-25T14:00:00+02:00',
  buildingNames: '',
  street: { name: 'Вулиця' },
  city: { name: 'Львів' },
  ...overrides,
});

const segmentsOf = (input: Partial<Parameters<typeof buildWindows>[0]>) =>
  buildSegments(buildWindows({ accidents: [], gpvToday: [], gpvTomorrow: [], today, ...input }));

describe('accidentStatus', () => {
  it('maps the observed codes', () => {
    expect(accidentStatus(accident({ typeOff: 1 }))).toBe('purple');
    expect(accidentStatus(accident({ typeOff: 0 }))).toBe('red');
    expect(accidentStatus(accident({ typeOff: 30 }))).toBe('yellow');
    expect(accidentStatus(accident({ typeOff: 0, switchSubReason: 3 }))).toBe('purple');
  });

  it('keeps an unknown code unknown instead of dropping it', () => {
    const accidents = [accident({ typeOff: 5 })];
    expect(accidentStatus(accidents[0])).toBe('gray');
    expect(statusAt(segmentsOf({ accidents }), at(11))).toBe('gray');
  });
});

describe('windows', () => {
  it('keeps an overnight GPV window instead of dropping it', () => {
    const windows = buildWindows({ accidents: [], gpvToday: [{ from: '23:00', to: '01:00' }], gpvTomorrow: [], today });
    expect(windows).toMatchObject([{ start: at(23), end: at(25), source: 'gpv' }]);
  });

  it('reads «до 24:00» as midnight and rejects impossible times', () => {
    expect(timeToMinutes('24:00')).toBe(1440);
    expect(timeToMinutes('24:30')).toBeNull();
  });

  it('shows an event that skips the building as possible, whatever its code', () => {
    const possible = [accident({ typeOff: 30, switchSubReason: 2 })];
    expect(buildWindows({ accidents: [], possible, gpvToday: [], gpvTomorrow: [], today })[0].status).toBe('yellow');
  });

  it('runs an event with no planned end to the edge and labels it open', () => {
    const [window] = buildWindows({ accidents: [accident({ datePlanIn: '' })], gpvToday: [], gpvTomorrow: [], today });
    expect(window).toMatchObject({ end: 2880, open: true });
    expect(windowLabel(window)).toBe('з 10:00 · кінець невідомий');
  });

  it('orders overlaps by severity: emergency, planned, possible', () => {
    const windows = buildWindows({
      accidents: [accident({ typeOff: 30 }), accident({ typeOff: 0 }), accident({ typeOff: 1 })],
      gpvToday: [],
      gpvTomorrow: [],
      today,
    });
    expect(windows.map(window => window.status)).toEqual(['purple', 'red', 'yellow']);
    expect(statusAt(buildSegments(windows), at(11))).toBe('purple');
  });
});

describe('nextChange', () => {
  it('counts down to when power returns, not to the next edge', () => {
    // Emergency 10-14 and GPV 12-16: power is off until 16:00.
    const segments = segmentsOf({ accidents: [accident({ typeOff: 1 })], gpvToday: [{ from: '12:00', to: '16:00' }] });
    expect(nextChange(segments, at(11))).toEqual({ status: 'green', minute: at(16) });
  });

  it('treats a switch between two outage kinds as no change', () => {
    // GPV 10-12 runs straight into emergency 12-14.
    const segments = segmentsOf({
      accidents: [accident({ typeOff: 1, dateEvent: '2026-11-25T12:00:00+02:00' })],
      gpvToday: [{ from: '10:00', to: '12:00' }],
    });
    expect(nextChange(segments, at(11))).toEqual({ status: 'green', minute: at(14) });
  });

  it('gives no countdown past the known horizon', () => {
    const segments = segmentsOf({ gpvToday: [{ from: '20:00', to: '24:00' }] });
    expect(nextChange(segments, at(21), 1440)).toBeNull();
    expect(nextChange(segments, at(9), 1440)).toEqual({ status: 'red', minute: at(20) });
  });

  it('gives no countdown for an event with no planned end', () => {
    expect(nextChange(segmentsOf({ accidents: [accident({ datePlanIn: '' })] }), at(11))).toBeNull();
  });

  it('names the change with the right verb', () => {
    expect(changeVerb('red', { status: 'green', minute: 0 })).toBe('До повернення');
    expect(changeVerb('green', { status: 'purple', minute: 0 })).toBe('До відключення');
    expect(changeVerb('yellow', { status: 'green', minute: 0 })).toBe('До кінця можливого');
  });
});

describe('isSyncOld', () => {
  const now = new Date('2026-11-25T21:00:00Z');

  it('measures 48 hours from now, not from midnight', () => {
    expect(isSyncOld('2026-11-23T00:30:00+02:00', now)).toBe(true);
    expect(isSyncOld('2026-11-24T00:30:00+02:00', now)).toBe(false);
  });

  it('treats a missing or unreadable time as old', () => {
    expect(isSyncOld(null, now)).toBe(true);
    expect(isSyncOld('not a date', now)).toBe(true);
  });
});
