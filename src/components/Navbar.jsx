import GoldButton from './GoldButton';

export default function Navbar({
  musicEnabled,
  onMusicToggle,
  onNavigate,
}) {
  return (
    <header className="navbar">
      <button
        className="brand"
        type="button"
        onClick={() => onNavigate('top')}
        aria-label="Return to the top"
      >
        <span className="brand-mark">M</span>
        <span>MANAPALLY</span>
      </button>

      <nav aria-label="Primary navigation">
        <button
          type="button"
          onClick={() => onNavigate('experience')}
        >
          The experience
        </button>

        <button
          type="button"
          onClick={() => onNavigate('how-to-play')}
        >
          How it unfolds
        </button>
      </nav>

      <div className="nav-actions">
        <button
          className="sound-button"
          type="button"
          onClick={onMusicToggle}
          aria-pressed={musicEnabled}
          aria-label="Toggle ambient music"
        >
          <span>{musicEnabled ? '♫' : '♩'}</span>
          {musicEnabled ? 'Sound on' : 'Sound off'}
        </button>

        <GoldButton
          size="small"
          onClick={() => onNavigate('how-to-play')}
        >
          Enter the court
        </GoldButton>
      </div>
    </header>
  );
}