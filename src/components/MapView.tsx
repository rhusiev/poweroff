import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SavedAddress, Street } from '../api/types';
import { geocodeWithDirectoryFallback, reverseGeocode, resolveOfficial, officialStreetOptions, type GeocodeHit } from '../lib/geo';
import { Button, Field } from './UI';
import { GPS_ICON, TILE_ATTRIBUTION, TILE_URL, pickedPin, youPin } from './mapIcons';

const LVIV: [number, number] = [49.8397, 24.0297];

interface Picked extends GeocodeHit {
  building: string;
}

/** Search and place-picking panel over a Leaflet map, following grass-maps. */
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
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const fetchedQuery = useRef('');

  const [picked, setPicked] = useState<Picked | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [noResults, setNoResults] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [streetOptions, setStreetOptions] = useState<Street[]>([]);
  const [streetId, setStreetId] = useState<number | undefined>(undefined);
  const [name, setName] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, { zoomControl: false }).setView(LVIV, 13);
    L.control.zoom({ position: 'topright' }).addTo(instance);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(instance);
    map.current = instance;
    return () => {
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

  useEffect(() => {
    const id = ++sequence.current;
    controller.current?.abort();
    // Once a place is chosen, keep hits for instant restore on dismiss.
    // Remember this query so dismiss does not fetch a second time.
    if (picked) {
      fetchedQuery.current = query;
      setNoResults(false);
      return;
    }
    if (query.trim().length < 3) {
      setHits([]);
      setNoResults(false);
      fetchedQuery.current = '';
      return;
    }
    if (query === fetchedQuery.current) return;
    const timer = window.setTimeout(async () => {
      const abort = new AbortController();
      controller.current = abort;
      fetchedQuery.current = query;
      try {
        const rows = await geocodeWithDirectoryFallback(query, abort.signal);
        if (id === sequence.current && !abort.signal.aborted) {
          setHits(rows.slice(0, 5));
          setNoResults(rows.length === 0);
        }
      } catch {
        if (id === sequence.current && !abort.signal.aborted) onNotice('Пошук недоступний.');
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, picked, onNotice]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const onClick = async (event: L.LeafletMouseEvent) => {
      setQuery('');
      setHits([]);
      setNoResults(false);
      let result;
      try {
        result = await reverseGeocode(event.latlng.lat, event.latlng.lng);
      } catch {
        onNotice('Не вдалося визначити адресу.');
        return;
      }
      if (!result) {
        onNotice('Не вдалося визначити адресу.');
        return;
      }
      setPicked({ ...result, building: result.building ?? '' });
      setStreetOptions(await officialStreetOptions(result));
      setStreetId(undefined);
      setSheetOpen(true);
      if (!result.building) onNotice('Введіть номер будинку.');
    };
    instance.on('click', onClick);
    return () => { instance.off('click', onClick); };
  }, [onNotice]);

  const choose = async (hit: GeocodeHit) => {
    setPicked({ ...hit, building: hit.building ?? '' });
    setSheetOpen(true);
    setStreetOptions(await officialStreetOptions(hit));
    setStreetId(undefined);
    setQuery(hit.road ?? hit.label.split(',')[0]);
    map.current?.flyTo([hit.lat, hit.lon], 17);
    if (!hit.building) onNotice('Введіть номер будинку.');
  };

  const clear = () => {
    setQuery('');
    setHits([]);
    setNoResults(false);
    setPicked(null);
    setName('');
    setStreetId(undefined);
    setSheetOpen(true);
  };

  const dismissPicked = () => {
    setPicked(null);
    setName('');
    setStreetId(undefined);
    setSheetOpen(true);
  };

  const locate = () => {
    if (!map.current || locating) return;
    if (!window.isSecureContext) {
      onNotice('Геолокація працює лише через HTTPS.');
      return;
    }
    if (!navigator.geolocation) {
      onNotice('Геолокація недоступна у цьому браузері.');
      return;
    }
    setLocating(true);
    onNotice('Визначаємо ваше місце…', 2000);
    navigator.geolocation.getCurrentPosition(
      position => {
        const point: [number, number] = [position.coords.latitude, position.coords.longitude];
        map.current?.setView(point, 16);
        youMarker.current?.remove();
        youMarker.current = L.marker(point, { icon: youPin() }).addTo(map.current!);
        setLocating(false);
      },
      error => {
        const reason = error.code === error.PERMISSION_DENIED
          ? 'дозвіл не надано'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'місцеположення недоступне'
            : 'запит перервано';
        onNotice(`Не вдалося визначити місце: ${reason}.`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (!picked || !picked.building.trim() || busy) return;
    setBusy(true);
    onNotice('Шукаємо в довіднику…');
    try {
      const official = await resolveOfficial(picked, streetId);
      if (!official) throw new Error('Адресу не знайдено в офіційному довіднику. Спробуйте пошук за вулицею.');
      const address: SavedAddress = {
        id: crypto.randomUUID?.() ?? `addr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        customName: name.trim() || `${official.streetName}, ${picked.building.trim()}`,
        ...official,
        buildingNumber: picked.building.trim(),
        lat: picked.lat,
        lon: picked.lon,
      };
      onSave(address);
      setPicked(null);
      setName('');
      setSheetOpen(true);
      onNotice('Адресу збережено.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Не вдалося зберегти адресу.');
    } finally {
      setBusy(false);
    }
  };

  const title = picked
    ? `${picked.road ?? 'Адреса'}${picked.building ? `, ${picked.building}` : ''}`
    : 'Пошук адреси';

  return (
    <div className="map-wrap picker">
      <div ref={container} className="map" aria-label="Карта" />
      <button type="button" className="map-gps" onClick={locate} disabled={locating} aria-label="Моє місце (GPS)" dangerouslySetInnerHTML={{ __html: GPS_ICON }} />

      {!picked && (
        <div className="map-hint" aria-hidden="true">Торкніться карти, щоб обрати будинок</div>
      )}

      <div className="search-bottom">
        <div className="search-bar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            id="map-search"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              if (picked) setPicked(null);
            }}
            placeholder="Вулиця, місто"
            aria-label="Пошук вулиці або міста"
          />
          {query && (
            <button type="button" className="search-clear" aria-label="Очистити пошук" onClick={clear}>×</button>
          )}
        </div>
        {!picked && hits.length === 0 && !noResults && (
          <div className="map-hint-dock" aria-hidden="true">Торкніться карти, щоб обрати будинок</div>
        )}
        {noResults && !picked && hits.length === 0 && (
          <div className="search-empty" role="status">Нічого не знайдено.</div>
        )}
        {hits.length > 0 && !picked && (
          <ul className="search-results">
            {hits.map((hit, index) => (
              <li key={index}>
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
                  {streetOptions.length > 0 && (
                    <div className="field">
                      <label htmlFor="map-street">Вулиця в довіднику</label>
                      <select id="map-street" value={streetId ?? streetOptions[0].id} onChange={event => setStreetId(Number(event.target.value))}>
                        {streetOptions.map(street => <option key={street.id} value={street.id}>{street.name}</option>)}
                      </select>
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
