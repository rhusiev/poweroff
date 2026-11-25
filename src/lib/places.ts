import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { Accident, GpvSchedule, SavedAddress } from '../api/types';
import {
  buildSegments,
  buildWindows,
  formatClock,
  hourlyStatuses,
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
  group: string | null | undefined;
}

export interface PlaceSnapshot {
  address: SavedAddress;
  group: string | null | undefined;
  segments: TimeSegment[];
  windows: StatusWindow[];
  status: Status;
  next: NextChange | null;
  hourly: Status[];
  /** Whether a type-30 event covers a building that is not named in the event. */
  possible: boolean;
  /** Reason line for the dominant band, derived from official data only. */
  reason: string;
  /** False when the place or its group never arrived, or the schedule is stale. */
  dataKnown: boolean;
  /** False when the official schedule has no entry for tomorrow. */
  tomorrowKnown: boolean;
}

const REFRESH_MS = 5 * 60 * 1000;

/** Parse the comma-separated buildingNames list (numbers, ranges and letters). */
function buildingMatches(target: string, buildingNames: string): boolean {
  const clean = target.trim().toLowerCase().replace(/[\s-]/g, '');
  if (!clean || !buildingNames) return false;

  return buildingNames.split(',').some(raw => {
    const part = raw.trim().toLowerCase();
    if (part === target.trim().toLowerCase() || part.replace(/[\s-]/g, '') === clean) return true;

    const match = part.replace(/\s/g, '').match(/^(\d+)-(\d+)([а-яіїєa-z]?)$/);
    if (!match) return false;
    const number = clean.match(/^(\d+)([а-яіїєa-z]?)$/);
    if (!number) return false;
    if (number[2] !== match[3]) return false;
    const value = Number(number[1]);
    return value >= Number(match[1]) && value <= Number(match[2]);
  });
}

/** Events that cover the building, plus unconfirmed type-30 events for the hint. */
export function splitAccidents(events: Accident[], buildingNumber: string) {
  const covers: Accident[] = [];
  const possible: Accident[] = [];

  events.forEach(event => {
    if (!buildingNumber || !event.buildingNames || buildingMatches(buildingNumber, event.buildingNames)) {
      covers.push(event);
    } else if (event.typeOff === 30) {
      possible.push(event);
    }
  });

  return { covers, possible };
}

export function usePlaceData(addresses: SavedAddress[], refreshToken = 0) {
  const [data, setData] = useState<Record<string, PlaceData>>({});
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const entries = await Promise.all(addresses.map(async address => {
        try {
          const [accidents, planned, group] = await Promise.all([
            apiClient.getAccidents(address.cityId, address.streetId),
            apiClient.getPlannedAccidents(address.cityId, address.streetId),
            apiClient.getBuildingGroup(address.cityId, address.streetId, address.buildingNumber),
          ]);
          return [address.id, { accidents, planned, group }] as const;
        } catch {
          // Keep the last known entry on refetch failure; never wipe with empty.
          return [address.id, dataRef.current[address.id] ?? { accidents: [] as Accident[], planned: [] as Accident[], group: undefined }] as const;
        }
      }));
      if (!cancelled) setData(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [addresses, refreshToken]);

  return data;
}

export function buildPlaceSnapshots(
  addresses: SavedAddress[],
  data: Record<string, PlaceData>,
  schedule: GpvSchedule | null,
  todayKey: string,
  tomorrowKey: string,
  lastSync: string | null,
  now: Date,
): PlaceSnapshot[] {
  // A schedule for a different local day cannot describe this 48-hour window.
  const scheduleMissing = !schedule || schedule.today?.date !== todayKey;
  const isDataOld = isSyncOld(lastSync, now) || scheduleMissing;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMinute = Math.floor((now.getTime() - todayStart.getTime()) / (60 * 1000));

  return addresses.map(address => {
    const place = data[address.id];
    // Keep "unknown" (undefined) distinct from the official "Не входить" (null).
    // Coercing undefined to null would print «Без черги» when group data never arrived.
    const group = place?.group;
    // Green requires known data: an official group list that may be empty, or
    // the official «Не входить» (null). A missing place or an undefined group
    // means nothing arrived, so gray is the only honest state.
    const dataKnown = Boolean(place) && group !== undefined && !isDataOld;
    // Tomorrow can be unpublished even when today is valid. That day has no
    // information, so it stays gray instead of reading as a clear day.
    const tomorrowKnown = dataKnown && schedule?.tomorrow?.date === tomorrowKey;
    const gpvToday = group && schedule?.today?.date === todayKey ? schedule.today.groups[group] ?? [] : [];
    const gpvTomorrow = group && schedule?.tomorrow?.date === tomorrowKey ? schedule.tomorrow.groups[group] ?? [] : [];
    const events = place ? [...place.accidents, ...place.planned] : [];
    const { covers, possible } = splitAccidents(events, address.buildingNumber);
    // A type-30 event that does not name this building is shown as "Можливе", not as certain.
    const relevant = [...covers, ...possible];
    const segments = buildSegments(relevant, gpvToday, gpvTomorrow, isDataOld, todayStart);
    const windows = buildWindows(relevant, gpvToday, gpvTomorrow, isDataOld, todayStart);

    const active = windows.find(window => currentMinute >= window.start && currentMinute < window.end);
    const reason = !schedule
      ? 'Не вдалося отримати дані'
      : scheduleMissing
        ? 'Графік на цю добу ще не опубліковано'
      : isSyncOld(lastSync, now)
        ? 'Дані старші за 48 годин'
      : !dataKnown
        ? statusLabel('gray')
      : active?.source === 'gpv'
        ? 'Вікно ГПВ'
        : possible.length && active?.status === 'yellow'
          ? 'Можливе відключення · будинок не вказано в переліку події'
          : active
            ? `з ${formatClock(active.start, todayStart)}`
            : statusLabel('green');

    return {
      address,
      group,
      segments,
      windows,
      status: dataKnown ? statusAt(segments, currentMinute) : 'gray',
      next: dataKnown ? nextChange(segments, currentMinute) : null,
      hourly: dataKnown ? hourlyStatuses(segments) : Array<Status>(48).fill('gray'),
      possible: possible.length > 0,
      reason,
      dataKnown,
      tomorrowKnown,
    };
  });
}
