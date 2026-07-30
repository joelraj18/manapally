import GoldButton from '../../components/GoldButton';
import './room-waiting.css';

const tokenIcons = {
  elephant: '♞',
  veena: '♬',
  coffee: '◒',
  bell: '♢',
};

const openSeats = [1, 2, 3];

export default function RoomWaiting({
  roomCode,
  hostName,
  hostToken,
  onBack,
  onStartGame,
}) {
  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
    } catch {
      // The room code remains visible if the browser blocks clipboard access.
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
                1 <span>/ 4 seated</span>
              </h2>
            </div>

            <span className="host-badge">You are the host</span>
          </div>

          <div className="player-seat-list">
            <article className="player-seat player-seat--host">
              <div className="player-token">
                {tokenIcons[hostToken] || '♞'}
              </div>

              <div className="player-details">
                <strong>{hostName || 'Host'}</strong>
                <span>Host · ready at the table</span>
              </div>

              <span className="ready-mark">✓</span>
            </article>

            {openSeats.map((seatNumber) => (
              <article className="player-seat player-seat--open" key={seatNumber}>
                <div className="empty-token">+</div>

                <div className="player-details">
                  <strong>Seat available</strong>
                  <span>Awaiting a player</span>
                </div>

                <span className="seat-number">0{seatNumber + 1}</span>
              </article>
            ))}
          </div>

          <div className="host-controls">
            <div>
              <p className="eyebrow">Host controls</p>
              <span>
                You can start now for a test game, or wait for friends
                to join using the invitation code.
              </span>
            </div>

            <GoldButton icon="✦" onClick={onStartGame}>
              Start game
            </GoldButton>
          </div>
        </div>
      </section>
    </main>
  );
}