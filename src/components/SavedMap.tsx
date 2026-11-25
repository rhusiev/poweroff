import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SavedAddress } from '../api/types';
import { FROM_STATUS } from '../lib/statusLanguage';
import type { Status } from '../lib/status';
import { geocode, normalizeStreetName } from '../lib/geo';
import { GPS_ICON, TILE_ATTRIBUTION, TILE_URL, savedPin, youPin } from './mapIcons';

const LVIV: [number, number] = [49.8397, 24.0297];

/** Read-only map: saved places as status-colored markers. No search or add. */
export function SavedMap({
  savedAddresses,
  statusOf,
  onOpen,
  onCoords,
  onNotice,
}: {
  savedAddresses: SavedAddress[];
  statusOf: (id: string) => Status;
  onOpen: (id: string) => void;
  onCoords: (id: string, lat: number, lon: number) => void;
  onNotice: (text: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.LayerGroup | null>(null);
  const you = useRef<L.Marker | null>(null);
  const geocoded = useRef<Set<string>>(new Set());
  const fittedKey = useRef('');

  const markers = useMemo(
    () => savedAddresses.filter(address => address.lat != null && address.lon != null),
    [savedAddresses],
  );
  const unmapped = savedAddresses.length - markers.length;

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, { zoomControl: false }).setView(LVIV, 13);
    L.control.zoom({ position: 'topright' }).addTo(instance);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(instance);
    map.current = instance;
    group.current = L.layerGroup().addTo(instance);
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
      const key = FROM_STATUS[statusOf(address.id)];
      const color = `var(--${key})`;
      const marker = L.marker([address.lat!, address.lon!], { icon: savedPin(color) });
      marker.bindTooltip(address.customName).on('click', () => onOpen(address.id));
      marker.addTo(layer);
    });
    const key = markers.map(address => address.id).sort().join('|');
    if (markers.length > 0 && map.current && key !== fittedKey.current) {
      fittedKey.current = key;
      const bounds = L.latLngBounds(markers.map(address => [address.lat!, address.lon!] as [number, number]));
      if (markers.length === 1) {
        map.current.setView([markers[0].lat!, markers[0].lon!], 13);
      } else {
        map.current.fitBounds(bounds, { padding: [24, 24] as L.PointExpression, maxZoom: 13 });
      }
    }
  }, [markers, statusOf, onOpen]);

  useEffect(() => {
    let cancelled = false;
    const missing = savedAddresses.filter(address => address.lat == null || address.lon == null).slice(0, 8);
    const run = async () => {
      for (const address of missing) {
        if (cancelled || geocoded.current.has(address.id)) continue;
        geocoded.current.add(address.id);
        const street = normalizeStreetName(address.streetName);
        const results = await geocode(`${street}, ${address.buildingNumber}, ${address.cityName}`);
        if (cancelled) return;
        if (results[0]) onCoords(address.id, results[0].lat, results[0].lon);
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    };
    if (missing.length) run();
    return () => { cancelled = true; };
  }, [savedAddresses, onCoords]);

  const locate = () => {
    if (!map.current) return;
    if (!window.isSecureContext) {
      onNotice('Геолокація працює лише через HTTPS.');
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      position => {
        const point: [number, number] = [position.coords.latitude, position.coords.longitude];
        map.current?.setView(point, 16);
        you.current?.remove();
        you.current = L.marker(point, { icon: youPin() }).addTo(map.current!);
      },
      () => onNotice('Не вдалося визначити місце.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <>
      <div className="map-wrap">
        <div ref={container} className="map" aria-label="Мапа збережених адрес" />
        <button type="button" className="map-gps" onClick={locate} aria-label="Моє місце (GPS)" dangerouslySetInnerHTML={{ __html: GPS_ICON }} />
      </div>
      {unmapped > 0 && <p className="caption">{unmapped} адрес без координат</p>}
    </>
  );
}
