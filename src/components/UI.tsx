import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { windowLabel, type Status } from '../lib/status';
import { FROM_STATUS, STATUS, NAV, type NavId, type StatusKey } from '../lib/statusLanguage';

export { FROM_STATUS, STATUS, NAV };
export type { NavId, StatusKey };

const TICK_STEP_HOURS = 4;
const TICKS_PER_DAY = 24 / TICK_STEP_HOURS;
const DAY_TICKS = Array.from({ length: TICKS_PER_DAY + 1 }, (_, i) => String(i * TICK_STEP_HOURS).padStart(2, '0'));
const FULL_TICKS = Array.from({ length: TICKS_PER_DAY * 2 + 1 }, (_, i) => String((i * TICK_STEP_HOURS) % 24).padStart(2, '0'));

export function StatusPill({ status }: { status: Status }) {
  const key = FROM_STATUS[status];
  const s = STATUS[key];
  return (
    <span className={`pill ${key}`}>
      {s.icon}
      {s.word}
    </span>
  );
}

export interface Span {
  start: number;
  end: number;
  kind: StatusKey;
  open?: boolean;
}

interface PopupAnchor {
  left: number;
  width: number;
  top: number;
  bottom: number;
}

/** Small fixed popup: floats above the page, clears the nav and never shifts layout. */
function TimePopup({ label, anchor, onClose }: { label: string; anchor: PopupAnchor; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      const margin = 12;
      const left = Math.max(margin, Math.min(anchor.left + anchor.width / 2 - box.width / 2, innerWidth - box.width - margin));
      const nav = document.querySelector('nav.tabs')?.getBoundingClientRect();
      const bottomLimit = nav && nav.top > innerHeight / 2 ? nav.top - margin : innerHeight - margin;
      const below = anchor.bottom + 8;
      let top = below;
      if (top + box.height > bottomLimit) top = anchor.top - box.height - 8;
      if (top < 64 + margin) top = Math.min(bottomLimit - box.height, 64 + margin);
      setPos({ left, top });
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [anchor, label]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const onDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="tl-pop"
      role="status"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      onClick={event => event.stopPropagation()}
    >
      <span className="tnum">{label}</span>
      <button type="button" className="tl-pop-close" onClick={event => { event.stopPropagation(); onClose(); }} aria-label="Закрити">×</button>
    </div>
  );
}

/** One day, 24 hours. Used in detail and compare instead of a 48-hour strip. */
export function DayTimeline({ spans, now, day, stale = false, tall = false }: {
  spans: Span[];
  now: number;
  day: 0 | 1;
  stale?: boolean;
  tall?: boolean;
}) {
  const [popup, setPopup] = useState<{ label: string; anchor: PopupAnchor } | null>(null);
  const start = day * 1440;
  const pct = (minute: number) => Math.max(0, Math.min(100, ((minute - start) / 1440) * 100));
  const visible = spans
    .filter(span => span.end > start && span.start < start + 1440)
    .map(span => ({ ...span, from: Math.max(span.start, start), to: Math.min(span.end, start + 1440) }));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const labelFor = (from: number, to: number, open?: boolean) => windowLabel({ start: from, end: to, open }, todayStart);
  const show = (label: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPopup({ label, anchor: { left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom } });
  };

  return (
    <div className="tl-wrap">
      <div className={`tl ${tall ? 'tall' : 'short'}${stale ? ' unknown' : ''} day`} role="group" aria-label={day === 0 ? 'Графік на сьогодні' : 'Графік на завтра'}>
        <div className="base" />
        {visible.map((span, index) => {
          const label = labelFor(span.from, span.to, span.open);
          return (
            <div
              key={index}
              className={`seg-win ${span.kind}`}
              style={{ left: `${pct(span.from)}%`, width: `${Math.max(0.4, pct(span.to) - pct(span.from))}%` }}
              role="button"
              tabIndex={0}
              aria-label={`${STATUS[span.kind].word} · ${label}`}
              onClick={event => { event.stopPropagation(); show(label, event.currentTarget); }}
              onKeyDown={event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                show(label, event.currentTarget);
              }}
            />
          );
        })}
        {day === 0 && <div className="now" style={{ left: `${pct(now)}%` }} />}
      </div>
      <div className={`tl-ticks tnum${tall ? '' : ' compact'}`}>
        {DAY_TICKS.map((time, index) => <span key={time} className={index === TICKS_PER_DAY ? 'em' : undefined}>{time}</span>)}
      </div>
      {popup && <TimePopup label={popup.label} anchor={popup.anchor} onClose={() => setPopup(null)} />}
    </div>
  );
}

export function DaySwitch({ day, onChange }: { day: 0 | 1; onChange: (day: 0 | 1) => void }) {
  return (
    <div className="seg">
      <button type="button" aria-pressed={day === 0} onClick={() => onChange(0)}>Сьогодні</button>
      <button type="button" aria-pressed={day === 1} onClick={() => onChange(1)}>Завтра</button>
    </div>
  );
}

export function Timeline({ spans, now, stale = false, tall = false, ticks = false }: {
  spans: Span[];
  now: number;
  stale?: boolean;
  tall?: boolean;
  ticks?: boolean;
}) {
  const [popup, setPopup] = useState<{ label: string; anchor: PopupAnchor } | null>(null);
  const total = 2880;
  const pct = (minute: number) => Math.max(0, Math.min(100, (minute / total) * 100));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const labelFor = (span: Span) => windowLabel({ start: span.start, end: span.end, open: span.open }, todayStart);
  const show = (label: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPopup({ label, anchor: { left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom } });
  };

  return (
    <div className="tl-wrap">
      <div className={`tl ${tall ? 'tall' : 'short'}${stale ? ' unknown' : ''}`} role="group" aria-label="Графік на 48 годин">
        <div className="base" />
        <div className="dayline" style={{ left: '50%' }} />
        {spans.map((span, index) => {
          const label = labelFor(span);
          return (
            <div
              key={index}
              className={`seg-win ${span.kind}`}
              style={{ left: `${pct(span.start)}%`, width: `${Math.max(0.4, pct(span.end) - pct(span.start))}%` }}
              role="button"
              tabIndex={0}
              aria-label={`${STATUS[span.kind].word} · ${label}`}
              onClick={event => { event.stopPropagation(); show(label, event.currentTarget); }}
              onKeyDown={event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                show(label, event.currentTarget);
              }}
            />
          );
        })}
        <div className="now" style={{ left: `${pct(now)}%` }} />
      </div>
      {(ticks || !tall) && (
        <div className={`tl-ticks tnum${tall ? '' : ' compact'}`}>
          {FULL_TICKS.map((time, index) => <span key={index} className={index === TICKS_PER_DAY ? 'em' : undefined}>{time}</span>)}
        </div>
      )}
      {popup && <TimePopup label={popup.label} anchor={popup.anchor} onClose={() => setPopup(null)} />}
    </div>
  );
}

export function PlaceCard({ name, sub, next, status, spans, now, stale, pinned, onClick }: {
  name: string;
  sub: string;
  next: string;
  status: Status;
  spans: Span[];
  now: number;
  stale: boolean;
  pinned?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="card" onClick={onClick}>
      <div className="row">
        <span className="grow addr">
          {pinned && <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-label="Закріплено" style={{ verticalAlign: '-2px', marginRight: 6 }}><path d="M14 2 22 10l-6 1-3 7-2-8-7-3 10-5z" /></svg>}
          {name}
        </span>
        <StatusPill status={status} />
      </div>
      <div className="sub">{sub}</div>
      {next && <div className="next">{next}</div>}
      <Timeline spans={spans} now={now} stale={stale} />
    </button>
  );
}

export function Button({ children, onClick, variant = 'secondary', disabled, type = 'button', minHeight }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  minHeight?: number;
}) {
  return (
    <button type={type} className={`btn ${variant}`} onClick={onClick} disabled={disabled} style={minHeight ? { minHeight } : undefined}>
      {children}
    </button>
  );
}

export function Field({ id, label, value, onChange, placeholder, error, inputMode }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
      {error && <div className="err">{error}</div>}
    </div>
  );
}

export function Banner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="banner">
      {STATUS.unknown.icon}
      <span style={{ flex: 1 }}>{children}</span>
      {action}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="state">
      {STATUS.on.icon}
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

const SWATCH: Record<StatusKey, string> = {
  on: 'linear-gradient(90deg, var(--on), var(--on))',
  planned: 'repeating-linear-gradient(45deg, var(--planned) 0 4px, transparent 4px 8px)',
  emergency: 'repeating-linear-gradient(0deg, var(--emergency) 0 3px, transparent 3px 6px)',
  possible: 'radial-gradient(var(--possible) 1.6px, transparent 1.7px) 0 0 / 6px 6px',
  unknown: 'repeating-linear-gradient(90deg, transparent 0 4px, var(--unknown) 4px 6px)',
};

export function Legend() {
  return (
    <div className="legend">
      {(['on', 'planned', 'emergency', 'possible', 'unknown'] as StatusKey[]).map(key => (
        <span key={key}>
          <i className="legend-swatch" style={{ background: SWATCH[key] }} />
          {STATUS[key].word}
        </span>
      ))}
    </div>
  );
}

export function Nav({ active, onNavigate }: { active: NavId; onNavigate: (id: NavId) => void }) {
  return (
    <nav className="tabs" aria-label="Головна навігація">
      {NAV.map(tab => (
        <button
          key={tab.id}
          type="button"
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onNavigate(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
