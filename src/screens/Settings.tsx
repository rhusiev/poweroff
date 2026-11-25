import type { ReactNode } from 'react';
import type { Theme } from '../lib/storage';
import { Tabs, type TabOption } from '../components/UI';

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24" aria-hidden="true">{path}</svg>
);

const THEMES: TabOption<Theme>[] = [
  { value: 'light', label: <>{icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)}<span>Світла</span></> },
  { value: 'auto', label: <>{icon(<><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>)}<span>Системна</span></> },
  { value: 'dark', label: <>{icon(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />)}<span>Темна</span></> },
];

export function Settings({ theme, onTheme }: { theme: Theme; onTheme: (theme: Theme) => void }) {
  return (
    <div className="settings-grid">
      <div className="card">
        <div className="label card-title">Тема</div>
        <Tabs options={THEMES} value={theme} onChange={onTheme} label="Тема" className="view-tabs theme-tabs" />
      </div>
      <div className="card">
        <div className="label card-title">Про застосунок</div>
        <div className="caption">PowerOff Lviv</div>
        <div className="caption">Джерело даних: Львівобленерго. Час оновлення надходить від оператора.</div>
        <div className="caption">Карта й пошук адрес: OpenStreetMap та Nominatim. Запит надсилає координати або назву місця.</div>
      </div>
    </div>
  );
}
