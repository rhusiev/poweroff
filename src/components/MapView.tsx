import { useEffect, useRef, useState, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SavedAddress, Street } from '../api/types';
import { geocodeWithDirectoryFallback, reverseGeocode, resolveOfficial, officialStreetOptions, type GeocodeHit } from '../lib/geo';
import { newId } from '../lib/storage';
import { Button, Field } from './UI';
import { GpsButton } from './GpsButton';
import { createMap, locateUser, pickedPin } from './mapKit';

const MIN_QUERY_LENGTH = 3;
const MAX_HITS = 5;
const PLACE_ZOOM = 17;
const LOCATING_NOTICE_MS = 2000;

interface Picked extends GeocodeHit {
  building: string;
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Search and place-picking panel over a Leaflet map, after the grass-maps
 * prototype. Search runs only when submitted, as Nominatim's policy requires.
 */
export function PickAddressMap({
  onSave,
  onNotice,
}: {
  onSave: (address: SavedAddress) => void;
  onNotice: (text: string, duration?: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pickedMarker = useRef<L.Marker | null>(null);
  const youMarker = useRef<L.Marker | null>(null);
  // One lookup at a time: a newer search or tap aborts the older one.
  const lookup = useRef<AbortController | null>(null);
  const notify = useRef(onNotice);
  useEffect(() => { notify.current = onNotice; }, [onNotice]);

  const [picked, setPicked] = useState<Picked | null>(null);
  // A save reads the latest form values after its lookup, and is dropped when the
  // point was dismissed, picked again or the screen closed meanwhile.
  const pickedNow = useRef<Picked | null>(null);
  const pickCount = useRef(0);
  useEffect(() => { pickedNow.current = picked; }, [picked]);
  useEffect(() => {
    pickCount.current += 1;
    return () => { pickCount.current += 1; };
  }, [picked?.lat, picked?.lon]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [noResults, setNoResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [streetOptions, setStreetOptions] = useState<Street[]>([]);
  const [streetId, setStreetId] = useState<number | undefined>(undefined);
  const [name, setName] = useState('');
  const nameNow = useRef(name);
  useEffect(() => { nameNow.current = name; }, [name]);
  const [locating, setLocating] = useState(false);

  const startLookup = () => {
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    return controller.signal;
  };

  useEffect(() => {
    if (!container.current) return;
    const instance = createMap(container.current);
    map.current = instance;
    return () => {
      lookup.current?.abort();
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    pickedMarker.current?.remove();
    if (!picked || !map.current) return;
    pickedMarker.current = L.marker([picked.lat, picked.lon], { icon: pickedPin() }).addTo(map.current);
    return () => { pickedMarker.current?.remove(); };
  }, [picked]);

  /** Show a chosen point and its official street candidates, unless a newer lookup started. */
  const pick = async (hit: GeocodeHit, signal: AbortSignal) => {
    setPicked({ ...hit, building: hit.building ?? '' });
    setStreetId(undefined);
    setStreetOptions([]);
    setSheetOpen(true);
    if (!hit.building) notify.current('Введіть номер будинку');
    try {
      const options = await officialStreetOptions(hit);
      if (!signal.aborted) setStreetOptions(options);
    } catch {
      // Without candidates, saving resolves the street itself.
    }
  };

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const onClick = async (event: L.LeafletMouseEvent) => {
      const signal = startLookup();
      setQuery('');
      setHits([]);
      setNoResults(false);
      try {
        const result = await reverseGeocode(event.latlng.lat, event.latlng.lng, signal);
        if (signal.aborted) return;
        if (result) await pick(result, signal);
        else notify.current('Не вдалося визначити адресу');
      } catch (error) {
        if (!isAbort(error)) notify.current('Не вдалося визначити адресу');
      }
    };
    instance.on('click', onClick);
    return () => { instance.off('click', onClick); };
  }, []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH || searching) return;
    const signal = startLookup();
    setSearching(true);
    setPicked(null);
    try {
      const rows = await geocodeWithDirectoryFallback(text, signal);
      if (signal.aborted) return;
      setHits(rows.slice(0, MAX_HITS));
      setNoResults(rows.length === 0);
    } catch (error) {
      if (!isAbort(error)) notify.current('Пошук недоступний');
    } finally {
      setSearching(false);
    }
  };

  const choose = (hit: GeocodeHit) => {
    map.current?.flyTo([hit.lat, hit.lon], PLACE_ZOOM);
    pick(hit, startLookup());
  };

  const dismissPicked = () => {
    lookup.current?.abort();
    setPicked(null);
    setName('');
    setStreetId(undefined);
    setSheetOpen(true);
  };

  const clear = () => {
    dismissPicked();
    setQuery('');
    setHits([]);
    setNoResults(false);
    setSearching(false);
  };

  const locate = () => {
    if (locating) return;
    setLocating(true);
    notify.current('Визначаємо ваше місце…', LOCATING_NOTICE_MS);
    locateUser(() => map.current, youMarker, text => notify.current(text), () => setLocating(false));
  };

  const save = async () => {
    if (!picked || !picked.building.trim() || busy) return;
    setBusy(true);
    const pick = pickCount.current;
    notify.current('Шукаємо в довіднику…');
    try {
      const official = await resolveOfficial(picked, streetId ?? streetOptions[0]?.id);
      const current = pickedNow.current;
      if (pickCount.current !== pick || !current) return;
      if (!official) throw new Error('Адресу не знайдено в офіційному довіднику. Спробуйте пошук за вулицею');
      const building = current.building.trim();
      if (!building) return;
      onSave({
        id: newId(),
        customName: nameNow.current.trim() || `${official.streetName}, ${building}`,
        ...official,
        buildingNumber: building,
        lat: picked.lat,
        lon: picked.lon,
      });
      dismissPicked();
      notify.current('Адресу збережено');
    } catch (error) {
      notify.current(error instanceof Error ? error.message : 'Не вдалося зберегти адресу');
    } finally {
      setBusy(false);
    }
  };

  const title = picked
    ? `${picked.road ?? 'Адреса'}${picked.building ? `, ${picked.building}` : ''}`
    : 'Пошук адреси';
  const chosenStreet = streetId ?? streetOptions[0]?.id;

  return (
    <div className="map-wrap picker">
      <div ref={container} className="map" aria-label="Карта" />
      <GpsButton onClick={locate} busy={locating} />

      {!picked && <div className="map-hint" aria-hidden="true">Торкніться карти, щоб обрати будинок</div>}

      <div className="search-bottom">
        <form className="search-bar" role="search" onSubmit={search}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            id="map-search"
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setNoResults(false);
              if (picked) dismissPicked();
            }}
            placeholder="Вулиця, місто"
            aria-label="Пошук вулиці або міста"
          />
          {query && <button type="button" className="search-clear" aria-label="Очистити пошук" onClick={clear}>×</button>}
          <button type="submit" className="search-go" disabled={query.trim().length < MIN_QUERY_LENGTH || searching}>Знайти</button>
        </form>
        {!picked && hits.length === 0 && !noResults && (
          <div className="map-hint-dock" aria-hidden="true">Торкніться карти, щоб обрати будинок</div>
        )}
        {noResults && !picked && hits.length === 0 && <div className="search-empty" role="status">Нічого не знайдено</div>}
        {hits.length > 0 && !picked && (
          <ul className="search-results">
            {hits.map(hit => (
              <li key={`${hit.lat},${hit.lon}`}>
                <button type="button" className="opt" onClick={() => choose(hit)}>
                  <span className="search-result-icon" aria-hidden="true">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 21 10 3M17 21 14 3M12 6v2M12 11v2M12 16v2" /></svg>
                  </span>
                  <span className="search-result-text">
                    <span className="search-result-main">{hit.road ? `${hit.road}${hit.building ? `, ${hit.building}` : ''}` : hit.label.split(',')[0]}</span>
                    {hit.city && <span className="search-result-sub">{hit.city}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {picked && (
          <div className="picked-sheet" role="dialog" aria-label="Обрана адреса">
            <button type="button" className="sheet-handle" aria-expanded={sheetOpen} aria-label={sheetOpen ? 'Згорнути адресу' : 'Розгорнути адресу'} onClick={() => setSheetOpen(open => !open)}>
              <span />
            </button>
            <div className="picked-head">
              <div className="picked-head-text">
                <div className="label">Обрана адреса</div>
                <div className="picked-title">{title}</div>
              </div>
              <button type="button" className="sheet-close" aria-label="Закрити обрану адресу" onClick={dismissPicked}>×</button>
            </div>
            {sheetOpen && (
              <>
                <div className="picked-body">
                  {streetOptions.length > 1 && (
                    <div className="field">
                      <div className="field-label" id="map-street">Вулиця в довіднику</div>
                      <div className="pick" role="radiogroup" aria-labelledby="map-street">
                        {streetOptions.map(street => (
                          <button key={street.id} type="button" role="radio" aria-checked={street.id === chosenStreet} onClick={() => setStreetId(street.id)}>
                            {street.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <Field id="map-building" label="Будинок" value={picked.building} onChange={value => setPicked({ ...picked, building: value })} placeholder="12, 12А" />
                  <Field id="map-name" label="Назва (необов'язково)" value={name} onChange={setName} placeholder="Дім" />
                </div>
                <div className="picked-foot">
                  <Button variant="primary" onClick={save} disabled={!picked.building.trim() || busy}>Зберегти адресу</Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
