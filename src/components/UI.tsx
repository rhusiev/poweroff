import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { DAY_MINUTES, WINDOW_MINUTES, windowLabel, type Status } from '../lib/status';
import { FROM_STATUS, STATUS, NAV, type NavId, type StatusKey } from '../lib/statusLanguage';

export { FROM_STATUS, STATUS, NAV };
export type { NavId, StatusKey };

const TICK_STEP_HOURS = 4;
const TICKS_PER_DAY = 24 / TICK_STEP_HOURS;
const hourLabel = (index: number) => String((index * TICK_STEP_HOURS) % 24).padStart(2, '0');
const DAY_TICKS = Array.from({ length: TICKS_PER_DAY + 1 }, (_, i) => hourLabel(i));
const FULL_TICKS = Array.from({ length: TICKS_PER_DAY * 2 + 1 }, (_, i) => hourLabel(i));
/** A window shorter than this share of the strip is widened so it stays visible. */
const MIN_SEGMENT_PCT = 0.4;
const POPUP_GAP_PX = 8;
const POPUP_MARGIN_PX = 12;
const TOPBAR_PX = 64;

export function StatusPill({ status }: { status: Status }) {
  const key = FROM_STATUS[status];
  return (
    <span className={`pill ${key}`}>
      {STATUS[key].icon}
      {STATUS[key].word}
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
      const centered = anchor.left + anchor.width / 2 - box.width / 2;
      const left = Math.max(POPUP_MARGIN_PX, Math.min(centered, innerWidth - box.width - POPUP_MARGIN_PX));
      const nav = document.querySelector('nav.tabs')?.getBoundingClientRect();
      const bottomLimit = nav && nav.top > innerHeight / 2 ? nav.top - POPUP_MARGIN_PX : innerHeight - POPUP_MARGIN_PX;
      let top = anchor.bottom + POPUP_GAP_PX;
      if (top + box.height > bottomLimit) top = anchor.top - box.height - POPUP_GAP_PX;
      if (top < TOPBAR_PX + POPUP_MARGIN_PX) top = Math.min(bottomLimit - box.height, TOPBAR_PX + POPUP_MARGIN_PX);
      setPos({ left, top });
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [anchor, label]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
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
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      onClick={event => event.stopPropagation()}
    >
      <span className="tnum" role="status">{label}</span>
      <button type="button" className="tl-pop-close" onClick={event => { event.stopPropagation(); onClose(); }} aria-label="Закрити">×</button>
    </div>
  );
}

/** One horizontal strip over `[from, from + length)` minutes of the 48-hour axis. */
function Strip({ spans, now, from, length, knownUntil, stale, tall, className, label, ticks }: {
  spans: Span[];
  /** Past this minute nothing is published, so the strip shows the unknown tint. */
  knownUntil: number;
  now: number | null;
  from: number;
  length: number;
  stale: boolean;
  tall: boolean;
  className: string;
  label: string;
  ticks: string[] | null;
}) {
  const [popup, setPopup] = useState<{ label: string; anchor: PopupAnchor } | null>(null);
  const pct = (minute: number) => Math.max(0, Math.min(100, ((minute - from) / length) * 100));
  const visible = spans
    .filter(span => span.end > from && span.start < from + length)
    .map(span => ({ ...span, start: Math.max(span.start, from), end: Math.min(span.end, from + length) }));
  const show = (text: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPopup({ label: text, anchor: { left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom } });
  };

  return (
    <div className="tl-wrap">
      <div className={`tl ${tall ? 'tall' : 'short'}${stale ? ' unknown' : ''} ${className}`} role="group" aria-label={label}>
        <div className="base" />
        {knownUntil < from + length && <div className="unknown-tail" style={{ left: `${pct(knownUntil)}%` }} />}
        {length === WINDOW_MINUTES && <div className="dayline" style={{ left: '50%' }} />}
        {visible.map(span => {
          const text = windowLabel(span);
          return (
            <button
              type="button"
              key={`${span.kind}-${span.start}-${span.end}`}
              className={`seg-win ${span.kind}`}
              style={{ left: `${pct(span.start)}%`, width: `${Math.max(MIN_SEGMENT_PCT, pct(span.end) - pct(span.start))}%` }}
              aria-label={`${STATUS[span.kind].word} · ${text}`}
              onClick={event => { event.stopPropagation(); show(text, event.currentTarget); }}
            />
          );
        })}
        {now !== null && <div className="now" style={{ left: `${pct(now)}%` }} />}
      </div>
      {ticks && (
        <div className={`tl-ticks tnum${tall ? '' : ' compact'}`}>
          {ticks.map((time, index) => <span key={index} className={index === TICKS_PER_DAY ? 'em' : undefined}>{time}</span>)}
        </div>
      )}
      {popup && <TimePopup label={popup.label} anchor={popup.anchor} onClose={() => setPopup(null)} />}
    </div>
  );
}

/** One day, 24 hours. Used in detail, groups and compare instead of a 48-hour strip. */
export function DayTimeline({ spans, now, day, stale = false, tall = false }: {
  spans: Span[];
  now: number;
  day: 0 | 1;
  stale?: boolean;
  tall?: boolean;
}) {
  return (
    <Strip
      spans={spans}
      now={day === 0 ? now : null}
      from={day * DAY_MINUTES}
      length={DAY_MINUTES}
      knownUntil={WINDOW_MINUTES}
      stale={stale}
      tall={tall}
      className="day"
      label={day === 0 ? 'Графік на сьогодні' : 'Графік на завтра'}
      ticks={DAY_TICKS}
    />
  );
}

export function Timeline({ spans, now, knownUntil = WINDOW_MINUTES, stale = false, tall = false }: {
  spans: Span[];
  now: number;
  knownUntil?: number;
  stale?: boolean;
  tall?: boolean;
}) {
  return (
    <Strip
      spans={spans}
      now={now}
      from={0}
      length={WINDOW_MINUTES}
      knownUntil={knownUntil}
      stale={stale}
      tall={tall}
      className=""
      label="Графік на 48 годин"
      ticks={tall ? null : FULL_TICKS}
    />
  );
}

export interface TabOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

/** A tab bar with roving focus: arrow keys, Home and End move between tabs. */
export function Tabs<T extends string | number>({ options, value, onChange, label, className }: {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    const last = options.length - 1;
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last : null;
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={className} role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={element => { refs.current[index] = element; }}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={event => onKey(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const DAY_OPTIONS: TabOption<0 | 1>[] = [{ value: 0, label: 'Сьогодні' }, { value: 1, label: 'Завтра' }];

export function DaySwitch({ day, onChange }: { day: 0 | 1; onChange: (day: 0 | 1) => void }) {
  return <Tabs options={DAY_OPTIONS} value={day} onChange={onChange} label="День" className="seg" />;
}

export const PinIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Закріплено" className="pin-mark">
    <path d="M14 2 22 10l-6 1-3 7-2-8-7-3 10-5z" />
  </svg>
);

/**
 * A place summary. When it opens something, the name is a button stretched
 * over the card, so the timeline's own buttons stay siblings, not children.
 */
export function PlaceCard({ name, sub, next, status, spans, now, knownUntil, stale, pinned, onOpen }: {
  name: string;
  sub: string;
  next: string;
  status: Status;
  spans: Span[];
  now: number;
  knownUntil: number;
  stale: boolean;
  pinned?: boolean;
  onOpen?: () => void;
}) {
  const title = <>{pinned && <PinIcon size={14} />}{name}</>;
  return (
    <article className={`card place${onOpen ? ' openable' : ''}`}>
      <div className="row">
        {onOpen
          ? <button type="button" className="grow addr card-open" onClick={onOpen}>{title}</button>
          : <span className="grow addr">{title}</span>}
        <StatusPill status={status} />
      </div>
      <div className="sub">{sub}</div>
      {next && <div className="next">{next}</div>}
      <Timeline spans={spans} now={now} knownUntil={knownUntil} stale={stale} />
    </article>
  );
}

export function SkeletonCard() {
  return <div className="skeleton" aria-hidden="true" />;
}

export function Button({ children, onClick, variant = 'secondary', disabled, type = 'button' }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={`btn ${variant}`} onClick={onClick} disabled={disabled}>
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
      <span className="banner-text">{children}</span>
      {action}
    </div>
  );
}

const HOME_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
  </svg>
);

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="state">
      {HOME_ICON}
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

const LEGEND_KEYS: StatusKey[] = ['on', 'planned', 'emergency', 'possible', 'unknown'];

/** Each swatch carries the same class as its timeline fill, so the two cannot drift. */
export function Legend() {
  return (
    <div className="legend">
      {LEGEND_KEYS.map(key => (
        <span key={key}>
          <i className={`legend-swatch ${key}`} aria-hidden="true" />
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

export function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="back" aria-label="Назад" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
  );
}
