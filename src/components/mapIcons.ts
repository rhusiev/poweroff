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

export const GPS_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
  <circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
</svg>`;

/** OpenStreetMap tiles need no key; a CSS filter keeps them quiet in both themes. */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
