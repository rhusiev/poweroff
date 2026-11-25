import { useState } from 'react';
import type { SavedAddress } from '../api/types';
import { matchesDirectoryName, uniqueOfficialNames } from '../lib/directory';
import { newId } from '../lib/storage';
import { useDirectory } from '../hooks/useDirectory';
import { PickAddressMap } from '../components/MapView';
import { Banner, Button, Field, Tabs, type TabOption } from '../components/UI';

const STEPS = ['Громада', 'Місто', 'Вулиця', 'Будинок'];
const MAX_SUGGESTIONS = 100;
const DESKTOP_QUERY = '(min-width: 768px)';
type Mode = 'tree' | 'map';
const MODES: TabOption<Mode>[] = [{ value: 'tree', label: 'Довідник' }, { value: 'map', label: 'Карта' }];

function Steps({ step, onRewind }: { step: number; onRewind: (step: number) => void }) {
  return (
    <ol className="steps-flow" aria-label="Кроки">
      {STEPS.map((label, index) => {
        const number = index + 1;
        return (
          <li key={label}>
            {number < step
              ? <button type="button" className="step-chip done" onClick={() => onRewind(number)}>{label}</button>
              : <span className={`step-chip${number === step ? ' active' : ''}`} aria-current={number === step ? 'step' : undefined}>{label}</span>}
            {index < STEPS.length - 1 && <span className="step-arrow" aria-hidden="true">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Add a place from the official directory or from the map; on save the new place opens. */
export function AddPlace({ onSave, onNotice }: {
  onSave: (address: SavedAddress) => void;
  onNotice: (text: string, duration?: number) => void;
}) {
  const directory = useDirectory(true);
  const { otgs, cities, streets, otg, city, street } = directory;
  const [mode, setMode] = useState<Mode>('tree');
  const [search, setSearch] = useState('');
  const [building, setBuilding] = useState('');
  const [nickname, setNickname] = useState('');

  const step = street ? 4 : city ? 3 : otg ? 2 : 1;
  const options = uniqueOfficialNames(street ? [] : city ? streets : otg ? cities : otgs);
  const choose = (id: number) => {
    setSearch('');
    if (!otg) directory.setOtg(id);
    else if (!city) directory.setCity(id);
    else directory.setStreet(id);
    // Keep keyboard focus in the flow after the chosen row unmounts.
    // Desktop only: on a phone this would yank the reader back to the top.
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      requestAnimationFrame(() => (document.getElementById('search') ?? document.getElementById('building'))?.focus({ preventScroll: true }));
    }
  };
  const rewind = (target: number) => {
    setSearch('');
    if (target <= 1) directory.setOtg('');
    else if (target <= 2) directory.setCity('');
    else directory.setStreet('');
  };
  const save = () => {
    const otgItem = otgs.find(item => item.id === otg);
    const cityItem = cities.find(item => item.id === city);
    const streetItem = streets.find(item => item.id === street);
    const number = building.trim();
    if (!otgItem || !cityItem || !streetItem || !number) return;
    onSave({
      id: newId(),
      customName: nickname.trim() || `${streetItem.name}, ${number}`,
      otgId: otgItem.id,
      otgName: otgItem.name,
      cityId: cityItem.id,
      cityName: cityItem.name,
      streetId: streetItem.id,
      streetName: streetItem.name,
      buildingNumber: number,
    });
    onNotice('Адресу збережено.');
  };

  return (
    <>
      <Tabs options={MODES} value={mode} onChange={setMode} label="Спосіб додавання" className="view-tabs" />
      {mode === 'map' ? <PickAddressMap onSave={onSave} onNotice={onNotice} /> : (
        <div className="add-tree">
          <div className="add-search-sticky">
            <Steps step={step} onRewind={rewind} />
            {!street && <Field id="search" label="Пошук" value={search} onChange={setSearch} />}
          </div>
          {directory.failed && (
            <Banner action={<button type="button" className="btn" onClick={directory.retry}>Повторити спробу</button>}>
              Не вдалося завантажити довідник.
            </Banner>
          )}
          {street ? (
            <>
              <Field id="building" label="Будинок" value={building} onChange={value => setBuilding(value.toUpperCase())} placeholder="12, 12А" />
              <Field id="nickname" label="Назва (необов'язково)" value={nickname} onChange={setNickname} placeholder="Дім" />
              <Button variant="primary" onClick={save} disabled={!building.trim()}>Додати адресу</Button>
            </>
          ) : (
            <div className="suggestions">
              {options
                .filter(item => matchesDirectoryName(item.name, search))
                .slice(0, MAX_SUGGESTIONS)
                .map(item => <button type="button" key={item.id} onClick={() => choose(item.id)}>{item.name}</button>)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
