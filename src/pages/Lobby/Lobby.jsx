import { useMemo, useState } from 'react';
import GoldButton from '../../components/GoldButton';
import './lobby.css';
import RoomWaiting from './RoomWaiting';

const playerOptions = [
  {
    id: 'elephant',
    name: 'Royal Elephant',
    icon: '♞',
    color: '#0f785d',
  },
  {
    id: 'veena',
    name: 'Veena',
    icon: '♬',
    color: '#8d2434',
  },
  {
    id: 'coffee',
    name: 'Coffee Tumbler',
    icon: '◒',
    color: '#a66b2e',
  },
  {
    id: 'bell',
    name: 'Temple Bell',
    icon: '♢',
    color: '#1e578c',
  },
];

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';

const createRoomCode = () =>
  Array.from(
    { length: 6 },
    () =>
      ROOM_CODE_CHARACTERS[
        Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length)
      ],
  ).join('');

  export default function Lobby({ onBack, onStartGame }) {
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [createdRoomCode, setCreatedRoomCode] = useState('');
  const [isWaitingRoom, setIsWaitingRoom] = useState(false);
  const [selectedToken, setSelectedToken] = useState(playerOptions[0].id);
  const [message, setMessage] = useState('');

  const selectedPlayer = useMemo(
    () => playerOptions.find((player) => player.id === selectedToken),
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
      showMessage('Please enter a display name with at least 2 letters.');
      return;
    }

    const newRoomCode = createRoomCode();

    setRoomCode(newRoomCode);
    setCreatedRoomCode(newRoomCode);
    setIsWaitingRoom(true);
    showMessage('Your private table is ready.');
  };

  const copyInviteCode = async () => {
    if (!createdRoomCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdRoomCode);
      showMessage('Invite code copied to your clipboard.');
    } catch {
      showMessage(`Copy this code: ${createdRoomCode}`);
    }
  };

  const joinRoom = () => {
    if (roomCode.trim().length !== 6) {
      showMessage('Enter the 6-character room code from your host.');
      return;
    }

    showMessage('Connecting to this room will be enabled soon.');
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
        <button className="lobby-brand" type="button" onClick={onBack}>
          <span className="brand-mark">M</span>
          <span>MANAPALLY</span>
        </button>

        <button className="lobby-back" type="button" onClick={onBack}>
          ← Return home
        </button>
      </div>

      <section className="lobby-layout">
        <div className="lobby-intro">
          <p className="eyebrow">Private game rooms</p>

          <h1>
            Gather your
            <br />
            <em>inner circle.</em>
          </h1>

          <p>
            Choose your royal piece, create a private table, and send
            the invitation to your friends.
          </p>

          <div className="lobby-status">
            <span className="status-dot" />
            Private online rooms · 2–4 players
          </div>
        </div>

        <div className="lobby-panel">
          <div className="lobby-panel-heading">
            <span className="panel-number">I</span>

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
              <span>Reserved for this game</span>
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
                style={{ '--token-color': player.color }}
                onClick={() => setSelectedToken(player.id)}
                aria-pressed={selectedToken === player.id}
                aria-label={`Choose ${player.name}`}
              >
                <span>{player.icon}</span>
              </button>
            ))}
          </div>

          <GoldButton icon="✦" onClick={createRoom}>
            Create a private room
          </GoldButton>

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
                icon="⧉"
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
              placeholder="ROOM CODE"
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