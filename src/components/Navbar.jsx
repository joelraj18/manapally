import { useEffect, useState } from 'react';
import BrandLogo, { BrandMark } from './BrandLogo';
import GoldButton from './GoldButton';
import VolumeControl from './VolumeControl';

const sectionLinks = [
  { id: 'overview', label: 'Overview' },
  { id: 'pieces', label: 'Pieces' },
  { id: 'how-to-play', label: 'How to play' },
  { id: 'board-guide', label: 'Board guide' },
  { id: 'tips', label: 'Tips' },
  { id: 'faq', label: 'FAQ' },
];

export default function Navbar({ musicEnabled, volume, onVolume, onMusicToggle, onNavigate, onPlay }) {
  const [isStuck, setIsStuck] = useState(false);

  // The local nav gains its frosted backdrop only after the global bar has
  // scrolled away, the same hand off Apple uses on product pages.
  useEffect(() => {
    const onScroll = () => setIsStuck(window.scrollY > 44);

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header className="global-nav">
        <div className="global-nav-inner">
          <button
            className="global-nav-home"
            type="button"
            onClick={() => onNavigate('top')}
            aria-label="Manapally home"
          >
            <BrandMark size={22} />
          </button>

          <nav className="global-nav-links" aria-label="Sections">
            {sectionLinks.map((link) => (
              <button key={link.id} type="button" onClick={() => onNavigate(link.id)}>
                {link.label}
              </button>
            ))}
          </nav>

          <VolumeControl
            className="global-nav-volume"
            enabled={musicEnabled}
            volume={volume}
            onToggle={onMusicToggle}
            onVolume={onVolume}
          />
        </div>
      </header>

      <div className="ribbon">
        <p>
          Play free in your browser with friends anywhere, or with computer opponents{' '}
          <button type="button" className="text-link" onClick={onPlay}>
            Create a room <span aria-hidden="true">›</span>
          </button>
        </p>
      </div>

      <div className={`local-nav ${isStuck ? 'local-nav--stuck' : ''}`}>
        <div className="local-nav-inner">
          <button className="local-nav-title" type="button" onClick={() => onNavigate('top')}>
            <BrandLogo size={22} showWordmark />
          </button>

          <div className="local-nav-actions">
            <button type="button" className="local-nav-link" onClick={() => onNavigate('how-to-play')}>
              Guide
            </button>

            <button type="button" className="local-nav-link" onClick={() => onNavigate('faq')}>
              FAQ
            </button>

            <GoldButton size="small" onClick={onPlay}>
              Play
            </GoldButton>
          </div>
        </div>
      </div>
    </>
  );
}
