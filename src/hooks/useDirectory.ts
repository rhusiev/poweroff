import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { City, OTG, Street } from '../api/types';

type Level = 'otgs' | 'cities' | 'streets';

const byName = <T extends { name: string }>(items: T[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));

/**
 * The official address tree: громада → місто → вулиця. A choice clears every
 * level below it at once, and a slow answer for an earlier choice is dropped,
 * so a list never shows rows that belong to another parent.
 */
export function useDirectory(active: boolean) {
  const [otgs, setOtgs] = useState<OTG[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [streets, setStreets] = useState<Street[]>([]);
  const [otg, setOtgValue] = useState<number | ''>('');
  const [city, setCityValue] = useState<number | ''>('');
  const [street, setStreet] = useState<number | ''>('');
  const [failed, setFailed] = useState<Level | null>(null);
  const [attempt, setAttempt] = useState(0);

  const setOtg = (value: number | '') => {
    setOtgValue(value);
    setCityValue('');
    setStreet('');
    setCities([]);
    setStreets([]);
  };
  const setCity = (value: number | '') => {
    setCityValue(value);
    setStreet('');
    setStreets([]);
  };

  useEffect(() => {
    if (!active || otgs.length) return;
    const controller = new AbortController();
    apiClient.getOTGs(controller.signal)
      .then(items => { setOtgs(byName(items)); setFailed(null); })
      .catch(() => { if (!controller.signal.aborted) setFailed('otgs'); });
    return () => controller.abort();
  }, [active, otgs.length, attempt]);

  useEffect(() => {
    if (!otg) return;
    const controller = new AbortController();
    apiClient.getCities(otg, controller.signal)
      .then(items => { setCities(byName(items)); setFailed(null); })
      .catch(() => { if (!controller.signal.aborted) setFailed('cities'); });
    return () => controller.abort();
  }, [otg, attempt]);

  useEffect(() => {
    if (!city) return;
    const controller = new AbortController();
    apiClient.getStreets(city, controller.signal)
      .then(items => { setStreets(byName(items)); setFailed(null); })
      .catch(() => { if (!controller.signal.aborted) setFailed('streets'); });
    return () => controller.abort();
  }, [city, attempt]);

  const reset = () => setOtg('');
  const retry = () => setAttempt(value => value + 1);

  return { otgs, cities, streets, otg, city, street, setOtg, setCity, setStreet, failed, retry, reset };
}
