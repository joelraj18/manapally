import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import AmbientMusic from './components/AmbientMusic';
import BackgroundEffects from './components/BackgroundEffects';
import Footer from './components/Footer';
import GoldButton from './components/GoldButton';
import Hero from './components/Hero';
import LoadingScreen from './components/LoadingScreen';
import Navbar from './components/Navbar';
import useReveal from './hooks/useReveal';
import BoardGuide from './pages/Home/BoardGuide';
import DistrictFamilies from './pages/Home/DistrictFamilies';
import FairPlay from './pages/Home/FairPlay';
import Faq from './pages/Home/Faq';
import Highlights from './pages/Home/Highlights';
import HowToPlay from './pages/Home/HowToPlay';
import PieceShelf from './pages/Home/PieceShelf';
import Tips from './pages/Home/Tips';

import './styles/game.css';
import './styles/hero.css';
import './styles/navbar.css';

// Rooms and the board load on demand, so the landing page stays light and
// PeerJS and the Claude SDK download only when someone opens a room.
const Lobby = lazy(() => import('./pages/Lobby/Lobby'));
const RoomWaiting = lazy(() => import('./pages/Lobby/RoomWaiting'));
const BoardGame = lazy(() => import('./pages/Game/BoardGame'));

const clearPremiumKey = () =>
  import('./services/premiumAi').then((module) => module.clearPremiumKey());

// Music and sound effects are separate channels. Volumes and the effects
// switch are remembered on this device; music always starts off because
// browsers block sound that plays before the first tap.
const AUDIO_KEY = 'manapally-audio';
const DEFAULT_AUDIO = { musicOn: false, musicVolume: 0.5, effectsOn: true, effectsVolume: 0.8 };

const loadAudio = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUDIO_KEY) || '{}');
    const level = (value, fallback) => (value > 0 && value <= 1 ? value : fallback);

    return {
      musicOn: false,
      musicVolume: level(saved.musicVolume, DEFAULT_AUDIO.musicVolume),
      effectsOn: typeof saved.effectsOn === 'boolean' ? saved.effectsOn : DEFAULT_AUDIO.effectsOn,
      effectsVolume: level(saved.effectsVolume, DEFAULT_AUDIO.effectsVolume),
    };
  } catch {
    return DEFAULT_AUDIO;
  }
};

export default function Game() {
  const [audio, setAudio] = useState(loadAudio);
  const [currentView, setCurrentView] = useState('home');
  const [lobbyPiece, setLobbyPiece] = useState('lamp');
  const [session, setSession] = useState(null);
  const [match, setMatch] = useState(null);
  const [notice, setNotice] = useState('');
  const homeRef = useRef(null);

  useReveal(homeRef, currentView);

  // Each view starts at the top, the way a new page would.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentView]);

  const showNotice = useCallback((message) => {
    setNotice(message);

    window.setTimeout(() => {
      setNotice('');
    }, 3200);
  }, []);

  // A room lives from the lobby to the end of the last rematch.
  useEffect(() => {
    if (!session) {
      return undefined;
    }

    const offStart = session.on('start', (config) => {
      setMatch(config);
      setCurrentView('board');
    });

    const offClosed = session.on('closed', (reason) => {
      setSession(null);
      setMatch(null);
      setCurrentView('home');
      showNotice(reason || 'The room has closed');
    });

    return () => {
      offStart();
      offClosed();
    };
  }, [session, showNotice]);

  // Closing the tab closes the room for everyone at the table.
  useEffect(() => {
    if (!session) {
      return undefined;
    }

    const onUnload = () => session.close();
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [session]);

  const leaveRoom = useCallback(() => {
    session?.close();
    setSession(null);
    setMatch(null);
    clearPremiumKey();
    setCurrentView('home');
  }, [session]);

  const scrollToSection = (sectionId) => {
    if (sectionId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
    });
  };

  const openLobby = (piece = 'lamp') => {
    setLobbyPiece(typeof piece === 'string' ? piece : 'lamp');
    setCurrentView('lobby');
  };

  const updateAudio = useCallback((patch) => {
    setAudio((current) => {
      const next = { ...current, ...patch };

      try {
        const { musicVolume, effectsOn, effectsVolume } = next;
        window.localStorage.setItem(AUDIO_KEY, JSON.stringify({ musicVolume, effectsOn, effectsVolume }));
      } catch {
        // Storage can be unavailable in private windows; the settings still apply.
      }

      return next;
    });
  }, []);

  const toggleMusic = () => updateAudio({ musicOn: !audio.musicOn });

  const handlePlaybackBlocked = useCallback(() => {
    updateAudio({ musicOn: false });
    showNotice('Music could not start, please tap the speaker button again');
  }, [showNotice, updateAudio]);

  let view;

  if (currentView === 'board' && session && match) {
    view = (
      <BoardGame
        key={match.gameId}
        players={match.players}
        myPlayerId={match.myPlayerId}
        session={session}
        audio={audio}
        onAudio={updateAudio}
        onExit={leaveRoom}
        onRestart={() => session.restartGame()}
      />
    );
  } else if (currentView === 'waiting' && session) {
    view = <RoomWaiting session={session} onLeave={leaveRoom} />;
  } else if (currentView === 'lobby') {
    view = (
      <Lobby
        initialPiece={lobbyPiece}
        onBack={() => setCurrentView('home')}
        onSession={(next) => {
          setSession(next);
          setCurrentView('waiting');
        }}
      />
    );
  } else {
    view = renderHome();
  }

  return (
    <>
      <AmbientMusic isPlaying={audio.musicOn} volume={audio.musicVolume} onPlaybackBlocked={handlePlaybackBlocked} />

      <Suspense fallback={<LoadingScreen onComplete={() => {}} />}>{view}</Suspense>

      <div className={`toast ${notice ? 'toast--visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </>
  );

  function renderHome() {
  return (
    <main className="game-shell" ref={homeRef}>
      <Navbar
        audio={audio}
        onAudio={updateAudio}
        onNavigate={scrollToSection}
        onPlay={() => openLobby()}
      />

      <div className="hero-wrap">
        <BackgroundEffects />
        <Hero onCreateRoom={() => openLobby()} onExplore={() => scrollToSection('how-to-play')} />
      </div>

      <Highlights />
      <PieceShelf onPlay={openLobby} />
      <HowToPlay onPlay={() => openLobby()} />
      <BoardGuide />
      <DistrictFamilies />
      <FairPlay />
      <Tips />
      <Faq />

      <section className="closing-cta" aria-labelledby="closing-heading">
        <div className="section-inner section-head--center reveal">
          <h2 id="closing-heading">Your table is ready</h2>
          <p className="section-lede">Pick a piece, open a private room and make the first move</p>
          <div className="closing-actions">
            <GoldButton onClick={() => openLobby()}>Create a room</GoldButton>
            <button type="button" className="text-link text-link--large" onClick={() => scrollToSection('how-to-play')}>
              Read the rules <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </section>

      <Footer
        onNavigate={scrollToSection}
        onPlay={() => openLobby()}
        onMusicToggle={toggleMusic}
        musicEnabled={audio.musicOn}
      />
    </main>
  );
  }
}
