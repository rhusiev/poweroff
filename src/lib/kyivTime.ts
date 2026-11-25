/**
 * Clock arithmetic in the operator's time zone.
 *
 * Every schedule the operator publishes is Kyiv wall-clock time, so the 48-hour
 * axis is measured in Kyiv wall-clock minutes from 00:00 today: minute 0 is
 * today's midnight and minute 1440 is tomorrow's, also on a DST day. Real
 * durations, such as a countdown, convert back to instants first.
 */

export const KYIV_TIME_ZONE = 'Europe/Kyiv';
export const MINUTE_MS = 60 * 1000;
export const DAY_MINUTES = 24 * 60;
const DAY_MS = DAY_MINUTES * MINUTE_MS;
const OFFSET_CORRECTIONS = 2;

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

export interface KyivClock {
  today: CalendarDay;
  todayKey: string;
  tomorrowKey: string;
  /** Kyiv wall-clock minutes since today's 00:00. */
  minute: number;
}

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: KYIV_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function wallClock(instant: Date) {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map(part => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

const dayNumber = ({ year, month, day }: CalendarDay) => Date.UTC(year, month - 1, day) / DAY_MS;
const pad = (value: number) => String(value).padStart(2, '0');

function shiftDay(day: CalendarDay, offset: number): CalendarDay {
  const date = new Date(Date.UTC(day.year, day.month - 1, day.day + offset));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** The official schedule's day key, DD.MM.YYYY. */
export const dayKey = (day: CalendarDay) => `${pad(day.day)}.${pad(day.month)}.${day.year}`;

export function kyivClock(now: Date): KyivClock {
  const wall = wallClock(now);
  const today = { year: wall.year, month: wall.month, day: wall.day };
  return {
    today,
    todayKey: dayKey(today),
    tomorrowKey: dayKey(shiftDay(today, 1)),
    minute: wall.hour * 60 + wall.minute,
  };
}

/** Kyiv wall-clock minutes of an instant, counted from 00:00 of `today`. */
export function wallMinuteOf(instant: Date, today: CalendarDay): number {
  const wall = wallClock(instant);
  return (dayNumber(wall) - dayNumber(today)) * DAY_MINUTES + wall.hour * 60 + wall.minute;
}

/** The instant whose Kyiv wall clock reads `minute` minutes after 00:00 of `today`. */
export function instantOfWallMinute(today: CalendarDay, minute: number): Date {
  const target = Date.UTC(today.year, today.month - 1, today.day) + minute * MINUTE_MS;
  let guess = target;
  // Each pass corrects by the zone offset seen at the guess; two settle a DST day.
  for (let pass = 0; pass < OFFSET_CORRECTIONS; pass += 1) {
    const wall = wallClock(new Date(guess));
    guess += target - Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  }
  return new Date(guess);
}

/** Real minutes from `now` until the wall-clock minute, never negative. */
export function minutesUntil(today: CalendarDay, minute: number, now: Date): number {
  const delta = instantOfWallMinute(today, minute).getTime() - now.getTime();
  return Math.max(0, Math.round(delta / MINUTE_MS));
}

const OFFSET_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/;
const LOCAL_STAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

/**
 * Parse an operator timestamp. The API sends ISO strings with an offset, such as
 * 2026-11-25T15:45:18+02:00. A string without an offset is read as Kyiv wall time.
 * Returns null for anything unparseable, so a caller cannot mistake it for "now".
 */
export function parseOperatorDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.trim();
  if (OFFSET_SUFFIX.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = text.match(LOCAL_STAMP);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return instantOfWallMinute({ year, month, day }, hour * 60 + minute);
}

/** HH:MM of a wall-clock minute on the 48-hour axis. */
export function formatWallMinute(minute: number): string {
  const inDay = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}`;
}

/** Kyiv time of an instant: «HH:MM» when it is today, else «DD.MM HH:MM». */
export function formatKyivStamp(instant: Date, now: Date): string {
  const wall = wallClock(instant);
  const clock = `${pad(wall.hour)}:${pad(wall.minute)}`;
  if (dayNumber(wall) === dayNumber(kyivClock(now).today)) return clock;
  return `${pad(wall.day)}.${pad(wall.month)} ${clock}`;
}
