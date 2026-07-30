import { useMemo, useState } from 'react';
import GoldButton from '../../components/GoldButton';
import './board-game.css';

const STARTING_BALANCE = 1500;
const START_BONUS = 200;

const spaces = [
  {
    id: 0,
    name: 'Rajamahal Square',
    type: 'start',
    icon: '♛',
  },

  {
    id: 1,
    name: 'Malabar Spice Market',
    type: 'district',
    family: 'spice',
    cost: 100,
  },
  {
    id: 2,
    name: 'Royal Decree',
    type: 'fate',
    icon: '✧',
  },
  {
    id: 3,
    name: 'Coconut Grove',
    type: 'district',
    family: 'spice',
    cost: 120,
  },
  {
    id: 4,
    name: 'Royal Treasury',
    type: 'levy',
    icon: '₹',
  },
  {
    id: 5,
    name: 'Jasmine Gardens',
    type: 'district',
    family: 'spice',
    cost: 140,
  },
  {
    id: 6,
    name: 'Deccan Trade Route',
    type: 'route',
    cost: 200,
  },

  {
    id: 7,
    name: 'Nilgiri Hills',
    type: 'district',
    family: 'highlands',
    cost: 180,
  },
  {
    id: 8,
    name: 'Utsavam',
    type: 'festival',
    icon: '✦',
  },
  {
    id: 9,
    name: 'Coffee Estate',
    type: 'district',
    family: 'highlands',
    cost: 220,
  },
  {
    id: 10,
    name: 'Simha Dwaram',
    type: 'gate',
    icon: '♜',
  },
  {
    id: 11,
    name: 'Sandalwood Forest',
    type: 'district',
    family: 'highlands',
    cost: 260,
  },
  {
    id: 12,
    name: 'Coromandel Route',
    type: 'route',
    cost: 300,
  },

  {
    id: 13,
    name: 'Silk Bazaar',
    type: 'district',
    family: 'heritage',
    cost: 320,
  },
  {
    id: 14,
    name: 'Royal Decree',
    type: 'fate',
    icon: '✧',
  },
  {
    id: 15,
    name: 'Grand Utsavam',
    type: 'festival',
    icon: '✦',
  },
  {
    id: 16,
    name: 'Heritage Courtyard',
    type: 'district',
    family: 'heritage',
    cost: 360,
  },
  {
    id: 17,
    name: 'Royal Palace',
    type: 'district',
    family: 'heritage',
    cost: 400,
  },
  {
    id: 18,
    name: 'Western Ghats Trail',
    type: 'route',
    cost: 400,
  },
  {
    id: 19,
    name: 'Silicon Valley South',
    type: 'district',
    family: 'innovation',
    cost: 450,
  },
];

const gridCoordinates = [
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 6],
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [5, 1],
  [4, 1],
  [3, 1],
  [2, 1],
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
];

const players = [
  {
    id: 'host',
    name: 'You',
    token: '♞',
    color: 'emerald',
  },
  {
    id: 'rival',
    name: 'Arjun',
    token: '🪔',
    color: 'ruby',
  },
];

const getSpaceClass = (space) => {
  const typeClasses = {
    start: 'board-space--start',
    district: 'board-space--district',
    fate: 'board-space--fate',
    levy: 'board-space--levy',
    route: 'board-space--route',
    festival: 'board-space--festival',
    gate: 'board-space--gate',
  };

  const familyClass = space.family
    ? `board-space--${space.family}`
    : '';

  return `${typeClasses[space.type] || ''} ${familyClass}`;
};

export default function BoardGame({ onExit }) {
  const [positions, setPositions] = useState({
    host: 0,
    rival: 7,
  });

  const [balances, setBalances] = useState({
    host: STARTING_BALANCE,
    rival: STARTING_BALANCE,
  });

  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [diceValue, setDiceValue] = useState(null);
  const [isRolling, setIsRolling] = useState(false);
  const [activityText, setActivityText] = useState(
    'Your journey begins at Rajamahal Square. Roll the royal dice.',
  );

  const activePlayer = players[activePlayerIndex];

  const playerPositions = useMemo(
    () =>
      players.reduce((result, player) => {
        result[player.id] = positions[player.id];
        return result;
      }, {}),
    [positions],
  );

  const movePlayer = (playerId, moveBy) => {
    const currentPosition = positions[playerId];
    const nextPosition = currentPosition + moveBy;
    const passedStart = nextPosition >= spaces.length;

    setPositions((currentPositions) => ({
      ...currentPositions,
      [playerId]: nextPosition % spaces.length,
    }));

    if (passedStart) {
      setBalances((currentBalances) => ({
        ...currentBalances,
        [playerId]: currentBalances[playerId] + START_BONUS,
      }));
    }

    return passedStart;
  };

  const completeArjunTurn = () => {
    const arjunRoll = Math.floor(Math.random() * 6) + 1;

    window.setTimeout(() => {
      const passedStart = movePlayer('rival', arjunRoll);

      window.setTimeout(() => {
        setActivePlayerIndex(0);
        setDiceValue(null);

        setActivityText(
          `Arjun advanced ${arjunRoll} spaces. The kingdom awaits your move.${
            passedStart
              ? ` Arjun received ${START_BONUS} Sovereigns for passing Rajamahal Square.`
              : ''
          }`,
        );
      }, 700);
    }, 850);
  };

  const rollDice = () => {
    if (isRolling || activePlayer.id !== 'host') {
      return;
    }

    setIsRolling(true);
    setActivityText('The royal dice are rolling...');

    window.setTimeout(() => {
      const result = Math.floor(Math.random() * 6) + 1;
      const passedStart = movePlayer('host', result);

      setDiceValue(result);
      setIsRolling(false);
      setActivePlayerIndex(1);

      setActivityText(
        `You rolled ${result}. Your journey continues across the kingdom.${
          passedStart
            ? ` You received ${START_BONUS} Sovereigns for passing Rajamahal Square.`
            : ''
        }`,
      );

      completeArjunTurn();
    }, 620);
  };

  return (
    <main className="board-game-page">
      <header className="board-topbar">
        <button className="lobby-brand" type="button" onClick={onExit}>
          <span className="brand-mark">M</span>
          <span>MANAPALLY</span>
        </button>

        <div className="round-indicator">
          <span>Round</span>
          <strong>01</strong>
          <i />
          <span>of 18</span>
        </div>

        <button className="lobby-back" type="button" onClick={onExit}>
          Exit game
        </button>
      </header>

      <section className="board-game-layout">
        <aside className="player-panel">
          <p className="eyebrow">The table</p>

          <div className="player-list">
            {players.map((player, index) => (
              <article
                className={`game-player ${
                  index === activePlayerIndex
                    ? 'game-player--active'
                    : ''
                }`}
                key={player.id}
              >
                <span
                  className={`game-player-token game-player-token--${player.color}`}
                >
                  {player.token}
                </span>

                <div>
                  <strong>{player.name}</strong>
                  <span>
                    {index === activePlayerIndex
                      ? 'Taking a turn'
                      : 'Considering the court'}
                  </span>
                </div>

                <b>
                  {balances[player.id].toLocaleString()} S
                </b>
              </article>
            ))}
          </div>

          <div className="match-notice">
            <span>✦</span>
            <p>{activityText}</p>
          </div>
        </aside>

        <section
          className="game-board-area"
          aria-label="Manapally game board"
        >
          <div className="game-board">
            {spaces.map((space) => {
              const [column, row] = gridCoordinates[space.id];

              const playersOnSpace = players.filter(
                (player) => playerPositions[player.id] === space.id,
              );

              return (
                <article
                  className={`board-space ${getSpaceClass(space)}`}
                  key={space.id}
                  style={{
                    gridColumn: column,
                    gridRow: row,
                  }}
                >
                  <span className="space-name">{space.name}</span>

                  {space.cost && (
                    <span className="space-cost">
                      {space.cost} S
                    </span>
                  )}

                  {space.icon && (
                    <span className="space-icon">{space.icon}</span>
                  )}

                  {playersOnSpace.length > 0 && (
                    <div className="space-tokens">
                      {playersOnSpace.map((player) => (
                        <span
                          className={`board-token board-token--${player.color}`}
                          key={player.id}
                          title={player.name}
                        >
                          {player.token}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}

            <div className="board-centre-art">
              <span className="centre-crown">✦</span>

              <h1>MANAPALLY</h1>

              <p>THE ROYAL STRATEGY GAME</p>

              <div className="centre-divider" />

              <span className="centre-message">
                Pass Rajamahal Square
                <br />
                to receive +200 Sovereigns
              </span>
            </div>
          </div>
        </section>

        <aside className="turn-panel">
          <p className="eyebrow">Current turn</p>

          <div className="turn-player">
            <span
              className={`turn-token turn-token--${activePlayer.color}`}
            >
              {activePlayer.token}
            </span>

            <div>
              <strong>{activePlayer.name}</strong>

              <span>
                {activePlayer.id === 'host'
                  ? 'The court awaits your decision.'
                  : 'Arjun is making his move.'}
              </span>
            </div>
          </div>

          <div
            className={`dice-display ${
              isRolling ? 'dice-display--rolling' : ''
            }`}
          >
            <span>{diceValue || '✦'}</span>
          </div>

          <GoldButton
            icon="◆"
            loading={isRolling}
            disabled={activePlayer.id !== 'host'}
            onClick={rollDice}
          >
            {activePlayer.id === 'host'
              ? 'Roll the dice'
              : 'Awaiting Arjun'}
          </GoldButton>

          <p className="turn-tip">
            Complete a district family to unlock prestigious landmarks
            and elevate your influence.
          </p>
        </aside>
      </section>
    </main>
  );
}