import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SavedAddress } from '../api/types';
import { FROM_STATUS } from '../lib/statusLanguage';
import type { Status } from '../lib/status';
import { geocode, normalizeStreetName } from '../lib/geo';
import { CITY_ZOOM, createMap, locateUser, savedPin } from './mapKit';
import { GpsButton } from './GpsButton';

const FIT_PADDING_PX = 24;
/** Places geocoded per visit; the geocoder queue spaces the requests out. */
const GEOCODE_BATCH = 8;

/** Text-only tooltip content: a place name is user input and must never become markup. */
const textNode = (text: string) => {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
};

/** Read-only map: saved places as status-colored markers. No search or add. */
export function SavedMap({
  savedAddresses,
  statuses,
  onOpen,
  onCoords,
  onNotice,
}: {
  savedAddresses: SavedAddress[];
  statuses: Record<string, Status>;
  onOpen: (id: string) => void;
  onCoords: (id: string, lat: number, lon: number) => void;
  onNotice: (text: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.LayerGroup | null>(null);
  const you = useRef<L.Marker | null>(null);
  const attempted = useRef<Set<string>>(new Set());
  const fittedKey = useRef('');
  const [locating, setLocating] = useState(false);

  const markers = useMemo(
    () => savedAddresses.filter(address => address.lat != null && address.lon != null),
    [savedAddresses],
  );
  const unmapped = savedAddresses.length - markers.length;

  useEffect(() => {
    if (!container.current) return;
    const instance = createMap(container.current);
    map.current = instance;
    group.current = L.layerGroup().addTo(instance);
    fittedKey.current = '';
    return () => {
      instance.remove();
      map.current = null;
      group.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = group.current;
    if (!layer) return;
    layer.clearLayers();
    markers.forEach(address => {
      const color = `var(--${FROM_STATUS[statuses[address.id] ?? 'gray']})`;
      L.marker([address.lat!, address.lon!], { icon: savedPin(color) })
        .bindTooltip(textNode(address.customName))
        .on('click', () => onOpen(address.id))
        .addTo(layer);
    });
    const key = markers.map(address => address.id).sort().join('|');
    if (!markers.length || !map.current || key === fittedKey.current) return;
    fittedKey.current = key;
    if (markers.length === 1) {
      map.current.setView([markers[0].lat!, markers[0].lon!], CITY_ZOOM);
    } else {
      const bounds = L.latLngBounds(markers.map(address => [address.lat!, address.lon!] as [number, number]));
      map.current.fitBounds(bounds, { padding: [FIT_PADDING_PX, FIT_PADDING_PX], maxZoom: CITY_ZOOM });
    }
  }, [markers, statuses, onOpen]);

  const missingKey = savedAddresses
    .filter(address => address.lat == null || address.lon == null)
    .map(address => address.id)
    .join('|');

  useEffect(() => {
    const controller = new AbortController();
    const missing = savedAddresses
      .filter(address => (address.lat == null || address.lon == null) && !attempted.current.has(address.id))
      .slice(0, GEOCODE_BATCH);
    const run = async () => {
      for (const address of missing) {
        const query = `${normalizeStreetName(address.streetName)}, ${address.buildingNumber}, ${address.cityName}`;
        try {
          const [hit] = await geocode(query, controller.signal);
          attempted.current.add(address.id);
          if (hit) onCoords(address.id, hit.lat, hit.lon);
        } catch {
          // Aborted or refused: the next visit tries again.
          return;
        }
      }
    };
    run();
    return () => controller.abort();
    // Only a change in which places lack coordinates starts a new batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, onCoords]);

  const locate = () => {
    setLocating(true);
    locateUser(() => map.current, you, onNotice, () => setLocating(false));
  };

  return (
    <>
      <div className="map-wrap">
        <div ref={container} className="map" aria-label="Мапа збережених адрес" />
        <GpsButton onClick={locate} busy={locating} />
      </div>
      {unmapped > 0 && <p className="caption">{unmapped} адрес без координат</p>}
    </>
  );
}
