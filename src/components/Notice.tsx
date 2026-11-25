import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface NoticeData {
  id: number;
  text: string;
  action?: string;
  onAction?: () => void;
  duration?: number;
}

/** A top popup that can be swiped sideways to dismiss, without blocking taps. */
export function Notice({ notice, onDismiss }: { notice: NoticeData; onDismiss: () => void }) {
  const [offset, setOffset] = useState(0);
  const element = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const dismiss = useRef(onDismiss);

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(), notice.duration ?? 5000);
    return () => window.clearTimeout(timer);
  }, [notice.id, notice.duration, onDismiss]);

  useEffect(() => {
    const inside = (x: number, y: number) => {
      const rect = element.current?.getBoundingClientRect();
      return Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    };
    const down = (event: PointerEvent) => {
      if (!inside(event.clientX, event.clientY)) return;
      start.current = event.clientX;
    };
    const move = (event: PointerEvent) => {
      if (start.current === null) return;
      setOffset(Math.max(-160, Math.min(160, event.clientX - start.current)));
    };
    const up = () => {
      if (start.current === null) return;
      if (Math.abs(offset) > 70) onDismiss();
      else setOffset(0);
      start.current = null;
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
  }, [offset, onDismiss]);

  return (
    <div
      ref={element}
      className="notice"
      role="status"
      style={{ ['--dx' as string]: `${offset}px`, opacity: Math.max(0.4, 1 - Math.abs(offset) / 200) } as CSSProperties}
    >
      <span>{notice.text}</span>
      {notice.action && (
        <button
          type="button"
          onClick={() => { notice.onAction?.(); onDismiss(); }}
        >{notice.action}</button>
      )}
    </div>
  );
}
