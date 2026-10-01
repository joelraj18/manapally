import React, { useCallback, useEffect, useRef, useState } from 'react';
import AmbientMusic from './components/AmbientMusic';
import BackgroundEffects from './components/BackgroundEffects';
import Footer from './components/Footer';
import GoldButton from './components/GoldButton';
import Hero from './components/Hero';
import Navbar from './components/Navbar';
import useReveal from './hooks/useReveal';
import BoardGame from './pages/Game/BoardGame';
import BoardGuide from './pages/Home/BoardGuide';
import DistrictFamilies from './pages/Home/DistrictFamilies';
import FairPlay from './pages/Home/FairPlay';
import Faq from './pages/Home/Faq';
import Highlights from './pages/Home/Highlights';
import HowToPlay from './pages/Home/HowToPlay';
import PieceShelf from './pages/Home/PieceShelf';
import Tips from './pages/Home/Tips';
import Lobby from './pages/Lobby/Lobby';

import './styles/game.css';
import './styles/hero.css';
import './styles/navbar.css';

export default function Game() {
  const [isMusicEnabled, setIsMusicEnabled] = useState(false);
  const [currentView, setCurrentView] = useState('home');
  const [lobbyPiece, setLobbyPiece] = useState('lamp');
  const [matchConfig, setMatchConfig] = useState({ playerCount: 2, hostPiece: 'lamp', hostName: 'Host' });
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
    }, 2800);
  }, []);

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

  const handleMusicToggle = () => {
    setIsMusicEnabled((isEnabled) => !isEnabled);
  };

  const handlePlaybackBlocked = useCallback(() => {
    setIsMusicEnabled(false);
    showNotice('Music could not start, please tap the speaker button again');
  }, [showNotice]);

  if (currentView === 'board') {
    return (
      <BoardGame
        playerCount={matchConfig.playerCount}
        hostPiece={matchConfig.hostPiece}
        hostName={matchConfig.hostName}
        isMusicEnabled={isMusicEnabled}
        onMusicToggle={handleMusicToggle}
        onExit={() => {
          setCurrentView('home');
        }}
      />
    );
  }

  if (currentView === 'lobby') {
    return (
      <Lobby
        initialPiece={lobbyPiece}
        onBack={() => {
          setCurrentView('home');
        }}
        onStartGame={(config) => {
          if (config) {
            setMatchConfig(config);
          }
          setCurrentView('board');
        }}
      />
    );
  }

  return (
    <main className="game-shell" ref={homeRef}>
      <AmbientMusic isPlaying={isMusicEnabled} onPlaybackBlocked={handlePlaybackBlocked} />

      <Navbar
        musicEnabled={isMusicEnabled}
        onMusicToggle={handleMusicToggle}
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
        onMusicToggle={handleMusicToggle}
        musicEnabled={isMusicEnabled}
      />

      <div className={`toast ${notice ? 'toast--visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </main>
  );
}
