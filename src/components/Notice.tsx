import { useEffect, useRef, useState, type CSSProperties } from 'react';

export const NOTICE_MS = 6000;
const SWIPE_LIMIT_PX = 160;
const SWIPE_DISMISS_PX = 70;
const FADE_RANGE_PX = 200;
const MIN_OPACITY = 0.4;

export interface NoticeData {
  id: number;
  text: string;
  action?: string;
  onAction?: () => void;
  duration?: number;
}

/** A popup that can be swiped sideways to dismiss, without blocking taps under it. */
export function Notice({ notice, onDismiss }: { notice: NoticeData; onDismiss: () => void }) {
  const [offset, setOffset] = useState(0);
  const element = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const offsetRef = useRef(0);
  // The latest callback, so a parent re-render never restarts the timer.
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(), notice.duration ?? NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice.id, notice.duration]);

  useEffect(() => {
    const move = (value: number) => { offsetRef.current = value; setOffset(value); };
    const inside = (x: number, y: number) => {
      const rect = element.current?.getBoundingClientRect();
      return Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    };
    const down = (event: PointerEvent) => {
      if (inside(event.clientX, event.clientY)) start.current = event.clientX;
    };
    const drag = (event: PointerEvent) => {
      if (start.current === null) return;
      move(Math.max(-SWIPE_LIMIT_PX, Math.min(SWIPE_LIMIT_PX, event.clientX - start.current)));
    };
    const up = () => {
      if (start.current === null) return;
      start.current = null;
      if (Math.abs(offsetRef.current) > SWIPE_DISMISS_PX) dismiss.current();
      else move(0);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', drag);
    document.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', drag);
      document.removeEventListener('pointerup', up);
    };
  }, []);

  const style = {
    '--dx': `${offset}px`,
    opacity: Math.max(MIN_OPACITY, 1 - Math.abs(offset) / FADE_RANGE_PX),
  } as CSSProperties;

  return (
    <div ref={element} className="notice" role="status" style={style}>
      <span>{notice.text}</span>
      {notice.action && (
        <button type="button" onClick={() => { notice.onAction?.(); dismiss.current(); }}>{notice.action}</button>
      )}
    </div>
  );
}
