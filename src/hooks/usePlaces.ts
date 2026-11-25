import { useEffect, useState } from 'react';
import type { SavedAddress } from '../api/types';
import { PLACES_KEY, loadPlaces, parsePlaces, savePlaces } from '../lib/storage';

/** Saved places, persisted on every change and kept in step with other open tabs. */
export function usePlaces() {
  const [places, setPlaces] = useState<SavedAddress[]>(loadPlaces);
  useEffect(() => { savePlaces(places); }, [places]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PLACES_KEY || !event.newValue) return;
      const next = parsePlaces(event.newValue);
      if (next) setPlaces(prev => (JSON.stringify(prev) === event.newValue ? prev : next));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return [places, setPlaces] as const;
}
