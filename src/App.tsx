import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SavedAddress } from './api/types';
import { formatKyivStamp, parseOperatorDate } from './lib/kyivTime';
import { buildPlaceSnapshots, usePlaceData, type PlaceSnapshot } from './lib/places';
import { isSyncOld, type Status } from './lib/status';
import { loadCompare, saveCompare } from './lib/storage';
import { useOperatorData } from './hooks/useOperatorData';
import { usePlaces } from './hooks/usePlaces';
import { useTheme } from './hooks/useTheme';
import { Notice, type NoticeData } from './components/Notice';
import { SavedMap } from './components/SavedMap';
import { Back, Banner, Button, Nav, type NavId } from './components/UI';
import { AddPlace } from './screens/AddPlace';
import { COMPARE_MAX, Compare } from './screens/Compare';
import { Detail } from './screens/Detail';
import { Groups } from './screens/Groups';
import { PlaceList } from './screens/Places';
import { Settings } from './screens/Settings';

type View = NavId | 'detail' | 'add' | 'offline';

const TITLES: Record<View, string> = {
  dashboard: 'Головна',
  detail: 'Адреса',
  add: 'Додати адресу',
  groups: 'Черги ГПВ',
  compare: 'Порівняння',
  map: 'Мапа',
  settings: 'Налаштування',
  offline: 'Офлайн',
};

/** Dashboard order after pinned places: what affects the reader most comes first. */
const CARD_ORDER: Record<Status, number> = { purple: 0, red: 1, yellow: 2, green: 3, gray: 4 };

const orderCards = (snapshots: PlaceSnapshot[]) => [...snapshots].sort((a, b) =>
  Number(Boolean(b.address.favorite)) - Number(Boolean(a.address.favorite))
  || CARD_ORDER[a.status] - CARD_ORDER[b.status]);

interface Removal {
  id: number;
  address: SavedAddress;
  index: number;
  compareIndex: number;
}

const App = () => {
  const [view, setView] = useState<View>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useTheme();
  const [places, setPlaces] = usePlaces();
  const [compareIds, setCompareIds] = useState<string[]>(() => loadCompare() ?? []);
  const [removed, setRemoved] = useState<Removal | null>(null);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const noticeId = useRef(0);
  const dashScroll = useRef(0);
  const operator = useOperatorData();
  const { clock, now, lastSync } = operator;

  useEffect(() => { saveCompare(compareIds); }, [compareIds]);

  const placeData = usePlaceData(places, operator.placeToken);
  const snapshots = useMemo(
    () => buildPlaceSnapshots(places, placeData, operator.schedule, clock, lastSync, now),
    [places, placeData, operator.schedule, clock, lastSync, now],
  );
  // Ids deleted in another tab drop out here, so they never count toward the cap.
  const comparing = compareIds.filter(id => places.some(place => place.id === id));
  const statusKey = snapshots.map(snapshot => `${snapshot.address.id}:${snapshot.status}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const statuses = useMemo(() => Object.fromEntries(snapshots.map(s => [s.address.id, s.status])), [statusKey]);

  const offline = !operator.online || operator.failed;
  const synced = parseOperatorDate(lastSync);
  const syncText = synced ? `Дані від ${formatKyivStamp(synced, now)}` : '';
  const syncLabel = offline ? 'Офлайн' : syncText || 'Синхронізація';

  const showNotice = useCallback((text: string, duration?: number) => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, text, duration });
  }, []);

  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const go = useCallback((next: View) => {
    const current = viewRef.current;
    if (current === 'dashboard' && next !== 'dashboard') dashScroll.current = window.scrollY;
    // Back from a place returns to where the reader was on the dashboard.
    const y = next === 'dashboard' && current === 'detail' ? dashScroll.current : 0;
    setView(next);
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, []);

  const openPlace = useCallback((id: string) => {
    setSelectedId(id);
    go('detail');
  }, [go]);

  const addPlace = useCallback((address: SavedAddress) => {
    setPlaces(prev => [...prev, address]);
    openPlace(address.id);
  }, [setPlaces, openPlace]);

  const setCoords = useCallback((id: string, lat: number, lon: number) => {
    setPlaces(prev => prev.map(address => address.id === id ? { ...address, lat, lon } : address));
  }, [setPlaces]);

  const removePlace = (id: string) => {
    const index = places.findIndex(item => item.id === id);
    if (index === -1) return;
    // The undo toast takes priority over any notice already on screen.
    setNotice(null);
    noticeId.current += 1;
    setRemoved({ id: noticeId.current, address: places[index], index, compareIndex: compareIds.indexOf(id) });
    setPlaces(prev => prev.filter(item => item.id !== id));
    setCompareIds(prev => prev.filter(value => value !== id));
    go('dashboard');
  };

  const undoRemove = () => {
    if (!removed) return;
    const { address, index, compareIndex } = removed;
    const insert = <T,>(list: T[], at: number, item: T) => [...list.slice(0, at), item, ...list.slice(at)];
    setPlaces(prev => prev.some(item => item.id === address.id) ? prev : insert(prev, Math.min(index, prev.length), address));
    if (compareIndex !== -1) {
      setCompareIds(prev => prev.includes(address.id) ? prev : insert(prev, Math.min(compareIndex, prev.length), address.id));
    }
    setRemoved(null);
  };

  const renamePlace = (id: string, name: string) => {
    const value = name.trim();
    if (value) setPlaces(prev => prev.map(item => item.id === id ? { ...item, customName: value } : item));
  };

  const togglePin = (id: string) => {
    setPlaces(prev => prev.map(item => item.id === id ? { ...item, favorite: !item.favorite } : item));
  };

  const toggleCompare = (id: string) => {
    if (comparing.includes(id)) setCompareIds(comparing.filter(value => value !== id));
    else if (comparing.length >= COMPARE_MAX) showNotice('Можна порівняти до 4 адрес.');
    else setCompareIds([...comparing, id]);
  };

  const retry = async () => {
    const ok = await operator.refresh();
    if (ok && view === 'offline') go('dashboard');
  };

  const openAdd = () => go('add');
  const cards = orderCards(snapshots);
  const selected = snapshots.find(snapshot => snapshot.address.id === selectedId) ?? null;
  const syncOld = isSyncOld(lastSync, now);

  const retryBanner = (
    <Banner action={
      <span className="banner-actions">
        <button type="button" className="btn" onClick={retry} disabled={operator.refreshing}>Повторити спробу</button>
        {view !== 'offline' && <button type="button" className="btn" onClick={() => go('offline')}>В офлайн</button>}
      </span>
    }>
      Не вдалося отримати дані.
    </Banner>
  );

  const screens: Record<View, () => ReactNode> = {
    dashboard: () => (
      <>
        {offline ? retryBanner : syncOld && <Banner>Дані застаріли (понад 48 год).</Banner>}
        <PlaceList snapshots={cards} minute={clock.minute} onOpen={snapshot => openPlace(snapshot.address.id)} onAdd={openAdd} />
      </>
    ),
    detail: () => (
      <Detail key={selectedId} snapshot={selected} minute={clock.minute} onRename={renamePlace} onTogglePin={togglePin} onRemove={removePlace} onBack={() => go('dashboard')} />
    ),
    add: () => <AddPlace onSave={addPlace} onNotice={showNotice} />,
    groups: () => <Groups schedule={operator.schedule} clock={clock} lastSync={lastSync} now={now} />,
    compare: () => <Compare snapshots={snapshots} selected={comparing} minute={clock.minute} onToggle={toggleCompare} />,
    map: () => <SavedMap savedAddresses={places} statuses={statuses} onOpen={openPlace} onCoords={setCoords} onNotice={showNotice} />,
    settings: () => <Settings theme={theme} onTheme={setTheme} />,
    offline: () => (
      <>
        <div className="card">
          <p className="label">Показуємо останні дані. {syncText}</p>
          <Button variant="primary" onClick={retry} disabled={operator.refreshing}>Повторити спробу</Button>
        </div>
        <PlaceList snapshots={cards} minute={clock.minute} />
      </>
    ),
  };

  const activeNav: NavId = view === 'detail' || view === 'add' || view === 'offline' ? 'dashboard' : view;
  const loading = snapshots.some(snapshot => snapshot.pending);

  return (
    <div className="shell">
      <header className="topbar">
        {(view === 'detail' || view === 'add') && <Back onClick={() => go('dashboard')} />}
        <h1>{TITLES[view]}</h1>
        <div className="sync">{syncLabel}</div>
      </header>
      <main aria-busy={loading}>{screens[view]()}</main>

      {notice && !removed && <Notice key={notice.id} notice={notice} onDismiss={() => setNotice(null)} />}
      {removed && (
        <Notice
          key={removed.id}
          notice={{ id: removed.id, text: 'Адресу видалено', action: 'Скасувати', onAction: undoRemove }}
          onDismiss={() => setRemoved(null)}
        />
      )}

      <Nav active={activeNav} onNavigate={go} />
    </div>
  );
};

export default App;
