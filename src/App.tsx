import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from './api/client';
import type { City, GpvSchedule, OTG, SavedAddress, Street } from './api/types';
import { buildPlaceSnapshots, usePlaceData, type PlaceSnapshot } from './lib/places';
import { matchesDirectoryName, uniqueOfficialNames } from './lib/directory';
import { SavedMap } from './components/SavedMap';
import { Notice } from './components/Notice';
import { PickAddressMap } from './components/MapView';
import {
  buildSegments,
  buildWindows,
  formatClock,
  formatCountdown,
  isSyncOld,
  statusAt,
  type Status,
  type StatusWindow,
} from './lib/status';
import {
  Banner,
  Button,
  DaySwitch,
  DayTimeline,
  EmptyState,
  Field,
  Legend,
  Nav,
  PlaceCard,
  StatusPill,
  FROM_STATUS,
  type NavId,
  type Span,
} from './components/UI';

type View = NavId | 'detail' | 'add' | 'offline';
type Theme = 'light' | 'dark' | 'auto';

const formatDayKey = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
};

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `addr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Read a name from either a plain string or a nested object with a `name`. */
const nameOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') {
    return (value as { name: string }).name;
  }
  return '';
};

/**
 * Load saved places without dropping records when the stored shape changes.
 * Every record with an id is kept; missing fields are backfilled so an older
 * shape still renders instead of being silently discarded on upgrade.
 */
function loadPlaces(raw?: string | null): SavedAddress[] {
  try {
    const saved = raw === undefined ? localStorage.getItem('po:places') : raw;
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
      .map(item => ({
        id: item.id as string,
        customName: typeof item.customName === 'string' && item.customName
          ? item.customName
          : typeof item.name === 'string' && item.name ? item.name : 'Адреса',
        favorite: Boolean(item.favorite),
        otgId: Number(item.otgId) || 0,
        otgName: nameOf(item.otgName) || nameOf(item.otg),
        cityId: Number(item.cityId) || 0,
        cityName: nameOf(item.cityName) || nameOf(item.city),
        streetId: Number(item.streetId) || 0,
        streetName: nameOf(item.streetName) || nameOf(item.street),
        buildingNumber: typeof item.buildingNumber === 'string'
          ? item.buildingNumber
          : typeof item.number === 'string' ? item.number : '',
        lat: typeof item.lat === 'number' ? item.lat : undefined,
        lon: typeof item.lon === 'number' ? item.lon : undefined,
      }));
  } catch {
    return [];
  }
}

const spansFrom = (windows: StatusWindow[]): Span[] =>
  windows.map(window => ({
    start: window.start,
    end: window.end,
    kind: FROM_STATUS[window.status],
    open: window.open,
  }));

/** An unpublished tomorrow has no information, so its day band stays empty and gray. */
const daySpans = (snapshot: PlaceSnapshot, day: 0 | 1): Span[] =>
  day === 1 && !snapshot.tomorrowKnown ? [] : spansFrom(snapshot.windows);

const groupLabel = (group: string | null | undefined) =>
  group === undefined ? '' : group ? `Черга ${group}` : 'Без черги';
const subLine = (address: SavedAddress, group: string | null | undefined) => {
  const label = groupLabel(group);
  return label ? `${label} · ${address.streetName}, ${address.buildingNumber}` : `${address.streetName}, ${address.buildingNumber}`;
};
const addrLine = (address: SavedAddress) =>
  `${address.cityName}, вул. ${address.streetName}, буд. ${address.buildingNumber}`;

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="back" aria-label="Назад" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
  );
}

const App = () => {
  const [view, setView] = useState<View>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('po:theme');
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
  });
  const [offlineSim, setOfflineSim] = useState(!navigator.onLine);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const dashScrollRef = useRef(0);

  useEffect(() => {
    const apply = () => {
      const resolved = theme === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#101315' : '#F6F7F8');
    };
    apply();
    localStorage.setItem('po:theme', theme);
    if (theme !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const [places, setPlaces] = useState<SavedAddress[]>(loadPlaces);
  const [compareIds, setCompareIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('po:compare');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* ignore malformed value */ }
    return places.slice(0, 2).map(item => item.id);
  });
  const [removed, setRemoved] = useState<{ address: SavedAddress; index: number; compareIndex: number } | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string; action?: string; onAction?: () => void; duration?: number } | null>(null);
  const noticeId = useRef(0);
  const undoTimer = useRef<number | null>(null);

  const persist = (key: string, value: unknown) => {
    try { localStorage.setItem(`po:${key}`, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
  };

  useEffect(() => { persist('places', places); }, [places]);
  useEffect(() => { persist('compare', compareIds); }, [compareIds]);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'po:places' || !event.newValue) return;
      setPlaces(prev => (JSON.stringify(prev) === event.newValue ? prev : loadPlaces(event.newValue)));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const [otgs, setOtgs] = useState<OTG[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [streets, setStreets] = useState<Street[]>([]);
  const [otg, setOtg] = useState<number | ''>('');
  const [city, setCity] = useState<number | ''>('');
  const [street, setStreet] = useState<number | ''>('');
  const [building, setBuilding] = useState('');
  const [nickname, setNickname] = useState('');
  const [streetSearch, setStreetSearch] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [addMode, setAddMode] = useState<'tree' | 'map'>('tree');

  useEffect(() => {
    if (!otg) return;
    apiClient.getCities(otg).then(items => {
      setCities(items.sort((a, b) => a.name.localeCompare(b.name)));
      setCity(''); setStreet('');
    }).catch(console.error);
  }, [otg]);

  useEffect(() => {
    if (!city) return;
    apiClient.getStreets(city).then(items => {
      setStreets(items.sort((a, b) => a.name.localeCompare(b.name)));
      setStreet('');
    }).catch(console.error);
  }, [city]);

  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([apiClient.getOTGs(), apiClient.getLastSync()]).then(([otgResult, syncResult]) => {
      if (otgResult.status === 'fulfilled') setOtgs(otgResult.value.sort((a, b) => a.name.localeCompare(b.name)));
      if (syncResult.status === 'fulfilled') setLastSync(syncResult.value);
      setInitialized(true);
    });
  }, []);

  const [gpvSchedule, setGpvSchedule] = useState<GpvSchedule | null>(null);
  const [todayKey, setTodayKey] = useState(formatDayKey);
  const [now, setNow] = useState(() => new Date());

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const [schedule, sync] = await Promise.all([apiClient.getGpvSchedule(), apiClient.getLastSync()]);
      if (schedule) setGpvSchedule(schedule);
      if (sync) { setLastSync(sync); persist('lastSync', sync); }
      setRefreshError(false);
      setOfflineSim(false);
      setDataVersion(version => version + 1);
      // Navigate only after success; stay in place on failure.
      if (view !== 'dashboard') go('dashboard');
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [schedule, sync] = await Promise.all([apiClient.getGpvSchedule(), apiClient.getLastSync()]);
        if (schedule) setGpvSchedule(schedule);
        if (sync) { setLastSync(sync); persist('lastSync', sync); }
        setRefreshError(false);
        setDataVersion(version => version + 1);
      } catch {
        setRefreshError(true);
      }
    };
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onOffline = () => { setOfflineSim(true); setRefreshError(true); };
    const onOnline = () => { setOfflineSim(false); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
      setTodayKey(formatDayKey());
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const tomorrowKey = useMemo(() => {
    const [day, month, year] = todayKey.split('.').map(Number);
    return formatDayKey(new Date(year, month - 1, day + 1));
  }, [todayKey]);

  const todayStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const currentMinute = Math.floor((now.getTime() - todayStart.getTime()) / 60000);
  const stale = isSyncOld(lastSync, now) || offlineSim;
  // No data only when there is no usable cached schedule. Offline alone keeps
  // last known lines and timelines; the banner and Офлайн badge show staleness.
  const scheduleMissing = !gpvSchedule || gpvSchedule.today?.date !== todayKey;
  const tomorrowMissing = !gpvSchedule || gpvSchedule.tomorrow?.date !== tomorrowKey;
  const unknown = isSyncOld(lastSync, now) || scheduleMissing;
  const placeData = usePlaceData(places, dataVersion);
  const snapshots = useMemo(
    () => buildPlaceSnapshots(places, placeData, gpvSchedule, todayKey, tomorrowKey, lastSync, now),
    [places, placeData, gpvSchedule, todayKey, tomorrowKey, lastSync, now],
  );
  const selected = snapshots.find(snapshot => snapshot.address.id === selectedId) ?? null;

  const syncLabel = offlineSim || refreshError ? 'Офлайн' : lastSync ? `Дані від ${formatClock(Math.floor((new Date(lastSync.replace(/Z|[+-]\d{2}:\d{2}$/, '')).getTime() - todayStart.getTime()) / 60000), todayStart)}` : 'Синхронізація';

  const go = (next: View) => {
    if (view === 'dashboard' && next !== 'dashboard') dashScrollRef.current = window.scrollY;
    setView(next);
    if (next === 'dashboard' && view === 'detail' && dashScrollRef.current > 0) {
      const y = dashScrollRef.current;
      requestAnimationFrame(() => window.scrollTo(0, y));
    } else {
      window.scrollTo(0, 0);
    }
  };

  const openPlace = (address: SavedAddress) => {
    setSelectedId(address.id);
    setRenameValue(address.customName);
    go('detail');
  };

  const openAdd = () => {
    setOtg(''); setCity(''); setStreet(''); setBuilding(''); setNickname(''); setStreetSearch(''); setAddMode('tree');
    go('add');
  };

  const savePlace = () => {
    if (!otg || !city || !street || !building) return;
    const otgItem = otgs.find(item => item.id === otg);
    const cityItem = cities.find(item => item.id === city);
    const streetItem = streets.find(item => item.id === street);
    if (!otgItem || !cityItem || !streetItem) return;
    const address: SavedAddress = {
      id: newId(),
      customName: nickname.trim() || `${streetItem.name}, ${building}`,
      otgId: otgItem.id,
      otgName: otgItem.name,
      cityId: cityItem.id,
      cityName: cityItem.name,
      streetId: streetItem.id,
      streetName: streetItem.name,
      buildingNumber: building,
    };
    setPlaces(prev => [...prev, address]);
    openPlace(address);
    showNotice('Адресу збережено.');
    setBuilding('');
    setNickname('');
    setOtg('');
    setCity('');
    setStreet('');
  };

  const removePlace = (id: string) => {
    const index = places.findIndex(item => item.id === id);
    if (index === -1) return;
    // The undo toast takes priority over any informational notice already on screen.
    setNotice(null);
    setRemoved({ address: places[index], index, compareIndex: compareIds.indexOf(id) });
    setPlaces(prev => prev.filter(item => item.id !== id));
    setCompareIds(prev => prev.filter(value => value !== id));
    setView('dashboard');
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => { setRemoved(null); undoTimer.current = null; }, 6000);
  };

  const showNotice = (text: string, action?: string, onAction?: () => void, duration?: number) => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, text, action, onAction, duration });
  };

  const noticeFromMap = (text: string, duration?: number) => showNotice(text, undefined, undefined, duration);

  const undoRemove = () => {
    if (!removed) return;
    const { address, index, compareIndex } = removed;
    setPlaces(prev => {
      if (prev.some(item => item.id === address.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, address);
      return next;
    });
    if (compareIndex !== -1) {
      setCompareIds(prev => {
        if (prev.includes(address.id)) return prev;
        const next = [...prev];
        next.splice(Math.min(compareIndex, next.length), 0, address.id);
        return next;
      });
    }
    setRemoved(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  };

  const renamePlace = (id: string, name: string) => {
    const value = name.trim();
    if (value) setPlaces(prev => prev.map(item => item.id === id ? { ...item, customName: value } : item));
  };

  const togglePin = (id: string) => {
    setPlaces(prev => prev.map(item => item.id === id ? { ...item, favorite: !item.favorite } : item));
  };

  const orderedPlaces = [...snapshots].sort((a, b) => {
    if (Boolean(b.address.favorite) !== Boolean(a.address.favorite)) return Number(Boolean(b.address.favorite)) - Number(Boolean(a.address.favorite));
    const severity: Record<Status, number> = { purple: 0, yellow: 1, red: 2, green: 3, gray: 4 };
    return severity[a.status] - severity[b.status];
  });

  const title = view === 'dashboard' ? 'Головна'
    : view === 'detail' ? 'Адреса'
      : view === 'add' ? 'Додати адресу'
        : view === 'groups' ? 'Черги ГПВ'
          : view === 'compare' ? 'Порівняння'
            : view === 'map' ? 'Мапа'
              : view === 'settings' ? 'Налаштування' : 'Офлайн';
  const activeNav: NavId = view === 'detail' || view === 'add' || view === 'offline' ? 'dashboard' : view;

  const renderScreen = () => {
    switch (view) {
      case 'dashboard':
        return (
          <>
            {stale && !refreshError && !offlineSim && <Banner>Дані застаріли (понад 48 год).</Banner>}
            {refreshError && (
              <Banner action={
                <span className="banner-actions">
                  <button type="button" className="btn" onClick={refresh} disabled={refreshing}>Повторити спробу</button>
                  <button type="button" className="btn" onClick={() => go('offline')}>В офлайн</button>
                </span>
              }>
                Не вдалося оновити дані.
              </Banner>
            )}
            {loading && places.length === 0 && <><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></>}
            {!loading && orderedPlaces.length === 0 ? (
              <EmptyState
                title="Поки немає адрес"
                text="Додайте першу адресу, щоб бачити статус світла."
                action={<Button variant="primary" onClick={openAdd}>Додати адресу</Button>}
              />
            ) : (
              <div className="dash-grid">
                {orderedPlaces.map(snapshot => {
                  const pinned = Boolean(snapshot.address.favorite);
                  const sub = subLine(snapshot.address, snapshot.group);
                  const noData = unknown || !snapshot.dataKnown;
                  return (
                    <PlaceCard
                      key={snapshot.address.id}
                      name={snapshot.address.customName}
                      sub={sub}
                      next={noData ? snapshot.reason : ''}
                      status={snapshot.status}
                      spans={spansFrom(snapshot.windows)}
                      now={currentMinute}
                      stale={unknown || !snapshot.dataKnown}
                      pinned={pinned}
                      onClick={() => { setSelectedId(snapshot.address.id); setRenameValue(snapshot.address.customName); go('detail'); }}
                    />
                  );
                })}
                <div style={{ marginTop: 12 }}><Button onClick={openAdd}>+ Додати адресу</Button></div>
              </div>
            )}
          </>
        );
      case 'detail':
        if (!selected) return <EmptyState title="Місце не знайдено" text="Адресу видалено або дані недоступні." action={<Button onClick={() => go('dashboard')}>До списку</Button>} />;
        return (
          <div className="card detail-card">
              <div className="row">
                <span className="grow addr">
                  {selected.address.favorite && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="Закріплено" style={{ verticalAlign: '-3px', marginRight: 6 }}><path d="M14 2 22 10l-6 1-3 7-2-8-7-3 10-5z" /></svg>
                  )}
                  {selected.address.customName}
                </span>
                <button type="button" className="pinbtn" aria-pressed={Boolean(selected.address.favorite)} aria-label={selected.address.favorite ? 'Відкріпити' : 'Закріпити'} onClick={() => togglePin(selected.address.id)}>
                  <svg viewBox="0 0 24 24" fill={selected.address.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 14v7" /></svg>
                </button>
              </div>
              <div className="sub">{groupLabel(selected.group) ? `${groupLabel(selected.group)} · ` : ''}{addrLine(selected.address)}</div>
              <div className="detail-grid">
                <div className="detail-status">
                  <div className="hero"><StatusPill status={selected.status} /></div>
                  {!unknown && selected.next && (
                    <div className="countdown-hero">
                      <span className="label">{selected.status === 'green' ? 'До відключення' : 'До повернення'}</span>
                      <span className="sep" aria-hidden="true" />
                      <span className="big-count">{formatCountdown(selected.next.minute - currentMinute)}</span>
                    </div>
                  )}
                  {unknown && <div className="next">{selected.reason}</div>}
                  <DaySwitch day={detailDay} onChange={setDetailDay} />
                  <DayTimeline spans={daySpans(selected, detailDay)} now={currentMinute} day={detailDay} stale={unknown || !selected.dataKnown || (detailDay === 1 && !selected.tomorrowKnown)} tall />
                  <Legend />
                </div>
                <div className="detail-actions">
                  <div className="field" style={{ marginTop: 16 }}>
                    <label htmlFor="rename">Назва</label>
                    <input id="rename" key={selected.address.id} defaultValue={selected.address.customName} onChange={event => setRenameValue(event.target.value)} />
                  </div>
                  <Button onClick={() => renamePlace(selected.address.id, renameValue)}>Зберегти</Button>
                  <div className="btnrow">
                    <Button onClick={() => removePlace(selected.address.id)} variant="danger">Видалити</Button>
                  </div>
                </div>
              </div>
            </div>
        );
      case 'add': {
        const rawOptions = street ? [] : city ? streets : otg ? cities : otgs;
        const options = uniqueOfficialNames(rawOptions);
        const choose = (id: number) => {
          setStreetSearch('');
          if (!otg) setOtg(id);
          else if (!city) setCity(id);
          else setStreet(id);
          // Keep keyboard focus in the flow after the chosen row unmounts.
          // Desktop only: on phone this would yank the reader back to the top.
          if (window.matchMedia('(min-width: 768px)').matches) {
            requestAnimationFrame(() => {
              (document.getElementById('search') ?? document.getElementById('building'))?.focus({ preventScroll: true });
            });
          }
        };
        const step = street ? 4 : city ? 3 : otg ? 2 : 1;
        const rewindTo = (targetStep: number) => {
          setStreetSearch('');
          if (targetStep <= 1) { setOtg(''); setCity(''); setStreet(''); }
          else if (targetStep <= 2) { setCity(''); setStreet(''); }
          else { setStreet(''); }
        };
        return (
          <>
            <div className="view-tabs">
              <button type="button" aria-current={addMode === 'tree'} onClick={() => setAddMode('tree')}>Довідник</button>
              <button type="button" aria-current={addMode === 'map'} onClick={() => setAddMode('map')}>Карта</button>
            </div>
            <div className="add-tree">
              {(!addMode || addMode === 'tree') && (
                <div className="add-search-sticky">
                  <div className="steps-flow">
                    {['Громада', 'Місто', 'Вулиця', 'Будинок'].map((label, index) => {
                      const stepNum = index + 1;
                      const completed = stepNum < step;
                      const active = stepNum === step;
                      return (
                        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {completed
                            ? <button type="button" className="step-chip" onClick={() => rewindTo(stepNum)}>{label}</button>
                            : <span className={`step-chip${active ? ' active' : ''}`}>{label}</span>}
                          {index < 3 && <span className="step-arrow">→</span>}
                        </span>
                      );
                    })}
                  </div>
                  {!street && <Field id="search" label="Пошук" value={streetSearch} onChange={setStreetSearch} />}
                </div>
              )}
              {(!addMode || addMode === 'tree') && !street && (
                <>
                  <div className="suggestions">
                    {options
                      .filter(item => matchesDirectoryName(item.name, streetSearch))
                      .slice(0, 100)
                      .map(item => (
                        <button type="button" key={item.id} onClick={() => choose(item.id)}>{item.name}</button>
                      ))}
                  </div>
                </>
              )}
              {(!addMode || addMode === 'tree') && street && (
                <>
                  <Field id="building" label="Будинок" value={building} onChange={value => setBuilding(value.toUpperCase())} placeholder="12, 12А" />
                  <Field id="nickname" label="Назва (необов'язково)" value={nickname} onChange={setNickname} placeholder="Дім" />
                  <Button variant="primary" onClick={savePlace} disabled={!building}>Додати адресу</Button>
                </>
              )}
            </div>
            {addMode === 'map' && (
              <PickAddressMap
                onSave={address => { setPlaces(prev => [...prev, address]); openPlace(address); }}
                onNotice={noticeFromMap}
              />
            )}
          </>
        );
      }
      case 'groups': {
        const todayWindows = gpvSchedule?.today?.date === todayKey ? gpvSchedule.today.groups[explorerGroup] ?? [] : [];
        const tomorrowWindows = gpvSchedule?.tomorrow?.date === tomorrowKey ? gpvSchedule.tomorrow.groups[explorerGroup] ?? [] : [];
        const windows = buildWindows([], todayWindows, tomorrowWindows, false, todayStart);
        const segments = buildSegments([], todayWindows, tomorrowWindows, false, todayStart);
        const status: Status = scheduleMissing ? 'gray' : statusAt(segments, currentMinute);
        return (
          <div className="groups-layout">
            <div className="groupgrid">
              {Array.from({ length: 6 }, (_, row) => Array.from({ length: 2 }, (_, col) => `${row + 1}.${col + 1}`)).flat().map(value => (
                <button type="button" key={value} aria-pressed={value === explorerGroup} onClick={() => setExplorerGroup(value)}>{value}</button>
              ))}
            </div>
            <div className="card">
              <div className="addr" style={{ fontWeight: 700 }}>Черга {explorerGroup}</div>
              <div className="hero"><StatusPill status={status} /></div>
              <DaySwitch day={groupsDay} onChange={setGroupsDay} />
              <DayTimeline spans={groupsDay === 1 && tomorrowMissing ? [] : spansFrom(windows)} now={currentMinute} day={groupsDay} stale={scheduleMissing || (groupsDay === 1 && tomorrowMissing)} tall />
              <Legend />
            </div>
          </div>
        );
      }
      case 'compare': {
        const selectedPlaces = snapshots.filter(snapshot => compareIds.includes(snapshot.address.id));
        return (
          <div className="compare-layout">
            <div className="compare-pick">
              <ul className="checklist">
                {snapshots.map(snapshot => (
                  <li key={snapshot.address.id}>
                    <label>
                      <span className="box">
                        <input
                          type="checkbox"
                          checked={compareIds.includes(snapshot.address.id)}
                          onChange={() => {
                            if (compareIds.includes(snapshot.address.id)) setCompareIds(prev => prev.filter(id => id !== snapshot.address.id));
                            else if (compareIds.length >= 4) showNotice('Можна порівняти до 4 адрес.');
                            else setCompareIds(prev => [...prev, snapshot.address.id]);
                          }}
                        />
                        <span className="cb" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6" /></svg></span>
                      </span>
                      {snapshot.address.customName}
                    </label>
                  </li>
                ))}
              </ul>
              {compareIds.length > 0 && (compareIds.length < 2 || compareIds.length >= 4) && <div className="label" style={{ marginTop: 12 }}>Оберіть 2–4 адреси.</div>}
            </div>
            <div className="compare-results">
              <DaySwitch day={compareDay} onChange={setCompareDay} />
              {compareIds.length === 0 && <div className="label" style={{ marginTop: 12 }}>Оберіть 2–4 адреси.</div>}
              {selectedPlaces.map(snapshot => (
                <div className="card" key={snapshot.address.id}>
                  <div className="row">
                    <span className="grow addr">{snapshot.address.customName}</span>
                    <span className="label">{groupLabel(snapshot.group)}</span>
                  </div>
                  <DayTimeline spans={daySpans(snapshot, compareDay)} now={currentMinute} day={compareDay} stale={unknown || !snapshot.dataKnown || (compareDay === 1 && !snapshot.tomorrowKnown)} tall />
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'map':
        return (
          <SavedMap
            savedAddresses={places}
            statusOf={id => snapshots.find(snapshot => snapshot.address.id === id)?.status ?? 'gray'}
            onOpen={id => { const place = places.find(item => item.id === id); setSelectedId(id); setRenameValue(place?.customName ?? ''); go('detail'); }}
            onCoords={(id, lat, lon) => setPlaces(prev => prev.map(address => address.id === id ? { ...address, lat, lon } : address))}
            onNotice={text => showNotice(text)}
          />
        );
      case 'settings':
        return (
          <div className="settings-grid">
            <div className="card">
              <div className="label" style={{ marginBottom: 8 }}>Тема</div>
              <div className="view-tabs theme-tabs" role="tablist" aria-label="Тема">
                <button type="button" role="tab" aria-selected={theme === 'light'} onClick={() => setTheme('light')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                  <span>Світла</span>
                </button>
                <button type="button" role="tab" aria-selected={theme === 'auto'} onClick={() => setTheme('auto')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                  <span>Системна</span>
                </button>
                <button type="button" role="tab" aria-selected={theme === 'dark'} onClick={() => setTheme('dark')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></svg>
                  <span>Темна</span>
                </button>
              </div>
            </div>
            <div className="card">
              <div className="label" style={{ marginBottom: 8 }}>Про застосунок</div>
              <div className="caption">PowerOff Lviv</div>
              <div className="caption">Джерело даних: Львівобленерго. Час оновлення надходить від оператора.</div>
              <div className="caption">Карта й пошук адрес: OpenStreetMap та Nominatim. Запит надсилає координати або назву місця.</div>
            </div>
          </div>
        );
      case 'offline':
        return (
          <>
            <div className="card">
              <p className="label">Показуємо останні дані. {lastSync ? `Дані від ${formatClock(Math.floor((new Date(lastSync.replace(/Z|[+-]\d{2}:\d{2}$/, '')).getTime() - todayStart.getTime()) / 60000), todayStart)}` : ''}</p>
              <Button variant="primary" onClick={refresh} disabled={refreshing}>Повторити спробу</Button>
            </div>
            <div className="dash-grid">
              {orderedPlaces.map(snapshot => (
                <PlaceCard key={snapshot.address.id} name={snapshot.address.customName} sub={subLine(snapshot.address, snapshot.group)} next={unknown || !snapshot.dataKnown ? snapshot.reason : ''} status={snapshot.status} spans={spansFrom(snapshot.windows)} now={currentMinute} stale={unknown || !snapshot.dataKnown} pinned={Boolean(snapshot.address.favorite)} onClick={() => undefined} />
              ))}
            </div>
          </>
        );
    }
  };

  const [explorerGroup, setExplorerGroup] = useState('2.1');
  const [groupsDay, setGroupsDay] = useState<0 | 1>(0);
  const [detailDay, setDetailDay] = useState<0 | 1>(0);
  const [compareDay, setCompareDay] = useState<0 | 1>(0);
  const loading = !initialized;

  return (
    <div className="shell">
      <header className="topbar">
        {(view === 'detail' || view === 'add') && <Back onClick={() => go('dashboard')} />}
        <h1>{title}</h1>
        <div className="sync">{syncLabel}</div>
      </header>
      <main>{renderScreen()}</main>

      {notice && !removed && <Notice key={notice.id} notice={notice} onDismiss={() => setNotice(null)} />}
      {removed && (
        <Notice
          key={-1}
          notice={{ id: -1, text: 'Адресу видалено', action: 'Скасувати', onAction: undoRemove, duration: 6000 }}
          onDismiss={() => setRemoved(null)}
        />
      )}

      <Nav active={activeNav} onNavigate={id => { if (id === 'settings') setOfflineSim(false); go(id); }} />
    </div>
  );
};

export default App;
