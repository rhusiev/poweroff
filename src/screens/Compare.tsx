import { useState } from 'react';
import type { PlaceSnapshot } from '../lib/places';
import { DaySwitch, DayTimeline } from '../components/UI';
import { daySpans, groupLabel } from './format';

export const COMPARE_MAX = 4;
const COMPARE_MIN = 2;

export function Compare({ snapshots, selected, minute, onToggle }: {
  snapshots: PlaceSnapshot[];
  selected: string[];
  minute: number;
  onToggle: (id: string) => void;
}) {
  const [day, setDay] = useState<0 | 1>(0);
  const chosen = snapshots.filter(snapshot => selected.includes(snapshot.address.id));
  const hint = selected.length < COMPARE_MIN
    ? 'Оберіть 2–4 адреси.'
    : selected.length >= COMPARE_MAX ? 'Обрано максимум: 4 адреси.' : '';
  return (
    <div className="compare-layout">
      <div className="compare-pick">
        <ul className="checklist">
          {snapshots.map(snapshot => (
            <li key={snapshot.address.id}>
              <label>
                <span className="box">
                  <input type="checkbox" checked={selected.includes(snapshot.address.id)} onChange={() => onToggle(snapshot.address.id)} />
                  <span className="cb" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6" /></svg></span>
                </span>
                {snapshot.address.customName}
              </label>
            </li>
          ))}
        </ul>
        {hint && <div className="label compare-hint" role="status">{hint}</div>}
      </div>
      <div className="compare-results">
        <DaySwitch day={day} onChange={setDay} />
        {chosen.map(snapshot => (
          <div className="card" key={snapshot.address.id}>
            <div className="row">
              <span className="grow addr">{snapshot.address.customName}</span>
              <span className="label">{groupLabel(snapshot.group)}</span>
            </div>
            <DayTimeline spans={daySpans(snapshot, day)} now={minute} day={day} stale={!snapshot.dataKnown || (day === 1 && !snapshot.tomorrowKnown)} tall />
          </div>
        ))}
      </div>
    </div>
  );
}
