import L from 'leaflet';

/** Teardrop pin for a saved building, filled with its status color. */
export function savedPin(color: string) {
  return L.divIcon({
    className: 'map-pin saved',
    iconSize: [44, 44],
    iconAnchor: [22, 42],
    html: `<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <g transform="translate(7,3)">
        <path d="M15 2C8.4 2 3 7.4 3 14c0 8.6 12 22 12 22s12-13.4 12-22C27 7.4 21.6 2 15 2z"
          fill="${color}" stroke="var(--surface)" stroke-width="2" />
        <circle cx="15" cy="14" r="5" fill="var(--surface)" />
      </g>
    </svg>`,
  });
}

/** Concentric dot for the user's own position. */
export function youPin() {
  return L.divIcon({
    className: 'map-pin you',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="var(--primary)" opacity=".16" />
      <circle cx="18" cy="18" r="9" fill="var(--primary)" opacity=".28" />
      <circle cx="18" cy="18" r="5.5" fill="var(--primary)" stroke="var(--surface)" stroke-width="2.5" />
    </svg>`,
  });
}

/** Ring for the point being chosen in the add flow. */
export function pickedPin() {
  return L.divIcon({
    className: 'map-pin picked',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="var(--surface)" stroke="var(--primary)" stroke-width="3" />
      <circle cx="16" cy="16" r="4" fill="var(--primary)" />
    </svg>`,
  });
}


/** OpenStreetMap tiles need no key; a CSS filter keeps them quiet in both themes. */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const TILE_MAX_ZOOM = 19;
export const LVIV: [number, number] = [49.8397, 24.0297];
export const CITY_ZOOM = 13;
const LOCATE_ZOOM = 16;
const LOCATE_TIMEOUT_MS = 10 * 1000;

/** A Leaflet map with OSM tiles, attribution and the zoom control on the right. */
export function createMap(element: HTMLElement) {
  const map = L.map(element, { zoomControl: false }).setView(LVIV, CITY_ZOOM);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer(TILE_URL, { maxZoom: TILE_MAX_ZOOM, attribution: TILE_ATTRIBUTION }).addTo(map);
  return map;
}

function locateError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'дозвіл не надано';
  if (error.code === error.POSITION_UNAVAILABLE) return 'місцеположення недоступне';
  return 'час очікування вичерпано';
}

/**
 * Center the map on the user and mark the spot. `getMap` is read when the fix
 * arrives, so a map that closed meanwhile is left alone.
 */
export function locateUser(
  getMap: () => L.Map | null,
  marker: { current: L.Marker | null },
  onNotice: (text: string) => void,
  onDone: () => void,
) {
  const unavailable = !window.isSecureContext
    ? 'Геолокація працює лише через HTTPS'
    : !navigator.geolocation ? 'Геолокація недоступна у цьому браузері' : null;
  if (unavailable) {
    onDone();
    onNotice(unavailable);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    position => {
      onDone();
      const map = getMap();
      if (!map) return;
      const point: [number, number] = [position.coords.latitude, position.coords.longitude];
      map.setView(point, LOCATE_ZOOM);
      marker.current?.remove();
      marker.current = L.marker(point, { icon: youPin() }).addTo(map);
    },
    error => {
      onDone();
      onNotice(`Не вдалося визначити місце: ${locateError(error)}`);
    },
    { enableHighAccuracy: true, timeout: LOCATE_TIMEOUT_MS },
  );
}
