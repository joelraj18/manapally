import React, { useState } from 'react';
import GoldButton from '../../components/GoldButton';
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

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
    } catch {
      // The room code remains visible if the browser blocks clipboard access.
    }
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
        <button className="lobby-brand" type="button" onClick={onBack}>
          <span className="brand-mark">M</span>
          <span>MANAPALLY</span>
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
            <em>awaits.</em>
          </h1>

          <p>
            Send your invitation code to the players joining your
            table. Once your circle is ready, begin the game.
          </p>

          <div className="invite-code-card">
            <span>Your invitation code</span>

            <strong>{roomCode}</strong>

            <button type="button" onClick={copyRoomCode}>
              ⧉ Copy invitation
            </button>
          </div>
        </div>

        <div className="waiting-room-panel">
          <div className="waiting-panel-heading">
            <div>
              <p className="eyebrow">Players at the table</p>
              <h2>
                1 <span>/ {playerCount} seated</span>
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
                <span>Host ({hostPieceConfig.label}) · ready at the table</span>
              </div>

              <span className="ready-mark">✓</span>
            </article>

            {openSeats.map((seatIndex) => (
              <article className="player-seat player-seat--open" key={seatIndex}>
                <div className="empty-token">+</div>

                <div className="player-details">
                  <strong>AI Opponent {seatIndex}</strong>
                  <span>Auto-joins match start</span>
                </div>

                <span className="seat-number">0{seatIndex + 1}</span>
              </article>
            ))}
          </div>

          <div className="host-controls">
            <div>
              <p className="eyebrow">Host controls</p>
              <span>
                You can start now with {playerCount - 1} AI opponent{playerCount > 2 ? 's' : ''}, or wait for friends
                to join using the invitation code.
              </span>
            </div>

            <GoldButton icon="✦" onClick={handleStart}>
              Start game
            </GoldButton>
          </div>
        </div>
      </section>
    </main>
  );
}
