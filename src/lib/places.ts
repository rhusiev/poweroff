import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, type BuildingGroup } from '../api/client';
import type { Accident, GpvDay, GpvSchedule, GpvWindow, SavedAddress } from '../api/types';
import { DAY_MINUTES, formatWallMinute, minutesUntil, parseOperatorDate, type KyivClock } from './kyivTime';
import { loadPlaceData, savePlaceData } from './storage';
import {
  WINDOW_MINUTES,
  buildSegments,
  buildWindows,
  isSyncOld,
  nextChange,
  statusAt,
  statusLabel,
  type NextChange,
  type Status,
  type StatusWindow,
  type TimeSegment,
} from './status';

export interface PlaceData {
  accidents: Accident[];
  planned: Accident[];
  group: BuildingGroup;
  /** When this answer arrived, in ms since the epoch. Older stored entries lack it. */
  fetchedAt?: number;
}

export interface PlaceSnapshot {
  address: SavedAddress;
  group: BuildingGroup;
  segments: TimeSegment[];
  windows: StatusWindow[];
  status: Status;
  next: NextChange | null;
  /** Real minutes until `next`, which can differ from the axis on a DST day. */
  nextIn: number | null;
  /** Reason line for the current state, derived from official data only. */
  reason: string;
  /** False when the place, its group or today's schedule never arrived, or the sync is stale. */
  dataKnown: boolean;
  /** False when the official schedule has nothing for tomorrow. */
  tomorrowKnown: boolean;
  /** The first answer for this place has not arrived yet. */
  pending: boolean;
}

export const PLACE_REFRESH_MS = 5 * 60 * 1000;
/** Operator data older than three missed refreshes is not shown as current. Chosen, not derived. */
export const DATA_MAX_AGE_MS = 3 * PLACE_REFRESH_MS;

/** True when an answer that arrived at `at` may still be shown as current. */
export const isCurrent = (at: number | undefined, now: Date) => now.getTime() - (at ?? 0) <= DATA_MAX_AGE_MS;
const POSSIBLE_TYPE = 30;

/** Latin letters that look like Cyrillic ones in building numbers. */
const LOOKALIKES: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
};

/**
 * Canonical building number: «12-А», «12 а» and «12a» are the same building.
 * A hyphen between two numbers is part of the number: «33-1» is a building,
 * not a range. On 2026-11-25 none of 630 live events listed a range.
 */
export function normalizeBuilding(value: string): string {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/[a-z]/g, letter => LOOKALIKES[letter] ?? letter)
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[.*]+$/, '');
  return text.replace(/^(\d+)-?([а-яієїґ])$/, '$1$2');
}

export function buildingMatches(target: string, buildingNames: string): boolean {
  const wanted = normalizeBuilding(target);
  if (!wanted || !buildingNames) return false;
  return buildingNames.split(',').some(name => normalizeBuilding(name) === wanted);
}

/** Events that cover the building, plus type-30 events that skip it but may still cover it. */
export function splitAccidents(events: Accident[], buildingNumber: string) {
  const covers: Accident[] = [];
  const possible: Accident[] = [];
  events.forEach(event => {
    if (!buildingNumber || !event.buildingNames || buildingMatches(buildingNumber, event.buildingNames)) {
      covers.push(event);
    } else if (event.typeOff === POSSIBLE_TYPE) {
      possible.push(event);
    }
  });
  return { covers, possible };
}

/** The published day with this key. Around midnight the page may still call it "tomorrow". */
export function scheduleDay(schedule: GpvSchedule | null, key: string): GpvDay | null {
  return [schedule?.today, schedule?.tomorrow].find(day => day?.date === key) ?? null;
}

/**
 * The windows of a group on a day, or undefined when the day or the group's
 * line is missing. A building outside the schedule (null group) has none.
 */
export function groupWindows(day: GpvDay | null, group: BuildingGroup): GpvWindow[] | undefined {
  if (!day || group === undefined) return undefined;
  if (group === null) return [];
  return day.groups[group];
}

/** Fetch identity: a refetch is needed only when one of these changes. */
const fetchKey = (addresses: SavedAddress[]) =>
  addresses.map(address => `${address.id}:${address.cityId}:${address.streetId}:${address.buildingNumber}`).join('|');

async function loadPlace(address: SavedAddress): Promise<PlaceData> {
  const [accidents, planned, group] = await Promise.all([
    apiClient.getAccidents(address.cityId, address.streetId),
    apiClient.getPlannedAccidents(address.cityId, address.streetId),
    apiClient.getBuildingGroup(address.cityId, address.streetId, address.buildingNumber),
  ]);
  return { accidents, planned, group, fetchedAt: Date.now() };
}

/**
 * Place data, refetched on a timer, on `refreshToken` and when an address's
 * fetch identity changes. `failed` lists places whose last fetch failed.
 */
export function usePlaceData(addresses: SavedAddress[], refreshToken = 0) {
  // Start from the last good answers; the sync time decides whether they are still usable.
  const [state, setState] = useState<{ data: Record<string, PlaceData>; failed: Set<string> }>(
    () => ({ data: loadPlaceData<PlaceData>(), failed: new Set() }),
  );
  const dataRef = useRef(state.data);
  useEffect(() => { dataRef.current = state.data; }, [state.data]);
  const key = fetchKey(addresses);
  // A pin or rename makes a new array with the same fetch identity; keep the old one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const targets = useMemo(() => addresses, [key]);

  useEffect(() => {
    let cancelled = false;
    let latest = 0;
    const load = async () => {
      const run = ++latest;
      const results = await Promise.all(targets.map(async address => {
        try {
          return { id: address.id, place: await loadPlace(address) };
        } catch {
          // Keep the last known entry on a failed refetch; an absent entry stays unknown.
          return { id: address.id, place: dataRef.current[address.id], failed: true };
        }
      }));
      // A slow earlier run must not overwrite a newer answer.
      if (cancelled || run !== latest) return;
      const data = Object.fromEntries(results.filter(result => result.place).map(result => [result.id, result.place!]));
      savePlaceData(data);
      setState({ data, failed: new Set(results.filter(result => result.failed).map(result => result.id)) });
    };
    load();
    const timer = setInterval(load, PLACE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [targets, refreshToken]);

  return state;
}

export interface SnapshotOptions {
  /** Show the last stored answers as they are, for the offline screen that states their age. */
  acceptCached?: boolean;
}

interface Context {
  schedule: GpvSchedule | null;
  acceptCached: boolean;
  failed: Set<string>;
  todayDay: GpvDay | null;
  tomorrowDay: GpvDay | null;
  syncOld: boolean;
  /** No readable operator sync time arrived or was stored. */
  syncMissing: boolean;
  clock: KyivClock;
  now: Date;
  id: string;
}

/** True when this place's answer may be shown as current. */
function isFresh(context: Context, place: PlaceData | undefined): place is PlaceData {
  if (!place) return false;
  if (context.acceptCached) return true;
  return !context.failed.has(context.id) && isCurrent(place.fetchedAt, context.now);
}

function snapshotReason(context: Context, fresh: boolean, todayGpv: GpvWindow[] | undefined, active?: StatusWindow) {
  const failed = context.failed.has(context.id);
  if (!context.schedule || (!fresh && failed)) return 'Не вдалося отримати дані';
  if (!fresh) return 'Оновлюємо дані…';
  if (context.syncMissing) return 'Не вдалося отримати дані';
  if (context.syncOld) return 'Дані старші за 48 годин';
  if (active?.source === 'accident') {
    if (active.status === 'yellow') return 'Можливе відключення · будинок не вказано в переліку події';
    return `з ${formatWallMinute(active.start)}`;
  }
  if (!context.todayDay) return 'Графік на цю добу ще не опубліковано';
  if (!todayGpv || active?.source === 'unknown') return statusLabel('gray');
  if (!active) return statusLabel('green');
  return 'Вікно ГПВ';
}

function snapshotOf(address: SavedAddress, place: PlaceData | undefined, shared: Omit<Context, 'id'>): PlaceSnapshot {
  const context = { ...shared, id: address.id };
  const { clock } = context;
  const fresh = isFresh(context, place);
  const group = place?.group;
  const todayGpv = groupWindows(context.todayDay, group);
  const tomorrowGpv = groupWindows(context.tomorrowDay, group);
  // Known events still show when the group or schedule is unknown; only the rest of the day turns gray.
  const usable = fresh && !context.syncOld;
  const dataKnown = usable && todayGpv !== undefined;
  const tomorrowKnown = dataKnown && tomorrowGpv !== undefined;
  const events = place ? [...place.accidents, ...place.planned] : [];
  const { covers, possible } = splitAccidents(events, address.buildingNumber);
  const windows = usable
    ? buildWindows({ accidents: covers, possible, gpvToday: todayGpv, gpvTomorrow: tomorrowGpv, today: clock.today })
    : [];
  const segments = buildSegments(windows);
  const status = usable ? statusAt(segments, clock.minute) : 'gray';
  const next = usable ? nextChange(segments, clock.minute, tomorrowKnown ? WINDOW_MINUTES : DAY_MINUTES) : null;
  // The reason describes the window that decides the status, not the earliest one.
  const active = windows.find(window =>
    window.status === status && clock.minute >= window.start && clock.minute < window.end);
  return {
    address,
    group,
    segments,
    windows,
    status,
    next,
    nextIn: next ? minutesUntil(clock.today, next.minute, context.now) : null,
    reason: snapshotReason(context, fresh, todayGpv, active),
    dataKnown,
    tomorrowKnown,
    pending: !place && !context.failed.has(address.id),
  };
}

export function buildPlaceSnapshots(
  addresses: SavedAddress[],
  { data, failed }: { data: Record<string, PlaceData>; failed: Set<string> },
  schedule: GpvSchedule | null,
  clock: KyivClock,
  lastSync: string | null,
  now: Date,
  { acceptCached = false }: SnapshotOptions = {},
): PlaceSnapshot[] {
  const context: Omit<Context, 'id'> = {
    schedule,
    acceptCached,
    failed,
    todayDay: scheduleDay(schedule, clock.todayKey),
    tomorrowDay: scheduleDay(schedule, clock.tomorrowKey),
    syncOld: isSyncOld(lastSync, now),
    syncMissing: parseOperatorDate(lastSync) === null,
    clock,
    now,
  };
  return addresses.map(address => snapshotOf(address, data[address.id], context));
}

export interface GroupSnapshot {
  windows: StatusWindow[];
  status: Status;
  known: boolean;
  tomorrowKnown: boolean;
}

/** One schedule group on its own, for the group explorer. */
export function groupSnapshot(
  schedule: GpvSchedule | null,
  group: string,
  clock: KyivClock,
  lastSync: string | null,
  now: Date,
): GroupSnapshot {
  const today = groupWindows(scheduleDay(schedule, clock.todayKey), group);
  const tomorrow = groupWindows(scheduleDay(schedule, clock.tomorrowKey), group);
  const known = today !== undefined && !isSyncOld(lastSync, now);
  const windows = known
    ? buildWindows({ accidents: [], gpvToday: today ?? [], gpvTomorrow: tomorrow ?? [], today: clock.today })
    : [];
  const status = known ? statusAt(buildSegments(windows), clock.minute) : 'gray';
  return { windows, status, known, tomorrowKnown: known && tomorrow !== undefined };
}
