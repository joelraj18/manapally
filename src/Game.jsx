import React, { useState } from 'react';
import BackgroundEffects from './components/BackgroundEffects';
import FeatureCard from './components/FeatureCard';
import Footer from './components/Footer';
import Hero from './components/Hero';
import Navbar from './components/Navbar';

import './styles/game.css';
import './styles/hero.css';
import './styles/navbar.css';

const features = [
  {
    number: 'I',
    title: 'Build a legacy',
    description:
      'Acquire exquisite districts, complete collections, and shape a kingdom worthy of the crown.',
    symbol: '✦',
  },
  {
    number: 'II',
    title: 'Outthink the court',
    description:
      'Trade intelligently, navigate shifting fortunes, and turn every decision into prestige.',
    symbol: '♜',
  },
  {
    number: 'III',
    title: 'Gather your circle',
    description:
      'Invite friends to a private table and enjoy a refined strategy night from anywhere.',
    symbol: '◌',
  },
];

export default function Game() {
  const [isMusicEnabled, setIsMusicEnabled] = useState(false);
  const [notice, setNotice] = useState('');

  const showNotice = (message) => {
    setNotice(message);

    window.setTimeout(() => {
      setNotice('');
    }, 2800);
  };

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
    });
  };

  return (
    <main className="game-shell">
      <BackgroundEffects />

      <Navbar
        musicEnabled={isMusicEnabled}
        onMusicToggle={() => setIsMusicEnabled((value) => !value)}
        onNavigate={scrollToSection}
      />

      <Hero
        onCreateRoom={() =>
          showNotice('Private rooms arrive in the next sprint.')
        }
        onExplore={() => scrollToSection('experience')}
      />

      <section
        className="experience section-wrap"
        id="experience"
        aria-labelledby="experience-heading"
      >
        <div className="section-heading reveal">
          <p className="eyebrow">A table set for strategy</p>

          <h2 id="experience-heading">
            Made for memorable game nights.
          </h2>

          <p>
            Every piece of Manapally is designed to feel considered:
            rich materials, tactile motion, and rules that reward a
            thoughtful move.
          </p>
        </div>

        <div className="feature-grid">
          {features.map((feature) => (
            <FeatureCard key={feature.number} {...feature} />
          ))}
        </div>
      </section>

      <section
        className="coming-soon section-wrap"
        id="how-to-play"
        aria-labelledby="how-heading"
      >
        <div className="royal-seal" aria-hidden="true">
          M
        </div>

        <div>
          <p className="eyebrow">The first season</p>

          <h2 id="how-heading">The court is assembling.</h2>

          <p>
            Manapally is in development. Follow its progress and be
            first to receive a seat at the table.
          </p>
        </div>
      </section>

      <Footer
        onJoin={() =>
          showNotice('Thank you — early access is opening soon.')
        }
      />

      <div
        className={`toast ${notice ? 'toast--visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
    </main>
  );
}