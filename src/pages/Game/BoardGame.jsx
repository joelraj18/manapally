import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AnimatedBalance from '../../components/AnimatedBalance';
import BrandLogo, { BrandMark } from '../../components/BrandLogo';
import ChatPanel from '../../components/ChatPanel';
import GoldButton from '../../components/GoldButton';
import { premiumAdvisor } from '../../services/premiumAi';
import { BOARD_GRID, BOARD_SPACES } from './boardData';
import * as Estate from './estate';
import { transportKind } from '../../services/roomTransport';
import GameEngine, { AUCTION_INCREMENT, AUCTION_MIN_BID, DEFAULT_TIMING, createInitialState } from './gameEngine';
import { START_REWARD, TOTAL_MATCH_TURNS } from './matchRules';
import { PIECES, PieceMark, PropertyTally } from './pieces.jsx';
import './board-game.css';

import coronationSound from '../../assets/sounds/coronation.mp3';
import pallavanExpressSound from '../../assets/sounds/Pallavan Superfast Express.mp3';
import propertyBoughtSound from '../../assets/sounds/property bought.mp3';
import farakkaExpressSound from '../../assets/sounds/The Farakka Express.mp3';
import utilitySound from '../../assets/sounds/utility.mp3';
import winnerSound from '../../assets/sounds/Winner.mp3';

// Kept for the landing page, which draws its preview from the board data.
export { BOARD_SPACES, BOARD_GRID };
export { STARTING_BALANCE } from './boardData';

const SOUND_FILES = {
  coronation: coronationSound,
  pallavanExpress: pallavanExpressSound,
  farakkaExpress: farakkaExpressSound,
  propertyBought: propertyBoughtSound,
  utility: utilitySound,
  winner: winnerSound,
};

const { routeDetails, utilityDetails, propertyDetails } = Estate;

const getSpaceClass = (space) =>
  `board-space--${space.type} ${space.colorGroup ? `board-space--${space.colorGroup}` : ''}`;

const formatCurrency = (amount) => `₹${Math.round(amount / 1000).toLocaleString('en-IN')}K`;
const formatRupees = (amount) => `₹${Math.round(amount).toLocaleString('en-IN')}`;

const PIP_LAYOUT = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

function DieFace({ value }) {
  return (
    <svg className={`die-face ${value ? '' : 'die-face--idle'}`} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="3" y="3" width="94" height="94" rx="22" />
      {(PIP_LAYOUT[value] || []).map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8.5" />
      ))}
    </svg>
  );
}

// Automated tests on the local transport can run a match at high speed.
const testTiming = () => {
  if (transportKind() !== 'local' || !window.location.search.includes('speed=fast')) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(DEFAULT_TIMING).map(([key, value]) => [key, key === 'auction' ? 1500 : Math.round(value * 0.04)]),
  );
};

const kindLabel = (player) => {
  if (player.kind === 'bot') return 'Computer opponent';
  if (player.kind === 'ai') return 'AI opponent';
  return player.clientId ? 'Player' : 'Host';
};

// Seconds left on the auction clock, ticking locally between snapshots.
function useCountdown(endsAt) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!endsAt) {
      return undefined;
    }

    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [endsAt]);

  return endsAt ? Math.max(0, endsAt - now) : 0;
}

export default function BoardGame({
  players: seatPlayers,
  myPlayerId,
  session,
  soundEnabled = false,
  onMusicToggle,
  onExit,
  onRestart,
}) {
  const isHost = !session || session.isHost;
  const [state, setState] = useState(() => {
    const cached = !isHost && session?.lastGame;
    return cached ? cached.state : createInitialState(seatPlayers);
  });
  const [clockOffset, setClockOffset] = useState(0);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [sheet, setSheet] = useState(null); // 'dice' | 'match' | null
  const [showResults, setShowResults] = useState(true);
  const engineRef = useRef(null);

  // ------------------------------------------------------------- engine

  useEffect(() => {
    if (!isHost) {
      return undefined;
    }

    const engine = new GameEngine({
      players: seatPlayers,
      advisor: premiumAdvisor,
      timing: testTiming(),
      onChange: (next) => {
        setState(next);
        session?.broadcastGame(next);
      },
      onChat: ({ playerId, text }) => {
        if (!session) return;
        const player = engine.player(playerId);

        if (player) {
          session.postAs(player.name, player.pieceKey, text);
        } else {
          session.postSystem(text);
        }
      },
    });

    engineRef.current = engine;
    engine.start();

    const offIntent = session?.on('intent', ({ clientId, action }) => {
      const player = engine.state.players.find((entry) => entry.clientId === clientId);

      if (!player) {
        return;
      }

      switch (action.type) {
        case 'roll':
          engine.playTurn(player.id);
          break;
        case 'purchase':
          engine.resolvePurchase(player.id, action.accept);
          break;
        case 'bid':
          engine.placeBid(player.id, action.amount);
          break;
        case 'manage':
          engine.manageProperty(player.id, Number(action.spaceId), action.action);
          break;
        default:
          break;
      }
    });

    const offLeft = session?.on('peer-left', (clientId) => {
      const player = engine.state.players.find((entry) => entry.clientId === clientId);

      if (player) {
        engine.replaceWithBot(player.id);
      }
    });

    return () => {
      offIntent?.();
      offLeft?.();
      engine.destroy();
      engineRef.current = null;
    };
  }, [isHost, seatPlayers, session]);

  // Guests mirror the host's snapshots.
  useEffect(() => {
    if (isHost || !session) {
      return undefined;
    }

    return session.on('game', ({ state: next, sentAt }) => {
      setState((current) => (next.version >= current.version ? next : current));
      setClockOffset(Date.now() - sentAt);
    });
  }, [isHost, session]);

  // One way to act, whether the rules run here or on the host.
  const act = useCallback(
    (action) => {
      const engine = engineRef.current;

      if (!isHost) {
        session?.sendIntent(action);
        return;
      }

      if (!engine) return;

      switch (action.type) {
        case 'roll':
          engine.playTurn(myPlayerId);
          break;
        case 'purchase':
          engine.resolvePurchase(myPlayerId, action.accept);
          break;
        case 'bid':
          engine.placeBid(myPlayerId, action.amount);
          break;
        case 'manage':
          engine.manageProperty(myPlayerId, action.spaceId, action.action);
          break;
        default:
          break;
      }
    },
    [isHost, myPlayerId, session],
  );

  // -------------------------------------------------------------- sound

  // Every effect sound goes through this gate, so the speaker button in the
  // top bar silences buying, express, coronation and winner sounds as well as
  // the music.
  const soundOnRef = useRef(soundEnabled);
  const audioRef = useRef(null);

  if (!audioRef.current) {
    audioRef.current = Object.fromEntries(
      Object.entries(SOUND_FILES).map(([key, file]) => {
        const audio = new Audio(file);
        audio.preload = 'auto';
        return [key, audio];
      }),
    );
  }

  useEffect(() => {
    soundOnRef.current = soundEnabled;

    if (!soundEnabled) {
      Object.values(audioRef.current).forEach((audio) => audio.pause());
    }
  }, [soundEnabled]);

  useEffect(() => {
    const audios = audioRef.current;
    return () => Object.values(audios).forEach((audio) => audio.pause());
  }, []);

  const lastSfx = useRef(state.sfx?.id ?? 0);

  useEffect(() => {
    const sfx = state.sfx;

    if (!sfx || sfx.id === lastSfx.current) {
      return;
    }

    lastSfx.current = sfx.id;

    if (!soundOnRef.current) {
      return;
    }

    const audio = audioRef.current[sfx.key];

    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }, [state.sfx]);

  // ------------------------------------------------------------ keyboard

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setSelectedProperty(null);
        setSheet(null);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ------------------------------------------------------------ derived

  const players = state.players;
  const activePlayer = players[state.activeIndex];
  const me = players.find((player) => player.id === myPlayerId);
  const amAlive = me && !state.bankrupt[me.id];
  const isMyTurn = activePlayer?.id === myPlayerId;
  const canRoll = isMyTurn && amAlive && !state.busy && !state.gameOver;

  const netWorths = useMemo(
    () =>
      Object.fromEntries(
        players.map((player) => [
          player.id,
          state.bankrupt[player.id] ? 0 : Estate.netWorth(player.id, state.balances, state.deeds, BOARD_SPACES),
        ]),
      ),
    [players, state.balances, state.deeds, state.bankrupt],
  );

  const auctionEndsAt = state.auction ? state.auction.endsAt + (isHost ? 0 : clockOffset) : 0;
  const auctionLeft = useCountdown(auctionEndsAt);

  useEffect(() => {
    if (state.gameOver) {
      setShowResults(true);
    }
  }, [state.gameOver]);

  const ownerOf = (spaceId) => {
    const deed = state.deeds[spaceId];
    return deed ? players.find((player) => player.id === deed.owner) : null;
  };

  // --------------------------------------------------------------- render

  const renderPurchaseOffer = () => {
    const offer = state.purchaseOffer;

    if (!offer || offer.playerId !== myPlayerId) {
      return null;
    }

    const space = BOARD_SPACES[offer.spaceId];
    const balance = state.balances[myPlayerId];
    const canAfford = balance >= space.price;
    const accent = space.colorGroup ? `var(--color-${space.colorGroup})` : space.type === 'route' ? '#2f6170' : '#a46f17';

    return (
      <div className="drawn-card-overlay">
        <div className="property-card purchase-offer" role="dialog" aria-labelledby="purchase-offer-title">
          <header className="property-card-header">
            <div className="property-card-color-bar" style={{ background: accent }} />
            <p className="property-card-kicker">For sale</p>
            <h3 id="purchase-offer-title">{space.name}</h3>
          </header>

          <div className="property-card-body">
            <div className="property-card-row">
              <span>Price</span>
              <strong className={canAfford ? 'amount-positive' : 'amount-negative'}>{formatRupees(space.price)}</strong>
            </div>
            <div className="property-card-row">
              <span>Your balance</span>
              <span>{formatRupees(balance)}</span>
            </div>
            <div className="property-card-row">
              <span>{canAfford ? 'Balance after buying' : 'Shortfall'}</span>
              <span className={canAfford ? '' : 'amount-negative'}>{formatRupees(Math.abs(balance - space.price))}</span>
            </div>

            <p className="property-card-note">
              If you decline, {space.name} goes to auction and every player, you included, can bid for it
            </p>

            <div className="purchase-offer-actions">
              <GoldButton onClick={() => act({ type: 'purchase', accept: true })} disabled={!canAfford}>
                Buy property
              </GoldButton>
              <GoldButton variant="ghost" onClick={() => act({ type: 'purchase', accept: false })}>
                Decline
              </GoldButton>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAuction = () => {
    const auction = state.auction;

    if (!auction) {
      return null;
    }

    const space = BOARD_SPACES[auction.spaceId];
    const leader = players.find((player) => player.id === auction.highBidder);
    const myBalance = state.balances[myPlayerId] ?? 0;
    const minimum = auction.highBid === 0 ? AUCTION_MIN_BID : auction.highBid + AUCTION_INCREMENT;
    const iLead = auction.highBidder === myPlayerId;
    const seconds = Math.ceil(auctionLeft / 1000);
    const steps = [
      { label: `Bid ${formatCurrency(minimum)}`, amount: minimum },
      { label: '+ ₹50K', amount: Math.max(minimum, auction.highBid + 50000) },
      { label: '+ ₹1L', amount: Math.max(minimum, auction.highBid + 100000) },
    ];
    const accent = space.colorGroup ? `var(--color-${space.colorGroup})` : space.type === 'route' ? '#2f6170' : '#a46f17';

    return (
      <div className="drawn-card-overlay auction-overlay">
        <div className="property-card auction-sheet" role="dialog" aria-labelledby="auction-title">
          <header className="property-card-header">
            <div className="property-card-color-bar" style={{ background: accent }} />
            <p className="property-card-kicker">Auction · listed at {formatRupees(space.price)}</p>
            <h3 id="auction-title">{space.name}</h3>
            <span className={`auction-clock ${seconds <= 3 ? 'auction-clock--urgent' : ''}`} aria-live="polite">
              {seconds}s
            </span>
          </header>

          <div className="auction-timer" aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.min(1, auctionLeft / 12000)})` }} />
          </div>

          <div className="property-card-body">
            <div className="auction-lead">
              <span>Highest bid</span>
              <strong key={auction.highBid} className="auction-amount">
                {auction.highBid ? formatRupees(auction.highBid) : 'No bids yet'}
              </strong>
              <span className="auction-leader">
                {leader ? `${leader.id === myPlayerId ? 'You lead' : `${leader.name} leads`}` : `Opening bid ${formatRupees(AUCTION_MIN_BID)}`}
              </span>
            </div>

            {auction.bids.length > 0 && (
              <ol className="auction-bids">
                {[...auction.bids].reverse().map((bid, index) => {
                  const bidder = players.find((player) => player.id === bid.playerId);
                  return (
                    <li key={`${bid.playerId}-${bid.amount}-${index}`}>
                      <span style={{ color: PIECES[bidder?.pieceKey]?.colour }}>{bidder?.name}</span>
                      <span>{formatRupees(bid.amount)}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {amAlive ? (
              <div className="auction-actions">
                {steps.map((step) => (
                  <button
                    key={step.label}
                    type="button"
                    className="auction-bid-button"
                    disabled={iLead || step.amount > myBalance || auctionLeft <= 0}
                    onClick={() => act({ type: 'bid', amount: step.amount })}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="property-card-note">You are watching this auction</p>
            )}

            <p className="auction-hint">
              {iLead
                ? 'You hold the top bid, hold your nerve'
                : `Your cash ${formatRupees(myBalance)} · late bids add a few seconds`}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderPropertyCard = () => {
    if (selectedProperty === null) {
      return null;
    }

    const space = BOARD_SPACES[selectedProperty];
    const details = propertyDetails[selectedProperty];
    const isRoute = space.type === 'route';
    const isUtility = space.type === 'utility';
    const deed = state.deeds[selectedProperty];
    const owner = ownerOf(selectedProperty);
    const accent = isRoute ? '#2f6170' : isUtility ? '#a46f17' : `var(--color-${space.colorGroup})`;
    const kicker = isRoute ? 'Express route' : isUtility ? 'Utility' : 'District';
    const mine = deed && deed.owner === myPlayerId && amAlive && !state.gameOver;
    const balance = state.balances[myPlayerId] ?? 0;

    return (
      <div className="property-card-overlay" onClick={() => setSelectedProperty(null)}>
        <div
          className="property-card"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-labelledby="property-card-title"
        >
          <header className="property-card-header">
            <div className="property-card-color-bar" style={{ background: accent }} />
            <p className="property-card-kicker">{kicker}</p>
            <h3 id="property-card-title">{space.name}</h3>
            <button
              type="button"
              className="property-card-close"
              onClick={() => setSelectedProperty(null)}
              aria-label="Close property details"
            >
              ✕
            </button>
          </header>

          <div className="property-card-body">
            <div className="property-card-row">
              <span>Owner</span>
              <strong>
                {owner ? `${owner.name}${deed.mortgaged ? ' · mortgaged' : ''}` : 'The bank'}
              </strong>
            </div>
            <div className="property-card-row">
              <span>Purchase price</span>
              <strong>{formatRupees(space.price)}</strong>
            </div>

            {isRoute && (
              <>
                <div className="property-card-section">
                  <h4>Rent by routes owned</h4>
                  {routeDetails.rent.map((rent, index) => (
                    <div className="property-card-row" key={rent}>
                      <span>{index + 1} route{index ? 's' : ''} owned</span>
                      <span>{formatRupees(rent)}</span>
                    </div>
                  ))}
                </div>
                <div className="property-card-section">
                  <div className="property-card-row">
                    <span>Mortgage value</span>
                    <span>{formatRupees(routeDetails.mortgage)}</span>
                  </div>
                </div>
                <p className="property-card-note">
                  All four express route spaces, two on the Pallavan Superfast Express and two on The
                  Farakka Express, share this schedule and rent rises with how many routes one owner holds
                </p>
              </>
            )}

            {isUtility && (
              <>
                <div className="property-card-section">
                  <h4>Rent by dice roll</h4>
                  <div className="property-card-row">
                    <span>Owning one utility</span>
                    <span>{utilityDetails.multipliers[0]} × dice roll × {formatRupees(utilityDetails.perPip)}</span>
                  </div>
                  <div className="property-card-row">
                    <span>Owning both utilities</span>
                    <strong>{utilityDetails.multipliers[1]} × dice roll × {formatRupees(utilityDetails.perPip)}</strong>
                  </div>
                </div>
                <div className="property-card-section">
                  <div className="property-card-row">
                    <span>Mortgage value</span>
                    <span>{formatRupees(utilityDetails.mortgage)}</span>
                  </div>
                </div>
              </>
            )}

            {details && (
              <>
                <div className="property-card-section">
                  <h4>Rent schedule</h4>
                  {['Base rent', 'With 1 house', 'With 2 houses', 'With 3 houses', 'With 4 houses', 'With a hotel'].map(
                    (label, index) => (
                      <div className="property-card-row" key={label}>
                        <span>{label}</span>
                        <span>{formatRupees(details.rent[index])}</span>
                      </div>
                    ),
                  )}
                </div>
                <div className="property-card-section">
                  <div className="property-card-row">
                    <span>House cost</span>
                    <span>{formatRupees(details.houseCost)}</span>
                  </div>
                  <div className="property-card-row">
                    <span>Mortgage value</span>
                    <span>{formatRupees(details.mortgage)}</span>
                  </div>
                </div>
                <p className="property-card-note">
                  Own every district in this colour family to build, houses go up evenly across the
                  family before a hotel, and base rent doubles once the family is complete
                </p>
              </>
            )}
          </div>

          {mine && (
            <div className="property-card-actions">
              {!deed.mortgaged && details && (
                <>
                  <button
                    type="button"
                    className="property-action-btn"
                    disabled={!Estate.canBuild(state.deeds, selectedProperty, BOARD_SPACES) || balance < details.houseCost}
                    title="Own the full colour family and build evenly first"
                    onClick={() => act({ type: 'manage', spaceId: selectedProperty, action: 'build' })}
                  >
                    Build {deed.houses === 4 ? 'hotel' : 'house'} ({formatRupees(details.houseCost)})
                  </button>
                  <button
                    type="button"
                    className="property-action-btn"
                    disabled={!Estate.canSellBuilding(state.deeds, selectedProperty, BOARD_SPACES)}
                    onClick={() => act({ type: 'manage', spaceId: selectedProperty, action: 'sell' })}
                  >
                    Sell building ({formatRupees(details.houseCost / 2)})
                  </button>
                </>
              )}
              {!deed.mortgaged && (
                <button
                  type="button"
                  className="property-action-btn"
                  disabled={!Estate.canMortgage(state.deeds, selectedProperty, BOARD_SPACES)}
                  title="Sell the buildings in this family before mortgaging"
                  onClick={() => act({ type: 'manage', spaceId: selectedProperty, action: 'mortgage' })}
                >
                  Mortgage ({formatRupees(Estate.mortgageValue(selectedProperty, BOARD_SPACES))})
                </button>
              )}
              {deed.mortgaged && (
                <button
                  type="button"
                  className="property-action-btn"
                  disabled={balance < Estate.unmortgageCost(selectedProperty, BOARD_SPACES)}
                  title="Includes 10% interest"
                  onClick={() => act({ type: 'manage', spaceId: selectedProperty, action: 'unmortgage' })}
                >
                  Unmortgage ({formatRupees(Estate.unmortgageCost(selectedProperty, BOARD_SPACES))})
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderResults = () => {
    const over = state.gameOver;

    if (!over || !showResults) {
      return null;
    }

    const winners = over.winners.map((id) => players.find((player) => player.id === id)).filter(Boolean);
    const iWon = over.winners.includes(myPlayerId);
    const headline = winners.length > 1
      ? `${winners.map((player) => player.name).join(' and ')} share the crown`
      : iWon
        ? 'You win the crown'
        : `${winners[0]?.name} wins the crown`;

    return (
      <div className="property-card-overlay results-overlay">
        <div className="property-card results-sheet" role="dialog" aria-labelledby="results-title">
          <div className="results-hero">
            <span className="results-crown" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 17h16M5 17 3.5 8l5 3.5L12 5l3.5 6.5 5-3.5L19 17M6 20h12" />
              </svg>
            </span>
            <p className="property-card-kicker">
              {over.reason === 'bankruptcy'
                ? 'Last player standing'
                : `Match complete after ${TOTAL_MATCH_TURNS} turns`}
            </p>
            <h3 id="results-title">{headline}</h3>
            <p className="results-sub">Ranked by total net worth, cash plus the value of every property held</p>
          </div>

          <ol className="results-table">
            {over.standings.map((entry, index) => {
              const isWinner = over.winners.includes(entry.id);
              return (
                <li
                  key={entry.id}
                  className={`results-row ${isWinner ? 'results-row--winner' : ''}`}
                  style={{ '--reveal-delay': `${index * 0.12}s` }}
                >
                  <span className="results-rank">{index + 1}</span>
                  <span className={`results-token seat-${entry.pieceKey}`}>
                    <PieceMark piece={entry.pieceKey} variant="token" title={entry.name} />
                  </span>
                  <span className="results-name">
                    <strong>
                      {entry.name}
                      {entry.id === myPlayerId ? ' (You)' : ''}
                    </strong>
                    <span>
                      {entry.bankrupt
                        ? 'Bankrupt'
                        : `Cash ${formatRupees(entry.cash)} · Property ${formatRupees(entry.propertyValue)} · ${entry.deeds} deed${entry.deeds === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <span className="results-worth">
                    <span>Net worth</span>
                    <strong>{formatRupees(entry.netWorth)}</strong>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="results-actions">
            {isHost && onRestart && <GoldButton onClick={onRestart}>Play again</GoldButton>}
            <GoldButton variant="ghost" onClick={() => setShowResults(false)}>
              View the board
            </GoldButton>
            <button type="button" className="text-link" onClick={onExit}>
              Back to home
            </button>
          </div>
          {!isHost && <p className="results-wait">The host can start a rematch for everyone</p>}
        </div>
      </div>
    );
  };

  const offer = state.purchaseOffer;
  const deciding = offer && offer.playerId !== myPlayerId ? players.find((player) => player.id === offer.playerId) : null;

  return (
    <main className="board-game-page">
      <header className="board-topbar">
        <button className="lobby-brand" type="button" onClick={onExit} aria-label="Leave the game">
          <BrandLogo size={22} />
        </button>

        <div className="round-indicator">
          <span>Turn</span>
          <strong>{state.turnCount.toString().padStart(3, '0')}</strong>
          <span>of {TOTAL_MATCH_TURNS}</span>
          <button
            type="button"
            className="match-info-button"
            onClick={() => setSheet('match')}
            aria-label="How the match works"
            title="How the match works"
          >
            i
          </button>
        </div>

        <div className="board-topbar-actions">
          {session && (
            <span className="room-code-pill" title="Room code">
              {session.code}
            </span>
          )}
          {onMusicToggle && (
            <button
              className="music-toggle-button"
              type="button"
              onClick={onMusicToggle}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? 'Mute all sound' : 'Turn sound on'}
              title={soundEnabled ? 'Sound on' : 'Sound off'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path className="music-icon-body" d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
                {soundEnabled ? (
                  <>
                    <path d="M15.5 9a4 4 0 0 1 0 6" />
                    <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
                  </>
                ) : (
                  <path d="m16 9.5 5 5m0-5-5 5" />
                )}
              </svg>
            </button>
          )}
          <button className="lobby-back" type="button" onClick={onExit}>
            Exit game
          </button>
        </div>
      </header>

      <section className="board-game-layout">
        <div className="board-side">
          <aside className="player-panel">
            <p className="eyebrow">The table</p>

            <div className="player-list">
              {players.map((player, index) => {
                const bankrupt = state.bankrupt[player.id];
                return (
                  <article
                    className={`game-player seat-${player.pieceKey} ${index === state.activeIndex && !state.gameOver ? 'game-player--active' : ''} ${bankrupt ? 'game-player--bankrupt' : ''}`}
                    key={player.id}
                  >
                    <span className="game-player-token">
                      <PieceMark piece={player.pieceKey} variant="token" title={player.name} />
                    </span>

                    <div>
                      <strong>
                        {player.name}
                        {player.id === myPlayerId && <em className="you-chip">You</em>}
                      </strong>
                      <span>
                        {bankrupt
                          ? 'Bankrupt'
                          : index === state.activeIndex && !state.gameOver
                            ? 'Taking a turn'
                            : kindLabel(player)}
                      </span>
                      {state.pardons[player.id] > 0 && (
                        <span className="player-pardons" title="Get Out of Kaidi Kottai Free">
                          ⚖ {state.pardons[player.id]} pardon{state.pardons[player.id] > 1 ? 's' : ''} held
                        </span>
                      )}
                    </div>

                    <AnimatedBalance value={state.balances[player.id]} className="game-player-balance" />
                    <span className="game-player-worth">Net worth {formatRupees(netWorths[player.id])}</span>
                  </article>
                );
              })}
            </div>

            <div className="match-notice">
              <p className="match-notice-label">Latest move</p>
              <p className="match-notice-text" aria-live="polite">
                {state.activity}
              </p>
            </div>
          </aside>

          {session && <ChatPanel session={session} compact />}
        </div>

        <section className="game-board-area" aria-label="Manapally game board">
          <div className="game-board">
            {BOARD_SPACES.map((space) => {
              const [column, row] = BOARD_GRID[space.id];
              const tokens = players.filter(
                (player) => state.positions[player.id] === space.id && !state.bankrupt[player.id],
              );
              const isClickable = ['property', 'route', 'utility'].includes(space.type);
              const deed = state.deeds[space.id];
              const owner = deed ? ownerOf(space.id) : null;

              return (
                <article
                  className={`board-space ${getSpaceClass(space)} ${isClickable ? 'board-space--clickable' : ''} ${
                    selectedProperty === space.id ? 'board-space--selected' : ''
                  } ${owner ? 'board-space--owned' : ''}`}
                  key={space.id}
                  style={{ gridColumn: column, gridRow: row }}
                  onClick={() => isClickable && setSelectedProperty(space.id)}
                  onKeyDown={(event) => {
                    if (isClickable && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setSelectedProperty(space.id);
                    }
                  }}
                  tabIndex={isClickable ? 0 : -1}
                  role={isClickable ? 'button' : undefined}
                  aria-label={
                    isClickable
                      ? `${space.name}, ${owner ? `owned by ${owner.name}` : `for sale at ${formatRupees(space.price)}`}`
                      : undefined
                  }
                >
                  <span className="space-name">
                    {space.name}
                    {space.subname && (
                      <>
                        <br />
                        {space.subname}
                      </>
                    )}
                  </span>

                  {/* Owned spaces swap the price label for a solid owner badge */}
                  {owner ? (
                    <span
                      className={`space-owner seat-${owner.pieceKey} ${deed.mortgaged ? 'space-owner--mortgaged' : ''}`}
                      title={`Owned by ${owner.name}${deed.mortgaged ? ', mortgaged' : ''}`}
                    >
                      <PieceMark piece={owner.pieceKey} variant="token" />
                      <span>{deed.mortgaged ? 'Mortgaged' : owner.id === myPlayerId ? 'Yours' : owner.name}</span>
                    </span>
                  ) : (
                    space.price && <span className="space-cost">{formatCurrency(space.price)}</span>
                  )}

                  {space.icon && !owner && <span className="space-icon">{space.icon}</span>}

                  {deed && owner && (deed.houses > 0 || deed.hotel) && (
                    <span className={`property-tally-container seat-${owner.pieceKey}`}>
                      <PropertyTally houses={deed.houses} hotel={deed.hotel} />
                    </span>
                  )}

                  {tokens.length > 0 && (
                    <div className="space-tokens">
                      {tokens.map((player) => (
                        <span className={`board-token seat-${player.pieceKey}`} key={player.id}>
                          <PieceMark piece={player.pieceKey} variant="token" title={player.name} />
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}

            <div className="board-direction-indicator" aria-label="Movement direction is clockwise">
              <svg viewBox="0 0 100 100" className="direction-arrow">
                <path d="M 50 10 A 40 40 0 1 1 10 50" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
                <polygon points="8,50 14,54 14,46" fill="currentColor" />
              </svg>
            </div>

            <div className="board-centre-art">
              <BrandMark size={64} className="centre-crown" />
              <h1>Manapally</h1>
              <p>Premium South Indian Strategy Board Game</p>
              <div className="centre-divider" />
              <span className="centre-message">
                Pass Rajyabhishekam
                <br />
                to receive {formatCurrency(START_REWARD)}
              </span>
              {deciding && (
                <span className="centre-status">
                  {deciding.name} is deciding on {BOARD_SPACES[offer.spaceId].name}
                </span>
              )}
            </div>
          </div>

          {state.drawnCard && (
            <div className="drawn-card-overlay">
              <div className="drawn-card" role="status" aria-live="polite">
                <span className="drawn-card-deck">{state.drawnCard.deckName}</span>
                <div className="drawn-card-rule" />
                <p className="drawn-card-text">{state.drawnCard.text}</p>
                <span className="drawn-card-holder">Drawn by {state.drawnCard.playerName}</span>
              </div>
            </div>
          )}

          {renderPurchaseOffer()}
          {renderAuction()}
          {renderPropertyCard()}
          {renderResults()}

          {sheet === 'dice' && (
            <div className="property-card-overlay" onClick={() => setSheet(null)}>
              <div className="property-card dice-info-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-labelledby="dice-info-title">
                <header className="property-card-header">
                  <p className="property-card-kicker">Fair play</p>
                  <h3 id="dice-info-title">How the dice work</h3>
                  <button type="button" className="property-card-close" onClick={() => setSheet(null)} aria-label="Close dice information">
                    ✕
                  </button>
                </header>
                <div className="property-card-body dice-info-body">
                  <p className="dice-info-intro">
                    Manapally rolls with the cryptographically secure random generator built into your
                    browser, so every roll is fair and unpredictable
                  </p>
                  <div className="property-card-section">
                    <h4>Two standard dice</h4>
                    <p>
                      Each turn rolls two six sided dice showing 1 to 6 and your token moves their total,
                      three doubles in a row sends you to Kaidi Kottai (Detention)
                    </p>
                  </div>
                  <div className="property-card-section">
                    <h4>Perfectly fair with rejection sampling</h4>
                    <p>
                      Random bytes run from 0 to 255 and 256 does not divide evenly by 6, so any byte of
                      252 or more is discarded and drawn again, leaving exactly 42 values per face
                    </p>
                  </div>
                  <div className="property-card-section">
                    <h4>Real dice probabilities</h4>
                    <ul className="dice-probability-list">
                      <li><strong>7</strong> is the most common total with 6 ways to roll it</li>
                      <li><strong>6 and 8</strong> follow closely with 5 ways each</li>
                      <li><strong>2 and 12</strong> are the rarest with 1 way each</li>
                    </ul>
                  </div>
                  <p className="dice-info-footer">May fortune favour your strategy</p>
                </div>
              </div>
            </div>
          )}

          {sheet === 'match' && (
            <div className="property-card-overlay" onClick={() => setSheet(null)}>
              <div className="property-card match-info-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-labelledby="match-info-title">
                <header className="property-card-header">
                  <p className="property-card-kicker">Match rules</p>
                  <h3 id="match-info-title">How a match ends</h3>
                  <button type="button" className="property-card-close" onClick={() => setSheet(null)} aria-label="Close match information">
                    ✕
                  </button>
                </header>
                <div className="property-card-body dice-info-body">
                  <p className="dice-info-intro">
                    The richest estate wins, measured by total net worth when the match ends
                  </p>
                  <div className="property-card-section">
                    <h4>Two ways to finish</h4>
                    <ul className="dice-probability-list">
                      <li>All {TOTAL_MATCH_TURNS} turns shared by the table have been played</li>
                      <li>Every player except one has gone bankrupt</li>
                    </ul>
                  </div>
                  <div className="property-card-section">
                    <h4>Net worth</h4>
                    <p>
                      Cash plus the purchase value of every district, route and utility you hold, plus half
                      the cost of your houses and hotels, mortgaged property counts at its value minus the
                      mortgage
                    </p>
                  </div>
                  <div className="property-card-section">
                    <h4>Auctions</h4>
                    <p>
                      When a player declines an unowned space it goes to auction straight away, bids rise in
                      steps of {formatRupees(AUCTION_INCREMENT)} and a late bid keeps the clock open a few
                      seconds longer
                    </p>
                  </div>
                  <div className="property-card-section">
                    <h4>Running short</h4>
                    <p>
                      If you cannot pay, buildings are sold and districts mortgaged automatically, and if that
                      is still not enough you are bankrupt and your estate passes to the player you owed
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="turn-panel">
          <p className="eyebrow">Current turn</p>

          <div className="turn-player">
            <span className={`turn-token seat-${activePlayer.pieceKey}`}>
              <PieceMark piece={activePlayer.pieceKey} variant="token" title={activePlayer.name} />
            </span>
            <div>
              <strong>{activePlayer.id === myPlayerId ? 'Your turn' : activePlayer.name}</strong>
              <span>
                {state.gameOver
                  ? 'The match is over'
                  : activePlayer.id === myPlayerId
                    ? 'The court awaits your decision'
                    : `${kindLabel(activePlayer)} is making a move`}
              </span>
            </div>
          </div>

          <div
            className={`dice-display ${state.rolling ? 'dice-display--rolling' : ''}`}
            aria-live="polite"
            aria-label={state.dice ? `Rolled ${state.dice[0]} and ${state.dice[1]}` : 'Dice ready'}
          >
            <div className="dice-pair">
              <DieFace value={state.dice?.[0]} />
              <DieFace value={state.dice?.[1]} />
            </div>
            <span className="dice-total">
              {state.dice ? `Total ${state.dice[0] + state.dice[1]}` : state.rolling ? 'Rolling' : 'Ready to roll'}
            </span>
          </div>

          <div className="dice-info-row">
            <p className="dice-transparency-label">Secure roll by Web Crypto</p>
            <button type="button" className="dice-info-button" onClick={() => setSheet('dice')}>
              How the dice work
            </button>
          </div>

          <GoldButton
            loading={isMyTurn && state.busy && !state.gameOver}
            disabled={!canRoll}
            onClick={() => act({ type: 'roll' })}
          >
            {state.gameOver
              ? 'Match complete'
              : !amAlive
                ? 'You are bankrupt'
                : isMyTurn
                  ? 'Roll the dice'
                  : `Waiting for ${activePlayer.name}`}
          </GoldButton>

          {state.gameOver && !showResults && (
            <button type="button" className="text-link results-reopen" onClick={() => setShowResults(true)}>
              Show final standings <span aria-hidden="true">›</span>
            </button>
          )}

          <p className="turn-tip">
            Tap any district, route or utility on the board to see its owner, rent and building costs
          </p>
        </aside>
      </section>
    </main>
  );
}
