import type { BuildingGroup } from '../api/client';
import type { SavedAddress } from '../api/types';
import type { PlaceSnapshot } from '../lib/places';
import { DAY_MINUTES, type StatusWindow } from '../lib/status';
import { FROM_STATUS, type Span } from '../components/UI';

export const spansFrom = (windows: StatusWindow[]): Span[] =>
  windows.map(window => ({ start: window.start, end: window.end, kind: FROM_STATUS[window.status], open: window.open }));

/** An unpublished tomorrow has no information, so its band stays empty and gray. */
export const daySpans = (snapshot: PlaceSnapshot, day: 0 | 1): Span[] =>
  day === 1 && !snapshot.tomorrowKnown ? [] : spansFrom(snapshot.windows);

/** The 48-hour strip with an unpublished tomorrow left empty. */
export const stripSpans = (snapshot: PlaceSnapshot): Span[] =>
  spansFrom(snapshot.tomorrowKnown ? snapshot.windows : snapshot.windows.filter(window => window.start < DAY_MINUTES));

/** «Без черги» only for the official «Не входить»; an unknown group prints nothing. */
export const groupLabel = (group: BuildingGroup) =>
  group === undefined ? '' : group ? `Черга ${group}` : 'Без черги';

export const subLine = (address: SavedAddress, group: BuildingGroup) => {
  const label = groupLabel(group);
  const place = `${address.streetName}, ${address.buildingNumber}`;
  return label ? `${label} · ${place}` : place;
};

export const addrLine = (address: SavedAddress) =>
  `${address.cityName}, вул. ${address.streetName}, буд. ${address.buildingNumber}`;
