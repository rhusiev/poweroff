import type { PlaceSnapshot } from '../lib/places';
import { DAY_MINUTES, WINDOW_MINUTES } from '../lib/status';
import { Button, EmptyState, PlaceCard, SkeletonCard } from '../components/UI';
import { stripSpans, subLine } from './format';

/** The place cards shared by the dashboard and the offline screen. */
export function PlaceList({ snapshots, minute, onOpen, onAdd }: {
  snapshots: PlaceSnapshot[];
  minute: number;
  onOpen?: (snapshot: PlaceSnapshot) => void;
  onAdd?: () => void;
}) {
  if (!snapshots.length) {
    return (
      <EmptyState
        title="Поки немає адрес"
        text="Додайте першу адресу, щоб бачити статус світла"
        action={onAdd && <Button variant="primary" onClick={onAdd}>Додати адресу</Button>}
      />
    );
  }
  return (
    <div className="dash-grid">
      {snapshots.map(snapshot => snapshot.pending ? <SkeletonCard key={snapshot.address.id} /> : (
        <PlaceCard
          key={snapshot.address.id}
          name={snapshot.address.customName}
          sub={subLine(snapshot.address, snapshot.group)}
          next={snapshot.dataKnown ? '' : snapshot.reason}
          status={snapshot.status}
          spans={stripSpans(snapshot)}
          now={minute}
          knownUntil={snapshot.tomorrowKnown ? WINDOW_MINUTES : DAY_MINUTES}
          stale={!snapshot.dataKnown}
          pinned={Boolean(snapshot.address.favorite)}
          onOpen={onOpen && (() => onOpen(snapshot))}
        />
      ))}
      {onAdd && <div className="dash-add"><Button onClick={onAdd}>+ Додати адресу</Button></div>}
    </div>
  );
}
