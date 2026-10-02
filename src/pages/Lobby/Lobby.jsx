import { useState } from 'react';
import BrandLogo from '../../components/BrandLogo';
import GoldButton from '../../components/GoldButton';
import { PIECES, PIECE_ORDER, PieceMark } from '../Game/pieces.jsx';
import './lobby.css';

const playerOptions = PIECE_ORDER.map((key) => ({
  id: key,
  name: PIECES[key].label,
  color: PIECES[key].colour,
}));

const nextSteps = [
  'Choose a display name and a royal piece',
  'Create a room and share its six character code',
  'Friends enter the code to join, or add computer and AI opponents',
];

const JOIN_ERRORS = {
  'not-found': 'No room found with that code, check it with your host',
  full: 'That table is already full',
  started: 'That match has already started, use Rejoin with your Player ID if you were playing',
  'unknown-player': 'That Player ID is not seated in this match, check it and the room code',
  'not-ready': 'The host is reopening the room, try again in a few seconds',
  removed: 'The host removed you from that table',
  network: 'Could not reach the room service, check your connection and try again',
};

// The last seat this device played, so a dropped player finds both codes
// already filled in. Read directly so the room module still loads lazily.
const lastSeat = () => {
  try {
    return JSON.parse(window.localStorage.getItem('manapally-seat') || 'null') || {};
  } catch {
    return {};
  }
};

const codeInput = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export default function Lobby({ onBack, onSession, initialPiece = 'lamp' }) {
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [rejoinRoom, setRejoinRoom] = useState(() => lastSeat().code || '');
  const [rejoinId, setRejoinId] = useState(() => lastSeat().playerCode || '');
  const [selectedToken, setSelectedToken] = useState(PIECES[initialPiece] ? initialPiece : 'lamp');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(null); // 'create' | 'join' | 'rejoin' | null

  const selectedPlayer = playerOptions.find((player) => player.id === selectedToken) || playerOptions[0];

  const showMessage = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 3200);
  };

  const nameIsValid = () => {
    if (displayName.trim().length < 2) {
      showMessage('Please enter a display name with at least 2 letters');
      return false;
    }

    return true;
  };

  // The room module (and PeerJS with it) loads only when a room is opened.
  const loadRooms = () => import('../../services/roomSession');

  const createRoom = async () => {
    if (!nameIsValid() || busy) return;

    setBusy('create');

    try {
      const { default: RoomSession } = await loadRooms();
      const session = await RoomSession.host({ name: displayName, pieceKey: selectedToken });
      onSession(session);
    } catch {
      showMessage(JOIN_ERRORS.network);
      setBusy(null);
    }
  };

  const joinRoom = async () => {
    if (!nameIsValid() || busy) return;

    if (roomCode.trim().length !== 6) {
      showMessage('Enter the 6 character room code from your host');
      return;
    }

    setBusy('join');

    try {
      const { default: RoomSession } = await loadRooms();
      const session = await RoomSession.join({ code: roomCode, name: displayName, pieceKey: selectedToken });
      onSession(session);
    } catch (error) {
      showMessage(JOIN_ERRORS[error.message] || JOIN_ERRORS.network);
      setBusy(null);
    }
  };

  // Back into a match under way with a Player ID. On the device that hosted
  // it, the saved match reopens the room itself; anywhere else it asks the
  // host for the seat.
  const rejoinMatch = async () => {
    if (busy) return;

    if (rejoinRoom.length !== 6 || rejoinId.length !== 6) {
      showMessage('Enter the 6 character room code and your 6 character Player ID');
      return;
    }

    setBusy('rejoin');

    try {
      const { default: RoomSession, savedHostGame } = await loadRooms();
      const hosted = savedHostGame();
      const session =
        hosted && hosted.code === rejoinRoom && hosted.players?.[0]?.code === rejoinId
          ? await RoomSession.resumeHost(hosted)
          : await RoomSession.join({ code: rejoinRoom, rejoin: rejoinId, pieceKey: selectedToken });
      onSession(session, { resume: session.startConfig });
    } catch (error) {
      showMessage(JOIN_ERRORS[error.message] || JOIN_ERRORS.network);
      setBusy(null);
    }
  };

  return (
    <main className="lobby-page">
      <div className="lobby-topbar">
        <button className="lobby-brand" type="button" onClick={onBack} aria-label="Manapally home">
          <BrandLogo size={22} />
        </button>

        <button className="lobby-back" type="button" onClick={onBack}>
          <span aria-hidden="true">‹</span> Home
        </button>
      </div>

      <section className="lobby-layout">
        <div className="lobby-intro">
          <p className="eyebrow">Private game rooms</p>

          <h1>
            Gather your
            <br />
            <em>Inner Circle</em>
          </h1>

          <p>Create a private room where friends can join via a room code</p>

          <ol className="lobby-steps">
            {nextSteps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>

          <div className="lobby-status">
            <span className="status-dot" />
            Private rooms for 2 to 4 players, anywhere in the world
          </div>
        </div>

        <div className="lobby-panel">
          <div className="lobby-panel-heading">
            <span className="panel-number">1</span>

            <div>
              <p className="eyebrow">Your identity</p>
              <h2>Enter the court</h2>
            </div>
          </div>

          <label className="field-label" htmlFor="display-name">
            Display name
          </label>

          <input
            id="display-name"
            className="lobby-input"
            type="text"
            maxLength="18"
            autoComplete="nickname"
            value={displayName}
            placeholder="How shall the court know you?"
            onChange={(event) => setDisplayName(event.target.value)}
          />

          <div className="token-heading">
            <div>
              <p className="field-label">Choose your piece</p>
              <span>If a friend already holds it, you get the next free piece</span>
            </div>

            <span className="selected-token-name">{selectedPlayer.name}</span>
          </div>

          <div className="token-picker">
            {playerOptions.map((player) => (
              <button
                key={player.id}
                type="button"
                className={`token-choice ${selectedToken === player.id ? 'token-choice--selected' : ''}`}
                style={{ '--token-color': player.color, color: player.color }}
                onClick={() => setSelectedToken(player.id)}
                aria-pressed={selectedToken === player.id}
                aria-label={`Choose ${player.name}`}
              >
                <PieceMark piece={player.id} variant="token" />
              </button>
            ))}
          </div>

          <GoldButton onClick={createRoom} loading={busy === 'create'} disabled={Boolean(busy && busy !== 'create')}>
            Create a private room
          </GoldButton>

          <div className="lobby-divider">
            <span>or join a friend's table</span>
          </div>

          <div className="join-room-row">
            <input
              className="lobby-input room-code-input"
              type="text"
              value={roomCode}
              maxLength="6"
              aria-label="Room code"
              autoComplete="off"
              placeholder="Room code"
              onChange={(event) => setRoomCode(codeInput(event.target.value))}
              onKeyDown={(event) => event.key === 'Enter' && joinRoom()}
            />

            <GoldButton variant="ghost" onClick={joinRoom} loading={busy === 'join'} disabled={Boolean(busy && busy !== 'join')}>
              Join room
            </GoldButton>
          </div>

          <div className="lobby-divider">
            <span>or rejoin a match you left</span>
          </div>

          <p className="rejoin-help">
            Your Player ID is shown under the dice during a match, enter it with the room code to take
            back your seat with your cash, properties and place on the board
          </p>

          <div className="join-room-row rejoin-row">
            <input
              className="lobby-input room-code-input"
              type="text"
              value={rejoinRoom}
              maxLength="6"
              aria-label="Room code to rejoin"
              autoComplete="off"
              placeholder="Room code"
              onChange={(event) => setRejoinRoom(codeInput(event.target.value))}
            />
            <input
              className="lobby-input room-code-input"
              type="text"
              value={rejoinId}
              maxLength="6"
              aria-label="Your Player ID"
              autoComplete="off"
              placeholder="Player ID"
              onChange={(event) => setRejoinId(codeInput(event.target.value))}
              onKeyDown={(event) => event.key === 'Enter' && rejoinMatch()}
            />

            <GoldButton variant="ghost" onClick={rejoinMatch} loading={busy === 'rejoin'} disabled={Boolean(busy && busy !== 'rejoin')}>
              Rejoin
            </GoldButton>
          </div>
        </div>
      </section>

      <div className={`lobby-toast ${message ? 'lobby-toast--visible' : ''}`} role="status" aria-live="polite">
        {message}
      </div>
    </main>
  );
}
