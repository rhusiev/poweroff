import type { Accident, GpvWindow } from '../api/types';

export type Status = 'purple' | 'red' | 'yellow' | 'green' | 'gray';

export interface TimeSegment {
  start: number; // minutes from the start of local today
  end: number;
  statuses: Status[]; // most severe first
  open?: boolean; // an event without a planned end runs to the window edge
}

export interface NextChange {
  status: Status;
  minute: number;
}

export const STATUS_ORDER: Status[] = ['purple', 'red', 'yellow'];
export const DAY_MINUTES = 1440;
export const WINDOW_MINUTES = DAY_MINUTES * 2;

// The API sends local wall-clock times with a "UTC" style suffix.
export const parseAPIDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  return new Date(dateStr.replace(/Z|[+-]\d{2}:\d{2}$/, ''));
};

export const timeToMinutes = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export const getAccidentStatus = (acc: Accident, isDataOld: boolean): Status => {
  if (isDataOld) return 'gray';

  if (acc.switchSubReason === 1 || acc.switchSubReason === 3) return 'purple';
  if (acc.switchSubReason === 2) return 'red';

  if (acc.typeOff === 1) return 'purple';
  if (acc.typeOff === 0 || acc.typeOff === 2) return 'red';
  if (acc.typeOff === 30) return 'yellow';

  return 'gray';
};

export const isSyncOld = (lastSync: string | null, now = new Date()) => {
  if (!lastSync) return true;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return parseAPIDate(lastSync) < new Date(todayStart.getTime() - 48 * 60 * 60 * 1000);
};

/** Build the 48-hour status timeline from accidents and GPV windows. */
export function buildSegments(
  accidents: Accident[],
  gpvWindowsToday: GpvWindow[],
  gpvWindowsTomorrow: GpvWindow[],
  isDataOld: boolean,
  todayStart: Date,
): TimeSegment[] {
  if (isDataOld) return [];

  const layers: Record<Status, Uint8Array> = {
    purple: new Uint8Array(WINDOW_MINUTES),
    red: new Uint8Array(WINDOW_MINUTES),
    yellow: new Uint8Array(WINDOW_MINUTES),
    green: new Uint8Array(WINDOW_MINUTES),
    gray: new Uint8Array(WINDOW_MINUTES),
  };
  const openLayers: Record<Status, Uint8Array> = {
    purple: new Uint8Array(WINDOW_MINUTES),
    red: new Uint8Array(WINDOW_MINUTES),
    yellow: new Uint8Array(WINDOW_MINUTES),
    green: new Uint8Array(WINDOW_MINUTES),
    gray: new Uint8Array(WINDOW_MINUTES),
  };

  const addRange = (startMin: number, endMin: number, status: Status) => {
    if (status === 'green' || status === 'gray') return;
    for (let m = Math.max(0, startMin); m < Math.min(WINDOW_MINUTES, endMin); m++) {
      layers[status][m] = 1;
    }
  };

  accidents.forEach(acc => {
    const start = parseAPIDate(acc.dateEvent);
    const startMin = Math.max(0, Math.floor((start.getTime() - todayStart.getTime()) / (60 * 1000)));
    const status = getAccidentStatus(acc, isDataOld);
    const hasEnd = Boolean(acc.datePlanIn);

    let endMin: number;
    if (hasEnd) {
      const end = parseAPIDate(acc.datePlanIn);
      endMin = Math.min(WINDOW_MINUTES, Math.ceil((end.getTime() - todayStart.getTime()) / (60 * 1000)));
    } else {
      // An open-ended event has no invented end: it runs to the edge of the window and fades.
      endMin = WINDOW_MINUTES;
      for (let m = Math.max(0, startMin); m < endMin; m++) openLayers[status][m] = 1;
    }

    if (startMin >= endMin) return;
    addRange(startMin, endMin, status);
  });

  const addGpvWindows = (windows: GpvWindow[], dayOffset: number) => {
    windows.forEach(window => {
      const start = timeToMinutes(window.from);
      const end = timeToMinutes(window.to);
      if (start === null || end === null || start >= end) return;
      addRange(dayOffset + start, dayOffset + end, 'red');
    });
  };

  addGpvWindows(gpvWindowsToday, 0);
  addGpvWindows(gpvWindowsTomorrow, DAY_MINUTES);

  const result: TimeSegment[] = [];
  let currentKey = '';
  let currentStatuses: Status[] = [];
  let currentOpen = false;
  let currentStart = 0;

  for (let m = 0; m <= WINDOW_MINUTES; m++) {
    const statuses = m < WINDOW_MINUTES ? STATUS_ORDER.filter(status => layers[status][m]) : [];
    const open = m < WINDOW_MINUTES && STATUS_ORDER.some(status => openLayers[status][m]);
    const key = `${statuses.join(',')}|${open ? 'o' : ''}`;

    if (key !== currentKey) {
      if (currentStatuses.length && m > currentStart) {
        result.push({ start: currentStart, end: m, statuses: currentStatuses, open: currentOpen });
      }
      currentKey = key;
      currentStatuses = statuses;
      currentOpen = open;
      currentStart = m;
    }
  }

  return result;
}

export function statusAt(segments: TimeSegment[], minute: number): Status {
  const active = segments.find(segment => minute >= segment.start && minute < segment.end);
  return active ? active.statuses[0] : 'green';
}

export interface StatusWindow {
  start: number;
  end: number;
  status: Status;
  open?: boolean;
  source: 'accident' | 'gpv';
}

/** Labeled windows for the schedule rows, sorted by absolute time, overlaps severe-first. */
export function buildWindows(
  accidents: Accident[],
  gpvWindowsToday: GpvWindow[],
  gpvWindowsTomorrow: GpvWindow[],
  isDataOld: boolean,
  todayStart: Date,
): StatusWindow[] {
  if (isDataOld) return [];

  const windows: StatusWindow[] = [];

  accidents.forEach(accident => {
    const start = parseAPIDate(accident.dateEvent);
    const startMin = Math.max(0, Math.floor((start.getTime() - todayStart.getTime()) / 60000));
    const status = getAccidentStatus(accident, false);
    if (!accident.datePlanIn) {
      windows.push({ start: startMin, end: WINDOW_MINUTES, status, open: true, source: 'accident' });
      return;
    }
    const end = parseAPIDate(accident.datePlanIn);
    const endMin = Math.min(WINDOW_MINUTES, Math.ceil((end.getTime() - todayStart.getTime()) / 60000));
    if (startMin >= endMin) return;
    windows.push({ start: startMin, end: endMin, status, source: 'accident' });
  });

  const addGpv = (list: GpvWindow[], offset: number) => {
    list.forEach(window => {
      const start = timeToMinutes(window.from);
      const end = timeToMinutes(window.to);
      if (start === null || end === null || start >= end) return;
      windows.push({ start: offset + start, end: offset + end, status: 'red', source: 'gpv' });
    });
  };

  addGpv(gpvWindowsToday, 0);
  addGpv(gpvWindowsTomorrow, DAY_MINUTES);

  const severity: Record<Status, number> = { purple: 0, yellow: 1, red: 2, green: 3, gray: 4 };
  return windows.sort((a, b) => a.start - b.start || severity[a.status] - severity[b.status]);
}

export function windowLabel(window: Pick<StatusWindow, 'start' | 'end' | 'open'>, todayStart: Date): string {
  if (window.open) return `з ${formatClock(window.start, todayStart)} · кінець невідомий`;
  return `${formatClock(window.start, todayStart)}–${formatClock(window.end, todayStart)}`;
}

export function nextChange(segments: TimeSegment[], minute: number): NextChange | null {
  const active = segments.find(segment => minute >= segment.start && minute < segment.end);

  if (active) {
    // An event with no published end has no next change to count down to.
    if (active.open && active.end >= WINDOW_MINUTES) return null;
    // At the end of the active event the line returns to green unless another
    // event starts at that exact minute.
    return { status: statusAt(segments, active.end), minute: active.end };
  }

  const next = segments.find(segment => segment.start > minute);
  return next && next.statuses.length ? { status: next.statuses[0], minute: next.start } : null;
}

/** The top status at the middle of each of the 48 hours. */
export function hourlyStatuses(segments: TimeSegment[]): Status[] {
  return Array.from({ length: 48 }, (_, hour) => statusAt(segments, hour * 60 + 30));
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

/** Canonical status language shared by tiles, lanes, legend and compare. */
export const STATUS_META: Record<Status, { symbol: string; tone: string; label: string }> = {
  purple: { symbol: 'i-emg', tone: 's-emg', label: 'Аварійне' },
  red: { symbol: 'i-plan', tone: 's-planned', label: 'Планове' },
  yellow: { symbol: 'i-poss', tone: 's-poss', label: 'Можливе' },
  green: { symbol: 'i-on', tone: 's-on', label: 'Є світло' },
  gray: { symbol: 'i-unk', tone: 's-unk', label: 'Немає даних' },
};

export const formatClock = (minute: number, todayStart: Date) => {
  const date = new Date(todayStart.getTime() + minute * 60 * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** The verb carries the direction of the next change. No bare times. */
export function changeCopy(next: NextChange | null, minute: number, todayStart: Date) {
  if (!next) return { verb: 'Час зміни невідомий', clock: '', duration: '', full: 'Час зміни невідомий' };
  const verb = next.status === 'green' ? 'До повернення' : 'До відключення';
  const clock = formatClock(next.minute, todayStart);
  const duration = formatCountdown(next.minute - minute);
  return { verb, clock, duration, full: `${verb} · ${clock} · ${duration}` };
}

export const statusClass = (status: Status) => {
  switch (status) {
    case 'purple': return 'bg-fuchsia-600';
    case 'red': return 'bg-rose-600';
    case 'yellow': return 'bg-amber-400';
    case 'green': return 'bg-emerald-500';
    case 'gray': return 'bg-slate-400';
  }
};

export const statusTextClass = (status: Status) => {
  switch (status) {
    case 'purple': return 'text-fuchsia-700 dark:text-fuchsia-300';
    case 'red': return 'text-rose-700 dark:text-rose-300';
    case 'yellow': return 'text-amber-700 dark:text-amber-300';
    case 'green': return 'text-emerald-700 dark:text-emerald-300';
    case 'gray': return 'text-slate-500 dark:text-slate-400';
  }
};

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

export function describeNext(next: NextChange | null, minute: number, current?: Status): string {
  if (!next) return 'Без змін';
  const countdown = formatCountdown(next.minute - minute);
  if (next.status === 'green') return `Світло через ${countdown}`;
  if (next.status === current) return `Далі ${statusLabel(next.status)} через ${countdown}`;
  return `${statusLabel(next.status)} через ${countdown}`;
}
