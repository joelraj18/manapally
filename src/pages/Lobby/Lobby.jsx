import { useMemo, useState } from 'react';
import BrandLogo from '../../components/BrandLogo';
import GoldButton from '../../components/GoldButton';
import { PIECES, PIECE_ORDER, PieceMark } from '../Game/pieces.jsx';
import './lobby.css';
import RoomWaiting from './RoomWaiting';

const playerOptions = PIECE_ORDER.map((key) => ({
  id: key,
  name: PIECES[key].label,
  color: PIECES[key].colour,
}));

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';

const createRoomCode = () =>
  Array.from(
    { length: 6 },
    () =>
      ROOM_CODE_CHARACTERS[
        Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length)
      ],
  ).join('');

const nextSteps = [
  'Choose a display name and a royal piece',
  'Create a room to receive your invitation code',
  'Pick a table of 2, 3 or 4 seats and start, AI opponents fill any open seat',
];

export default function Lobby({ onBack, onStartGame, initialPiece = 'lamp' }) {
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [createdRoomCode, setCreatedRoomCode] = useState('');
  const [isWaitingRoom, setIsWaitingRoom] = useState(false);
  const [selectedToken, setSelectedToken] = useState(
    PIECES[initialPiece] ? initialPiece : 'lamp',
  );
  const [message, setMessage] = useState('');

  const selectedPlayer = useMemo(
    () => playerOptions.find((player) => player.id === selectedToken) || playerOptions[0],
    [selectedToken],
  );

  const showMessage = (text) => {
    setMessage(text);

    window.setTimeout(() => {
      setMessage('');
    }, 2600);
  };

  const createRoom = () => {
    if (displayName.trim().length < 2) {
      showMessage('Please enter a display name with at least 2 letters');
      return;
    }

    const newRoomCode = createRoomCode();

    setRoomCode(newRoomCode);
    setCreatedRoomCode(newRoomCode);
    setIsWaitingRoom(true);
    showMessage('Your private table is ready');
  };

  const copyInviteCode = async () => {
    if (!createdRoomCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdRoomCode);
      showMessage('Invitation code copied');
    } catch {
      showMessage(`Copy this code: ${createdRoomCode}`);
    }
  };

  const joinRoom = () => {
    if (roomCode.trim().length !== 6) {
      showMessage('Enter the 6 character room code from your host');
      return;
    }

    showMessage('Joining by code is coming soon, create a room to play now');
  };

  if (isWaitingRoom) {
    return (
      <RoomWaiting
        roomCode={createdRoomCode}
        hostName={displayName}
        hostToken={selectedToken}
        onBack={() => setIsWaitingRoom(false)}
        onStartGame={onStartGame}
      />
    );
  }

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
            <em>inner circle</em>
          </h1>

          <p>
            Choose your royal piece, open a private table and share the
            invitation with the people you play with
          </p>

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
            Private rooms for 2 to 4 players
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
            value={displayName}
            placeholder="How shall the court know you?"
            onChange={(event) => setDisplayName(event.target.value)}
          />

          <div className="token-heading">
            <div>
              <p className="field-label">Choose your piece</p>
              <span>Every piece plays by the same rules</span>
            </div>

            <span className="selected-token-name">
              {selectedPlayer.name}
            </span>
          </div>

          <div className="token-picker">
            {playerOptions.map((player) => (
              <button
                key={player.id}
                type="button"
                className={`token-choice ${
                  selectedToken === player.id
                    ? 'token-choice--selected'
                    : ''
                }`}
                style={{ '--token-color': player.color, color: player.color }}
                onClick={() => setSelectedToken(player.id)}
                aria-pressed={selectedToken === player.id}
                aria-label={`Choose ${player.name}`}
              >
                <PieceMark piece={player.id} variant="token" />
              </button>
            ))}
          </div>

          <GoldButton onClick={createRoom}>Create a private room</GoldButton>

          {createdRoomCode && (
            <div className="room-created-panel">
              <div>
                <span className="room-created-label">
                  Your invitation code
                </span>

                <strong>{createdRoomCode}</strong>
              </div>

              <GoldButton
                variant="ghost"
                size="small"
                onClick={copyInviteCode}
              >
                Copy
              </GoldButton>
            </div>
          )}

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
              placeholder="Room code"
              onChange={(event) =>
                setRoomCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, ''),
                )
              }
            />

            <GoldButton variant="ghost" onClick={joinRoom}>
              Join room
            </GoldButton>
          </div>
        </div>
      </section>

      <div
        className={`lobby-toast ${
          message ? 'lobby-toast--visible' : ''
        }`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </main>
  );
}
