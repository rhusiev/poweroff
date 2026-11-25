import { useState } from 'react';
import type { GpvSchedule } from '../api/types';
import type { KyivClock } from '../lib/kyivTime';
import { GPV_GROUPS } from '../lib/groups';
import { groupSnapshot } from '../lib/places';
import { DaySwitch, DayTimeline, Legend, StatusPill } from '../components/UI';
import { spansFrom } from './format';

const DEFAULT_GROUP = '2.1';

export function Groups({ schedule, clock, lastSync, now }: {
  schedule: GpvSchedule | null;
  clock: KyivClock;
  lastSync: string | null;
  now: Date;
}) {
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const [day, setDay] = useState<0 | 1>(0);
  const snapshot = groupSnapshot(schedule, group, clock, lastSync, now);
  const dayKnown = day === 0 ? snapshot.known : snapshot.tomorrowKnown;
  return (
    <div className="groups-layout">
      <div className="groupgrid">
        {GPV_GROUPS.map(value => (
          <button type="button" key={value} aria-pressed={value === group} onClick={() => setGroup(value)}>{value}</button>
        ))}
      </div>
      <div className="card">
        <div className="addr">Черга {group}</div>
        <div className="hero"><StatusPill status={snapshot.status} /></div>
        <DaySwitch day={day} onChange={setDay} />
        <DayTimeline spans={dayKnown ? spansFrom(snapshot.windows) : []} now={clock.minute} day={day} stale={!dayKnown} tall />
        <Legend />
      </div>
    </div>
  );
}
