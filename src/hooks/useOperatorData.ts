import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { GpvSchedule } from '../api/types';
import { kyivClock } from '../lib/kyivTime';
import { PLACE_REFRESH_MS } from '../lib/places';
import { loadLastSync, loadSchedule, saveLastSync, saveSchedule } from '../lib/storage';

/** The "now" line and countdowns move at this step. */
const CLOCK_TICK_MS = 30 * 1000;

/**
 * The hourly schedule and the operator's sync time, polled every five minutes,
 * on reconnect and right after midnight. `placeToken` changes whenever place
 * data should be refetched outside its own timer. `schedule` is this session's
 * answer only; `cachedSchedule` falls back to the last stored one for the
 * offline screen.
 */
export function useOperatorData() {
  const [schedule, setSchedule] = useState<GpvSchedule | null>(null);
  const [cachedSchedule, setCachedSchedule] = useState<GpvSchedule | null>(loadSchedule);
  const [lastSync, setLastSync] = useState<string | null>(loadLastSync);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [now, setNow] = useState(() => new Date());
  const [placeToken, setPlaceToken] = useState(0);
  const clock = useMemo(() => kyivClock(now), [now]);
  const inFlight = useRef<Promise<boolean> | null>(null);

  const fetchAll = useCallback(async () => {
    // Each answer is kept on its own: a failed sync time must not throw away a good schedule.
    const [nextSchedule, sync] = await Promise.allSettled([apiClient.getGpvSchedule(), apiClient.getLastSync()]);
    if (nextSchedule.status === 'fulfilled') {
      setSchedule(nextSchedule.value);
      setCachedSchedule(nextSchedule.value);
      saveSchedule(nextSchedule.value);
    }
    if (sync.status === 'fulfilled' && sync.value) {
      setLastSync(sync.value);
      saveLastSync(sync.value);
    }
    const ok = nextSchedule.status === 'fulfilled' && sync.status === 'fulfilled';
    setFailed(!ok);
    return ok;
  }, []);

  /** One fetch at a time; a call during a fetch waits for that fetch's result. */
  const load = useCallback(() => {
    inFlight.current ??= fetchAll().finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, [fetchAll]);

  /** A user-requested retry: refetch everything now. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setPlaceToken(token => token + 1);
    const ok = await load();
    setRefreshing(false);
    return ok;
  }, [load]);

  useEffect(() => {
    load();
    const timer = setInterval(load, PLACE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setPlaceToken(token => token + 1);
      load();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // A new day needs the new day's schedule now, not at the next poll.
  const dayKey = clock.todayKey;
  const firstDay = useRef(dayKey);
  useEffect(() => {
    if (dayKey === firstDay.current) return;
    firstDay.current = dayKey;
    setPlaceToken(token => token + 1);
    load();
  }, [dayKey, load]);

  return { schedule, cachedSchedule, lastSync, failed, refreshing, refresh, online, now, clock, placeToken };
}
