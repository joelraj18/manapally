import React, { useState } from 'react';
import BrandLogo from '../../components/BrandLogo';
import GoldButton from '../../components/GoldButton';
import { TOTAL_MATCH_TURNS } from '../Game/matchRules';
import { PIECES, PieceMark } from '../Game/pieces.jsx';
import './room-waiting.css';

export default function RoomWaiting({
  roomCode,
  hostName,
  hostToken,
  onBack,
  onStartGame,
}) {
  const [playerCount, setPlayerCount] = useState(2);
  const [copyState, setCopyState] = useState('idle');

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopyState('copied');
    } catch {
      // The room code remains visible if the browser blocks clipboard access.
      setCopyState('blocked');
    }

    window.setTimeout(() => setCopyState('idle'), 2200);
  };

  const openSeats = Array.from({ length: playerCount - 1 }, (_, i) => i + 1);
  const hostPieceConfig = PIECES[hostToken] || PIECES.lamp;

  const handleStart = () => {
    if (onStartGame) {
      onStartGame({
        playerCount,
        hostPiece: hostToken,
        hostName: hostName || 'Host',
      });
    }
  };

  return (
    <main className="waiting-room-page">
      <header className="waiting-topbar">
        <button className="lobby-brand" type="button" onClick={onBack} aria-label="Back to the lobby">
          <BrandLogo size={22} />
        </button>

        <div className="room-status">
          <span className="status-dot" />
          Private table
        </div>

        <button className="lobby-back" type="button" onClick={onBack}>
          Leave room
        </button>
      </header>

      <section className="waiting-room-layout">
        <div className="waiting-room-intro">
          <p className="eyebrow">The private table</p>

          <h1>
            The court
            <br />
            <em>awaits</em>
          </h1>

          <p>
            Share your invitation code with the players joining your
            table, then begin whenever your circle is ready
          </p>

          <div className="invite-code-card">
            <span>Your invitation code</span>

            <strong>{roomCode}</strong>

            <button type="button" onClick={copyRoomCode} aria-live="polite">
              {copyState === 'copied'
                ? 'Copied'
                : copyState === 'blocked'
                  ? 'Copy blocked, share the code above'
                  : 'Copy invitation'}
            </button>
          </div>
        </div>

        <div className="waiting-room-panel">
          <div className="waiting-panel-heading">
            <div>
              <p className="eyebrow">Players at the table</p>
              <h2>
                1 <span>of {playerCount} seated</span>
              </h2>
            </div>

            <span className="host-badge">You are the host</span>
          </div>

          <div className="seat-count-section">
            <span className="field-label">Table size</span>
            <div className="seat-count-picker">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`seat-count-btn ${
                    playerCount === count ? 'seat-count-btn--selected' : ''
                  }`}
                  onClick={() => setPlayerCount(count)}
                  aria-pressed={playerCount === count}
                >
                  {count} Players
                </button>
              ))}
            </div>
          </div>

          <div className="player-seat-list">
            <article className="player-seat player-seat--host">
              <div
                className="player-token"
                style={{ color: hostPieceConfig.colour }}
              >
                <PieceMark piece={hostToken} variant="token" />
              </div>

              <div className="player-details">
                <strong>{hostName || 'Host'}</strong>
                <span>Host · {hostPieceConfig.label} · Ready</span>
              </div>

              <span className="ready-mark">✓</span>
            </article>

            {openSeats.map((seatIndex) => (
              <article className="player-seat player-seat--open" key={seatIndex}>
                <div className="empty-token">+</div>

                <div className="player-details">
                  <strong>AI Opponent {seatIndex}</strong>
                  <span>Joins when the match starts</span>
                </div>

                <span className="seat-number">0{seatIndex + 1}</span>
              </article>
            ))}
          </div>

          <div className="host-controls">
            <div>
              <p className="eyebrow">Host controls</p>
              <span>
                Start now with {playerCount - 1} AI opponent{playerCount > 2 ? 's' : ''}, each match runs
                for {TOTAL_MATCH_TURNS} turns shared by the whole table
              </span>
            </div>

            <GoldButton onClick={handleStart}>Start game</GoldButton>
          </div>
        </div>
      </section>
    </main>
  );
}
