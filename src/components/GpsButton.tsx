export function GpsButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" className="map-gps" onClick={onClick} disabled={busy} aria-label="Моє місце (GPS)">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    </button>
  );
}
