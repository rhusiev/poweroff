import type { Accident, GpvWindow } from '../api/types';
import {
  DAY_MINUTES,
  MINUTE_MS,
  formatWallMinute,
  parseOperatorDate,
  wallMinuteOf,
  type CalendarDay,
} from './kyivTime';

export { DAY_MINUTES };

export type Status = 'purple' | 'red' | 'yellow' | 'green' | 'gray';

/** Kyiv wall-clock minutes from 00:00 today; the axis covers today and tomorrow. */
export const WINDOW_MINUTES = DAY_MINUTES * 2;
/** Overlaps resolve to the first status here. Unknown never hides a known outage. */
export const STATUS_ORDER: Status[] = ['purple', 'red', 'yellow', 'gray'];
const SEVERITY: Record<Status, number> = { purple: 0, red: 1, yellow: 2, gray: 3, green: 4 };
const SYNC_MAX_AGE_MS = 48 * 60 * MINUTE_MS;

const EMERGENCY_SUB_REASONS = new Set([1, 3]);
const PLANNED_SUB_REASON = 2;
const EMERGENCY_TYPE = 1;
const PLANNED_TYPES = new Set([0, 2]);
const POSSIBLE_TYPE = 30;

export interface StatusWindow {
  start: number;
  end: number;
  status: Status;
  /** The event has no published end and runs to the edge of the axis. */
  open?: boolean;
  /** `unknown` covers time the data says nothing reliable about. */
  source: 'accident' | 'gpv' | 'unknown';
}

export interface TimeSegment {
  start: number;
  end: number;
  statuses: Status[]; // most severe first
  open?: boolean;
}

export interface NextChange {
  status: Status;
  minute: number;
}

export interface WindowInput {
  /** Events that name this building or name no building at all. */
  accidents: Accident[];
  /** Events that do not name this building but may cover it. */
  possible?: Accident[];
  /** Undefined when today's line for the group is unknown; today is then unknown, not clear. */
  gpvToday: GpvWindow[] | undefined;
  /** Undefined when tomorrow is unknown; callers stop the axis at midnight instead. */
  gpvTomorrow: GpvWindow[] | undefined;
  today: CalendarDay;
}

export const timeToMinutes = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
};

/**
 * Map the operator's event codes to a status. The codes are undocumented; on
 * 2026-11-25 the live API returned typeOff 0 and 1 with switchSubReason 0 or
 * absent. An unrecognized code is unknown, never a guess.
 */
export function accidentStatus(accident: Accident): Status {
  if (EMERGENCY_SUB_REASONS.has(accident.switchSubReason)) return 'purple';
  if (accident.switchSubReason === PLANNED_SUB_REASON) return 'red';
  if (accident.typeOff === EMERGENCY_TYPE) return 'purple';
  if (PLANNED_TYPES.has(accident.typeOff)) return 'red';
  if (accident.typeOff === POSSIBLE_TYPE) return 'yellow';
  return 'gray';
}

export function isSyncOld(lastSync: string | null, now: Date): boolean {
  const synced = parseOperatorDate(lastSync);
  return !synced || now.getTime() - synced.getTime() > SYNC_MAX_AGE_MS;
}

const UNKNOWN_DAY: StatusWindow = { start: 0, end: DAY_MINUTES, status: 'gray', source: 'unknown' };

function accidentWindow(accident: Accident, status: Status, today: CalendarDay): StatusWindow | null {
  const startAt = parseOperatorDate(accident.dateEvent);
  // An event for this place with an unreadable start may be on now; it must not read as clear.
  if (!startAt) return { start: 0, end: WINDOW_MINUTES, status: 'gray', source: 'unknown' };
  const start = Math.max(0, wallMinuteOf(startAt, today));
  const endAt = parseOperatorDate(accident.datePlanIn);
  const end = endAt ? Math.min(WINDOW_MINUTES, wallMinuteOf(endAt, today)) : WINDOW_MINUTES;
  if (start >= end) return null;
  return endAt
    ? { start, end, status, source: 'accident' }
    : { start, end, status, open: true, source: 'accident' };
}

function gpvWindows(list: GpvWindow[], offset: number): StatusWindow[] {
  return list.flatMap(window => {
    const from = timeToMinutes(window.from);
    const to = timeToMinutes(window.to);
    if (from === null || to === null || from === to) return [];
    // «з 23:00 до 01:00» ends on the next day.
    const end = to < from ? to + DAY_MINUTES : to;
    const start = offset + from;
    return [{ start, end: Math.min(WINDOW_MINUTES, offset + end), status: 'red' as const, source: 'gpv' as const }];
  });
}

/** Every labeled window on the axis, by start time, severe first on ties. */
export function buildWindows({ accidents, possible = [], gpvToday, gpvTomorrow, today }: WindowInput): StatusWindow[] {
  const windows = [
    ...accidents.map(accident => accidentWindow(accident, accidentStatus(accident), today)),
    // The only reason to show an event that skips this building is that it may cover it.
    ...possible.map(accident => accidentWindow(accident, 'yellow', today)),
  ].filter((window): window is StatusWindow => window !== null);
  windows.push(...(gpvToday ? gpvWindows(gpvToday, 0) : [UNKNOWN_DAY]), ...gpvWindows(gpvTomorrow ?? [], DAY_MINUTES));
  return windows.sort((a, b) => a.start - b.start || SEVERITY[a.status] - SEVERITY[b.status]);
}

const sameShape = (segment: TimeSegment, statuses: Status[], open: boolean) =>
  segment.statuses.join() === statuses.join() && Boolean(segment.open) === open;

/** Split the axis at every window edge; each segment lists the statuses that cover it. */
export function buildSegments(windows: StatusWindow[]): TimeSegment[] {
  const edges = [...new Set(windows.flatMap(window => [window.start, window.end]))].sort((a, b) => a - b);
  const segments: TimeSegment[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const [start, end] = [edges[index], edges[index + 1]];
    const covering = windows.filter(window => window.start <= start && window.end >= end);
    if (!covering.length) continue;
    const statuses = STATUS_ORDER.filter(status => covering.some(window => window.status === status));
    const open = covering.some(window => window.open);
    const previous = segments.at(-1);
    if (previous && previous.end === start && sameShape(previous, statuses, open)) previous.end = end;
    else segments.push(open ? { start, end, statuses, open } : { start, end, statuses });
  }
  return segments;
}

export function statusAt(segments: TimeSegment[], minute: number): Status {
  const active = segments.find(segment => minute >= segment.start && minute < segment.end);
  return active ? active.statuses[0] : 'green';
}

type Power = 'on' | 'off' | 'possible' | 'unknown';
const POWER: Record<Status, Power> = { green: 'on', purple: 'off', red: 'off', yellow: 'possible', gray: 'unknown' };

/**
 * The next minute before `horizon` where power changes between on, off and
 * possible. A switch between two outage kinds is not a change. Unknown ahead
 * means no countdown, because nothing is known about what follows.
 */
export function nextChange(segments: TimeSegment[], minute: number, horizon = WINDOW_MINUTES): NextChange | null {
  const current = POWER[statusAt(segments, minute)];
  if (current === 'unknown') return null;
  const edges = [...new Set(segments.flatMap(segment => [segment.start, segment.end]))]
    .filter(edge => edge > minute && edge < horizon)
    .sort((a, b) => a - b);
  for (const edge of edges) {
    const status = statusAt(segments, edge);
    if (POWER[status] === current) continue;
    return POWER[status] === 'unknown' ? null : { status, minute: edge };
  }
  return null;
}

export const statusLabel = (status: Status) => {
  switch (status) {
    case 'purple': return 'Аварійне';
    case 'red': return 'Планове';
    case 'yellow': return 'Можливе';
    case 'green': return 'Є світло';
    case 'gray': return 'Немає даних';
  }
};

export function windowLabel(window: Pick<StatusWindow, 'start' | 'end' | 'open'>): string {
  if (window.open) return `з ${formatWallMinute(window.start)} · кінець невідомий`;
  return `${formatWallMinute(window.start)}–${formatWallMinute(window.end)}`;
}

/** The countdown verb names what happens at the next change, given what holds now. */
export function changeVerb(current: Status, next: NextChange): string {
  if (next.status === 'green') return POWER[current] === 'possible' ? 'До кінця можливого' : 'До повернення';
  if (next.status === 'yellow') return 'До можливого відключення';
  return 'До відключення';
}

export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return 'зараз';
  if (minutes < 60) return `${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} г ${rest} хв` : `${hours} г`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} д ${restHours} г` : `${days} д`;
}
