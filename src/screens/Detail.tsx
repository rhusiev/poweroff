import { useState } from 'react';
import type { PlaceSnapshot } from '../lib/places';
import { changeVerb, formatCountdown } from '../lib/status';
import { Button, DaySwitch, DayTimeline, EmptyState, Legend, PinIcon, StatusPill } from '../components/UI';
import { addrLine, daySpans, groupLabel } from './format';

export function Detail({ snapshot, minute, onRename, onTogglePin, onRemove, onBack }: {
  snapshot: PlaceSnapshot | null;
  minute: number;
  onRename: (id: string, name: string) => void;
  onTogglePin: (id: string) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
}) {
  const [day, setDay] = useState<0 | 1>(0);
  const [name, setName] = useState(snapshot?.address.customName ?? '');
  if (!snapshot) {
    return <EmptyState title="Місце не знайдено" text="Адресу видалено або дані недоступні" action={<Button onClick={onBack}>До списку</Button>} />;
  }
  const { address } = snapshot;
  const group = groupLabel(snapshot.group);
  return (
    <div className="card">
      <div className="row">
        <span className="grow addr">{address.favorite && <PinIcon size={16} />}{address.customName}</span>
        <button type="button" className="pinbtn" aria-pressed={Boolean(address.favorite)} aria-label={address.favorite ? 'Відкріпити' : 'Закріпити'} onClick={() => onTogglePin(address.id)}>
          <svg viewBox="0 0 24 24" fill={address.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 14v7" /></svg>
        </button>
      </div>
      <div className="sub">{group ? `${group} · ` : ''}{addrLine(address)}</div>
      <div className="detail-grid">
        <div className="detail-status">
          <div className="hero"><StatusPill status={snapshot.status} /></div>
          {snapshot.next && snapshot.nextIn !== null && (
            <div className="countdown-hero">
              <span className="label">{changeVerb(snapshot.status, snapshot.next)}</span>
              <span className="sep" aria-hidden="true" />
              <span className="big-count">{formatCountdown(snapshot.nextIn)}</span>
            </div>
          )}
          {!snapshot.dataKnown && <div className="next">{snapshot.reason}</div>}
          <DaySwitch day={day} onChange={setDay} />
          <DayTimeline spans={daySpans(snapshot, day)} now={minute} day={day} stale={!snapshot.dataKnown || (day === 1 && !snapshot.tomorrowKnown)} tall />
          <Legend />
        </div>
        <div className="detail-actions">
          <div className="field rename">
            <label htmlFor="rename">Назва</label>
            <input id="rename" value={name} onChange={event => setName(event.target.value)} />
          </div>
          <Button onClick={() => onRename(address.id, name)} disabled={!name.trim() || name.trim() === address.customName}>Зберегти</Button>
          <div className="btnrow">
            <Button onClick={() => onRemove(address.id)} variant="danger">Видалити</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
