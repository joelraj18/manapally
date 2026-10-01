// Speaker button plus a volume slider. The button mutes everything, the
// slider sets the level for music and game sounds together; dragging it while
// muted turns the sound back on.
export default function VolumeControl({ enabled, volume, onToggle, onVolume, className = '', buttonClassName = '' }) {
  const level = Math.round(volume * 100);
  const shown = enabled ? level : 0;

  return (
    <div className={`volume-control ${enabled ? 'volume-control--on' : ''} ${className}`.trim()}>
      <button
        type="button"
        className={`volume-toggle ${buttonClassName}`.trim()}
        onClick={onToggle}
        aria-pressed={enabled}
        aria-label={enabled ? 'Mute all sound' : 'Turn sound on'}
        title={enabled ? 'Sound on' : 'Sound off'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path className="volume-icon-body" d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
          {enabled && level > 0 ? (
            <>
              <path d="M15.5 9a4 4 0 0 1 0 6" />
              {level > 50 && <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />}
            </>
          ) : (
            <path d="m16 9.5 5 5m0-5-5 5" />
          )}
        </svg>
      </button>

      <input
        type="range"
        className="volume-slider"
        min="0"
        max="100"
        step="1"
        value={shown}
        style={{ '--level': `${shown}%` }}
        aria-label="Volume"
        aria-valuetext={`${shown} percent`}
        onChange={(event) => onVolume(Number(event.target.value) / 100)}
      />
    </div>
  );
}
