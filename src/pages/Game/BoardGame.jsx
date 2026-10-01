import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import BrandLogo, { BrandMark } from '../../components/BrandLogo';
import GoldButton from '../../components/GoldButton';
import {
  TOTAL_MATCH_TURNS,
  START_REWARD,
  activeSeatForTurn,
  calculateWinner,
} from './matchRules';
import { seatPieces, PIECES, PieceMark, PropertyTally } from './pieces.jsx';
import * as Estate from './estate.js';
import './board-game.css';

// Import sound effects
import coronationSound from '../../assets/sounds/coronation.mp3';
import pallavanExpressSound from '../../assets/sounds/Pallavan Superfast Express.mp3';
import farakkaExpressSound from '../../assets/sounds/The Farakka Express.mp3';
import propertyBoughtSound from '../../assets/sounds/property bought.mp3';
import utilitySound from '../../assets/sounds/utility.mp3';
import winnerSound from '../../assets/sounds/Winner.mp3';

// Game configuration constants
const STARTING_BALANCE = 1500000; // ₹15,00,000
const MOVEMENT_STEP_DURATION = 120; // milliseconds per space

// Cryptographically secure random die roll (1-6)
// Uses rejection sampling to avoid modulo bias
const rollDie = () => {
  const buf = new Uint8Array(1);
  const limit = 252; // 256 - (256 % 6), largest multiple of 6 that fits in a byte
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return (buf[0] % 6) + 1;
};

// Roll two dice and return values with double detection
const rollDice = () => {
  const d1 = rollDie();
  const d2 = rollDie();
  return { d1, d2, total: d1 + d2, isDouble: d1 === d2 };
};

// Cryptographically secure index in [0, range), drawn with the same rejection
// sampling the dice use: discard any byte at or above the largest multiple of
// `range` that fits in a byte, so every card is exactly as likely as any other.
const randomIndex = (range) => {
  const buf = new Uint8Array(1);
  const limit = 256 - (256 % range);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % range;
};

// Draw one card from a deck using the crypto-backed index above.
const drawCard = (deck) => deck[randomIndex(deck.length)];

// Property details for information card
const propertyDetails = {
  1: { rent: [2000, 10000, 30000, 90000, 160000, 250000], houseCost: 50000, mortgage: 30000 },
  3: { rent: [4000, 20000, 60000, 180000, 320000, 450000], houseCost: 50000, mortgage: 30000 },
  6: { rent: [6000, 30000, 90000, 270000, 400000, 550000], houseCost: 50000, mortgage: 50000 },
  8: { rent: [6000, 30000, 90000, 270000, 400000, 550000], houseCost: 50000, mortgage: 50000 },
  9: { rent: [8000, 40000, 100000, 300000, 450000, 600000], houseCost: 50000, mortgage: 60000 },
  11: { rent: [10000, 50000, 150000, 450000, 625000, 750000], houseCost: 100000, mortgage: 70000 },
  13: { rent: [10000, 50000, 150000, 450000, 625000, 750000], houseCost: 100000, mortgage: 70000 },
  14: { rent: [12000, 60000, 180000, 500000, 700000, 900000], houseCost: 100000, mortgage: 80000 },
  16: { rent: [14000, 70000, 200000, 550000, 750000, 950000], houseCost: 100000, mortgage: 90000 },
  18: { rent: [14000, 70000, 200000, 550000, 750000, 950000], houseCost: 100000, mortgage: 90000 },
  19: { rent: [16000, 80000, 220000, 600000, 800000, 1000000], houseCost: 100000, mortgage: 100000 },
  21: { rent: [18000, 90000, 250000, 700000, 875000, 1050000], houseCost: 150000, mortgage: 110000 },
  23: { rent: [18000, 90000, 250000, 700000, 875000, 1050000], houseCost: 150000, mortgage: 110000 },
  24: { rent: [20000, 100000, 300000, 750000, 925000, 1100000], houseCost: 150000, mortgage: 120000 },
  26: { rent: [22000, 110000, 330000, 800000, 975000, 1150000], houseCost: 150000, mortgage: 130000 },
  27: { rent: [22000, 110000, 330000, 800000, 975000, 1150000], houseCost: 150000, mortgage: 130000 },
  29: { rent: [24000, 120000, 360000, 850000, 1025000, 1200000], houseCost: 150000, mortgage: 140000 },
  31: { rent: [26000, 130000, 390000, 900000, 1100000, 1275000], houseCost: 200000, mortgage: 150000 },
  32: { rent: [26000, 130000, 390000, 900000, 1100000, 1275000], houseCost: 200000, mortgage: 150000 },
  34: { rent: [28000, 150000, 450000, 1000000, 1200000, 1400000], houseCost: 200000, mortgage: 160000 },
  37: { rent: [35000, 175000, 500000, 1100000, 1300000, 1500000], houseCost: 200000, mortgage: 175000 },
  39: { rent: [50000, 200000, 600000, 1400000, 1700000, 2000000], houseCost: 200000, mortgage: 200000 },
};

// All four express routes share one schedule; rent scales with how many
// routes a single owner holds rather than with houses.
const routeDetails = {
  price: 200000,
  rent: [25000, 50000, 100000, 200000], // 1, 2, 3, 4 routes owned
  mortgage: 100000,
};

// Both utilities share one schedule. Utilities charge a multiple of the dice
// roll instead of a flat rent.
const utilityDetails = {
  price: 150000,
  multipliers: [4, 10], // one utility owned, both owned
  perPip: 1000,
  mortgage: 75000,
};

// Board landmarks the card decks steer players toward.
const ROUTE_SPACES = [5, 15, 25, 35];
const UTILITY_SPACES = [12, 28];
const DETENTION_SPACE = 10;
const START_SPACE = 0;

// The two decks. Each card carries its printed text plus a machine-readable
// effect; `resolveCardEffect` applies whichever parts of the effect the current
// rules support. Ownership, houses and hotels do not exist yet, so the cards
// that price them still draw and display but settle at nothing owed.
const RAJAS_ORDER_DECK = [
  {
    text: 'Advance to Brihadeeswara Boulevard',
    effect: { kind: 'advance', target: 39 },
  },
  {
    text: 'Advance to Rajyabhishekam and collect ₹2,00,000',
    effect: { kind: 'advance', target: START_SPACE },
  },
  {
    text: 'Advance to Rani Abbakka Avenue, if you pass Rajyabhishekam collect ₹2,00,000',
    effect: { kind: 'advance', target: 24 },
  },
  {
    text: 'Advance to Wodeyar Mysuru Place, if you pass Rajyabhishekam collect ₹2,00,000',
    effect: { kind: 'advance', target: 11 },
  },
  {
    text: 'Advance to the nearest Express route, if it is unowned you may buy it from the Bank and if it is owned pay the owner twice the usual rent',
    effect: { kind: 'nearest-route' },
  },
  {
    text: 'Advance to the nearest Express route, if it is unowned you may buy it from the Bank and if it is owned pay the owner twice the usual rent',
    effect: { kind: 'nearest-route' },
  },
  {
    text: 'Advance to the nearest Utility, if it is unowned you may buy it from the Bank and if it is owned throw the dice and pay the owner ten times the amount thrown × ₹1,000',
    effect: { kind: 'nearest-utility' },
  },
  {
    text: 'The royal treasury pays you a dividend of ₹50,000',
    effect: { kind: 'collect', amount: 50000 },
  },
  {
    text: 'Get Out of Kaidi Kottai Free',
    effect: { kind: 'pardon' },
  },
  {
    text: 'Go back 3 spaces',
    effect: { kind: 'back', steps: 3 },
  },
  {
    text: 'Go directly to Kaidi Kottai, do not pass Rajyabhishekam and do not collect ₹2,00,000',
    effect: { kind: 'detention' },
  },
  {
    text: 'Make general repairs on all your property, pay ₹25,000 for each house and ₹1,00,000 for each hotel',
    effect: { kind: 'repairs', perHouse: 25000, perHotel: 100000 },
  },
  {
    text: 'Chariot speeding fine of ₹15,000',
    effect: { kind: 'pay', amount: 15000 },
  },
  {
    text: 'Take a trip to the Pallavan Superfast Express, if you pass Rajyabhishekam collect ₹2,00,000',
    effect: { kind: 'advance', target: 5 },
  },
  {
    text: 'You have been elected Chief of the Royal Council, pay each player ₹50,000',
    effect: { kind: 'pay-each', amount: 50000 },
  },
  {
    text: 'Your building loan matures, collect ₹1,50,000',
    effect: { kind: 'collect', amount: 150000 },
  },
];

const TEMPLE_HUNDI_DECK = [
  {
    text: 'Advance to Rajyabhishekam and collect ₹2,00,000',
    effect: { kind: 'advance', target: START_SPACE },
  },
  {
    text: 'Treasury error in your favour, collect ₹2,00,000',
    effect: { kind: 'collect', amount: 200000 },
  },
  {
    text: "Royal vaidya's (physician's) fee, pay ₹50,000",
    effect: { kind: 'pay', amount: 50000 },
  },
  {
    text: 'From the sale of grain stock you get ₹50,000',
    effect: { kind: 'collect', amount: 50000 },
  },
  {
    text: 'Get Out of Kaidi Kottai Free',
    effect: { kind: 'pardon' },
  },
  {
    text: 'Go directly to Kaidi Kottai, do not pass Rajyabhishekam and do not collect ₹2,00,000',
    effect: { kind: 'detention' },
  },
  {
    text: 'Festival fund matures, receive ₹1,00,000',
    effect: { kind: 'collect', amount: 100000 },
  },
  {
    text: 'Tax refund from the royal court, collect ₹20,000',
    effect: { kind: 'collect', amount: 20000 },
  },
  {
    text: 'It is your birthday, collect ₹10,000 from every player',
    effect: { kind: 'collect-each', amount: 10000 },
  },
  {
    text: 'Life insurance matures, collect ₹1,00,000',
    effect: { kind: 'collect', amount: 100000 },
  },
  {
    text: 'Pay hospital fees of ₹1,00,000',
    effect: { kind: 'pay', amount: 100000 },
  },
  {
    text: 'Pay gurukul (school) fees of ₹50,000',
    effect: { kind: 'pay', amount: 50000 },
  },
  {
    text: 'Receive a ₹25,000 consultancy fee',
    effect: { kind: 'collect', amount: 25000 },
  },
  {
    text: 'You are assessed for street repair, ₹40,000 per house and ₹1,15,000 per hotel',
    effect: { kind: 'repairs', perHouse: 40000, perHotel: 115000 },
  },
  {
    text: 'You have won second prize in a beauty contest, collect ₹10,000',
    effect: { kind: 'collect', amount: 10000 },
  },
  {
    text: 'You inherit ₹1,00,000',
    effect: { kind: 'collect', amount: 100000 },
  },
];

// How long a drawn card stays on screen before its effect is applied.
const CARD_DISPLAY_DURATION = 3000;

// 40-space board data following the approved specification
const spaces = [
  // Position 0 - Corner (Start)
  {
    id: 0,
    name: 'Rajyabhi shekam',
    subname: '(Coronation)',
    type: 'start',
    icon: '♛',
  },

  // Bottom row: positions 1-9 (left to right visually, but rendered right-to-left)
  {
    id: 1,
    name: 'Pallava Path',
    type: 'property',
    colorGroup: 'maroon',
    price: 60000,
  },
  {
    id: 2,
    name: 'Temple Hundi',
    type: 'community',
    icon: '✦',
  },
  {
    id: 3,
    name: 'Satavahana Street',
    type: 'property',
    colorGroup: 'maroon',
    price: 60000,
  },
  {
    id: 4,
    name: 'Kandayam',
    subname: '(Land Tax)',
    type: 'tax',
    icon: '₹',
  },
  {
    id: 5,
    name: 'Pallavan Superfast Express',
    type: 'route',
    price: 200000,
  },
  {
    id: 6,
    name: 'Chera Road',
    type: 'property',
    colorGroup: 'peacock',
    price: 100000,
  },
  {
    id: 7,
    name: "Raja's Order",
    type: 'chance',
    icon: '✧',
  },
  {
    id: 8,
    name: 'Hoysala Halebidu Marg',
    type: 'property',
    colorGroup: 'peacock',
    price: 100000,
  },
  {
    id: 9,
    name: 'Pandya Madurai Street',
    type: 'property',
    colorGroup: 'peacock',
    price: 120000,
  },

  // Position 10 - Corner
  {
    id: 10,
    name: 'Kaidi Kottai',
    subname: 'Just Visiting',
    type: 'detention',
    icon: '♜',
  },

  // Left column: positions 11-19 (bottom to top)
  {
    id: 11,
    name: 'Wodeyar Mysuru Place',
    type: 'property',
    colorGroup: 'rose',
    price: 140000,
  },
  {
    id: 12,
    name: 'Kaveri Power Company',
    type: 'utility',
    price: 150000,
  },
  {
    id: 13,
    name: 'Travancore Avenue',
    type: 'property',
    colorGroup: 'rose',
    price: 140000,
  },
  {
    id: 14,
    name: 'Nayak Madurai Mahal Road',
    type: 'property',
    colorGroup: 'rose',
    price: 160000,
  },
  {
    id: 15,
    name: 'The Farakka Express',
    type: 'route',
    price: 200000,
  },
  {
    id: 16,
    name: 'Kakatiya Warangal Place',
    type: 'property',
    colorGroup: 'saffron',
    price: 180000,
  },
  {
    id: 17,
    name: 'Temple Hundi',
    type: 'community',
    icon: '✦',
  },
  {
    id: 18,
    name: 'Golconda Fort Avenue',
    type: 'property',
    colorGroup: 'saffron',
    price: 180000,
  },
  {
    id: 19,
    name: 'Chola Thanjavur Avenue',
    type: 'property',
    colorGroup: 'saffron',
    price: 200000,
  },

  // Position 20 - Corner
  {
    id: 20,
    name: 'Ambari Vishram',
    subname: '(Free Parking)',
    type: 'parking',
    icon: '◆',
  },

  // Top row: positions 21-29 (left to right)
  {
    id: 21,
    name: 'Krishnadevaraya Hampi Avenue',
    type: 'property',
    colorGroup: 'kumkum',
    price: 220000,
  },
  {
    id: 22,
    name: "Raja's Order",
    type: 'chance',
    icon: '✧',
  },
  {
    id: 23,
    name: 'Rajaraja Chola Avenue',
    type: 'property',
    colorGroup: 'kumkum',
    price: 220000,
  },
  {
    id: 24,
    name: 'Rani Abbakka Avenue',
    type: 'property',
    colorGroup: 'kumkum',
    price: 240000,
  },
  {
    id: 25,
    name: 'Pallavan Superfast Express',
    type: 'route',
    price: 200000,
  },
  {
    id: 26,
    name: 'Tipu Sultan Avenue',
    type: 'property',
    colorGroup: 'turmeric',
    price: 260000,
  },
  {
    id: 27,
    name: 'Chandragiri Avenue',
    type: 'property',
    colorGroup: 'turmeric',
    price: 260000,
  },
  {
    id: 28,
    name: 'Tungabhadra Water Works',
    type: 'utility',
    price: 150000,
  },
  {
    id: 29,
    name: 'Chalukya Badami Gardens',
    type: 'property',
    colorGroup: 'turmeric',
    price: 280000,
  },

  // Position 30 - Corner
  {
    id: 30,
    name: 'Go to Kaidi Kottai',
    type: 'go-to-detention',
    icon: '⚠',
  },

  // Right column: positions 31-39 (top to bottom)
  {
    id: 31,
    name: 'Padmapuram Avenue',
    type: 'property',
    colorGroup: 'emerald',
    price: 300000,
  },
  {
    id: 32,
    name: 'Vijayanagara Empire Avenue',
    type: 'property',
    colorGroup: 'emerald',
    price: 300000,
  },
  {
    id: 33,
    name: 'Temple Hundi',
    type: 'community',
    icon: '✦',
  },
  {
    id: 34,
    name: 'Mysore Palace Avenue',
    type: 'property',
    colorGroup: 'emerald',
    price: 320000,
  },
  {
    id: 35,
    name: 'The Farakka Express',
    type: 'route',
    price: 200000,
  },
  {
    id: 36,
    name: "Raja's Order",
    type: 'chance',
    icon: '✧',
  },
  {
    id: 37,
    name: 'Meenakshi Amman Place',
    type: 'property',
    colorGroup: 'indigo',
    price: 350000,
  },
  {
    id: 38,
    name: 'Vajra (Diamond) Tax',
    type: 'tax',
    icon: '₹',
  },
  {
    id: 39,
    name: 'Brihadeeswara Boulevard',
    type: 'property',
    colorGroup: 'indigo',
    price: 400000,
  },
];

// Grid coordinates for 40-space square board (11x11 grid)
// Corners at: [1,11], [11,11], [11,1], [1,1]
// Each side has 9 regular spaces between corners
const gridCoordinates = [
  // Position 0: Bottom-right corner
  [11, 11],

  // Positions 1-9: Bottom row, moving left
  [10, 11],
  [9, 11],
  [8, 11],
  [7, 11],
  [6, 11],
  [5, 11],
  [4, 11],
  [3, 11],
  [2, 11],

  // Position 10: Bottom-left corner
  [1, 11],

  // Positions 11-19: Left column, moving up
  [1, 10],
  [1, 9],
  [1, 8],
  [1, 7],
  [1, 6],
  [1, 5],
  [1, 4],
  [1, 3],
  [1, 2],

  // Position 20: Top-left corner
  [1, 1],

  // Positions 21-29: Top row, moving right
  [2, 1],
  [3, 1],
  [4, 1],
  [5, 1],
  [6, 1],
  [7, 1],
  [8, 1],
  [9, 1],
  [10, 1],

  // Position 30: Top-right corner
  [11, 1],

  // Positions 31-39: Right column, moving down
  [11, 2],
  [11, 3],
  [11, 4],
  [11, 5],
  [11, 6],
  [11, 7],
  [11, 8],
  [11, 9],
  [11, 10],
];

// Read only views of the board for the landing page, which draws its preview
// and district guide straight from the game data.
export { spaces as BOARD_SPACES, gridCoordinates as BOARD_GRID, STARTING_BALANCE };

// buildPlayers is called inside the component with the actual props.
const buildPlayers = (hostPiece, playerCount) => {
  const pieceOrder = seatPieces(hostPiece, playerCount);
  return pieceOrder.map((pieceKey, index) => {
    const piece = PIECES[pieceKey];
    return {
      id: `p${index + 1}`,
      name: index === 0 ? 'You' : `Player ${index + 1}`,
      color: piece.colour,
      pieceKey,
    };
  });
};

// Helper function to get space CSS classes
const getSpaceClass = (space) => {
  const typeClasses = {
    start: 'board-space--start',
    property: 'board-space--property',
    community: 'board-space--community',
    chance: 'board-space--chance',
    tax: 'board-space--tax',
    route: 'board-space--route',
    utility: 'board-space--utility',
    detention: 'board-space--detention',
    parking: 'board-space--parking',
    'go-to-detention': 'board-space--go-to-detention',
  };

  const colorGroupClass = space.colorGroup
    ? `board-space--${space.colorGroup}`
    : '';

  return `${typeClasses[space.type] || ''} ${colorGroupClass}`;
};

// Format currency for display
const formatCurrency = (amount) => {
  return `₹${(amount / 1000).toLocaleString()}K`;
};

// Full rupee amount in Indian lakh grouping, e.g. 200000 -> ₹2,00,000
const formatRupees = (amount) => `₹${amount.toLocaleString('en-IN')}`;

// Pip positions for each die face on a 100 unit square.
const PIP_LAYOUT = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

// One die drawn with pips, or a blank resting face before the first roll.
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

export default function BoardGame({ onExit, playerCount = 2, hostPiece = 'lamp', isMusicEnabled = false, onMusicToggle }) {
  const players = useMemo(
    () => buildPlayers(hostPiece, playerCount),
    [hostPiece, playerCount],
  );

  // Initialize state maps with dynamic player IDs
  const initialPositions = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, 0])),
    [players],
  );
  const initialBalances = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, STARTING_BALANCE])),
    [players],
  );
  const initialDoublesCount = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, 0])),
    [players],
  );
  const initialPardons = useMemo(
    () => Object.fromEntries(players.map((p) => [p.id, 0])),
    [players],
  );

  const [positions, setPositions] = useState(initialPositions);
  const [balances, setBalances] = useState(initialBalances);
  const [turnCount, setTurnCount] = useState(0);

  // Active seat is derived purely from completed turn count and table size
  const activePlayerIndex = useMemo(
    () => activeSeatForTurn(turnCount, players.length),
    [turnCount, players.length],
  );
  const [dice1, setDice1] = useState(null);
  const [dice2, setDice2] = useState(null);
  const [isRolling, setIsRolling] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [showDiceInfo, setShowDiceInfo] = useState(false);
  const [showMatchInfo, setShowMatchInfo] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [activityText, setActivityText] = useState(
    'Your journey begins at Rajyabhishekam\nRoll the royal dice to begin',
  );
  const [doublesCount, setDoublesCount] = useState(initialDoublesCount);
  // Unused Get Out of Kaidi Kottai Free cards, held until detention rules land.
  const [pardons, setPardons] = useState(initialPardons);
  // The card currently face-up on screen, or null.
  const [drawnCard, setDrawnCard] = useState(null);
  // deeds: map of spaceId -> { owner: 'p1', houses: 0, hotel: false, mortgaged: false }
  const [deeds, setDeeds] = useState({});
  // Purchase offer modal: { playerId, spaceId, resolve }
  const [purchaseOffer, setPurchaseOffer] = useState(null);
  // Raise funds / insolvency modal: { playerId, debt, creditor, resolve }
  // eslint-disable-next-line no-unused-vars
  const [raiseFunds, setRaiseFunds] = useState(null);

  const movementInProgressRef = useRef(false);
  // Positions mirrored in a ref: the turn handlers read a player's position
  // across `await` boundaries, where a state value captured by the closure
  // would be stale by the time a card moves the token again.
  const positionsRef = useRef(Object.fromEntries(players.map(p => [p.id, 0])));
  // Audio system with actual sound effects
  const audioRefs = useRef({
    coronation: new Audio(coronationSound),
    pallavanExpress: new Audio(pallavanExpressSound),
    farakkaExpress: new Audio(farakkaExpressSound),
    propertyBought: new Audio(propertyBoughtSound),
    utility: new Audio(utilitySound),
    winner: new Audio(winnerSound),
  });

  const playSound = useCallback((soundKey) => {
    const audio = audioRefs.current[soundKey];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => console.log('[Audio] Play prevented:', err));
    }
  }, []);

  const audioHooksRef = useRef({
    diceRoll: () => console.log('[Audio Hook] diceRoll'),
    tokenStep: () => console.log('[Audio Hook] tokenStep'),
    routeLand: (spaceId) => {
      const space = spaces[spaceId];
      if (space && space.name) {
        if (space.name.includes('Pallavan')) {
          playSound('pallavanExpress');
        } else if (space.name.includes('Farakka')) {
          playSound('farakkaExpress');
        }
      }
    },
    utilityLand: () => playSound('utility'),
    passStart: () => playSound('coronation'),
    cardDraw: () => console.log('[Audio Hook] cardDraw'),
    propertyBought: () => playSound('propertyBought'),
    winner: () => playSound('winner'),
  });

  // Every position write goes through here so the ref and the rendered state
  // never disagree.
  const setPlayerPosition = useCallback((playerId, position) => {
    positionsRef.current = { ...positionsRef.current, [playerId]: position };
    setPositions((prev) => ({ ...prev, [playerId]: position }));
  }, []);

  // Single source of truth for the global completed-turn count.
  // Called once per fully resolved player turn; returns true when the match is over.
  const commitTurn = useCallback(() => {
    let matchEnded = false;
    setTurnCount((prev) => {
      const newCount = prev + 1;
      matchEnded = newCount >= TOTAL_MATCH_TURNS;
      if (matchEnded) {
        setGameOver(true);
        audioHooksRef.current.winner();
      }
      return newCount;
    });
    return matchEnded;
  }, []);

  const activePlayer = players[activePlayerIndex];

  const playerPositions = useMemo(
    () =>
      players.reduce((result, player) => {
        result[player.id] = positions[player.id];
        return result;
      }, {}),
    [positions, players],
  );

  // Cash-only winner until property mechanics exist
  const matchResult = useMemo(() => calculateWinner(balances, players), [
    balances,
    players,
  ]);

  // Step-by-step movement with start detection. Every card-driven move runs
  // through here too, so a token never teleports across the board.
  const movePlayerStepByStep = useCallback(
    async (playerId, totalSteps, { backwards = false } = {}) => {
      return new Promise((resolve) => {
        let currentStep = 0;
        let passedStart = false;
        const startPosition = positionsRef.current[playerId];

        const moveOneStep = () => {
          if (currentStep >= totalSteps) {
            resolve(passedStart);
            return;
          }

          currentStep++;
          const offset = backwards ? -currentStep : currentStep;
          const newPosition =
            (startPosition + offset + spaces.length) % spaces.length;

          // Reaching start counts as a crossing. Moving backwards over it
          // never does — you cannot collect by retreating.
          if (newPosition === START_SPACE && !backwards) {
            passedStart = true;
          }

          setPlayerPosition(playerId, newPosition);

          // Play movement audio hook
          audioHooksRef.current.tokenStep();

          setTimeout(moveOneStep, MOVEMENT_STEP_DURATION);
        };

        moveOneStep();
      });
    },
    [setPlayerPosition],
  );

  // Walk a player forward to a specific space, one space at a time.
  const movePlayerToSpace = useCallback(
    async (playerId, targetSpace) => {
      const from = positionsRef.current[playerId];
      const steps = (targetSpace - from + spaces.length) % spaces.length;

      if (steps === 0) return false;

      return movePlayerStepByStep(playerId, steps);
    },
    [movePlayerStepByStep],
  );

  // The next space of a given kind strictly ahead of the player's position.
  const nextSpaceAhead = useCallback((playerId, candidates) => {
    const from = positionsRef.current[playerId];

    // Distance travelling forward only. Standing on a candidate means the next
    // one of its kind is a full lap away, not zero steps away.
    const distanceTo = (space) => {
      const gap = (space - from + spaces.length) % spaces.length;
      return gap === 0 ? spaces.length : gap;
    };

    return candidates.reduce((nearest, candidate) =>
      distanceTo(candidate) < distanceTo(nearest) ? candidate : nearest,
    );
  }, []);

  // Award start reward when passing or landing on start
  const awardStartReward = useCallback((playerId, didPassStart) => {
    if (didPassStart) {
      setBalances((prev) => ({
        ...prev,
        [playerId]: prev[playerId] + START_REWARD,
      }));
      audioHooksRef.current.passStart();
      return true;
    }
    return false;
  }, []);

  // Move cash between the bank and one player.
  const adjustBalance = useCallback((playerId, delta) => {
    setBalances((prev) => ({
      ...prev,
      [playerId]: prev[playerId] + delta,
    }));
  }, []);

  // Transfer cash between two players (or bank via null)
  const transferCash = useCallback((from, to, amount) => {
    setBalances((prev) => ({
      ...prev,
      [from]: prev[from] - amount,
      [to]: prev[to] + amount,
    }));
  }, []);

  // Offer purchase to human player - returns Promise that resolves when answered
  const offerPurchase = useCallback((playerId, spaceId) => {
    return new Promise((resolve) => {
      setPurchaseOffer({ playerId, spaceId, resolve });
    });
  }, []);

  // Handle purchase decision from modal
  const handlePurchaseDecision = useCallback((accept) => {
    if (!purchaseOffer) return;

    const { playerId, spaceId, resolve } = purchaseOffer;
    const space = spaces[spaceId];

    if (accept && balances[playerId] >= space.price) {
      setBalances((prev) => ({ ...prev, [playerId]: prev[playerId] - space.price }));
      setDeeds((prev) => ({
        ...prev,
        [spaceId]: { owner: playerId, houses: 0, hotel: false, mortgaged: false }
      }));
      // Play property bought sound
      audioHooksRef.current.propertyBought();
    }

    setPurchaseOffer(null);
    resolve();
  }, [purchaseOffer, balances]);

  // AI purchase logic - naive: buy if affordable
  const aiDecidePurchase = useCallback((playerId, space) => {
    if (balances[playerId] >= space.price) {
      setBalances((prev) => ({ ...prev, [playerId]: prev[playerId] - space.price }));
      setDeeds((prev) => ({
        ...prev,
        [space.id]: { owner: playerId, houses: 0, hotel: false, mortgaged: false }
      }));
      // Play property bought sound
      audioHooksRef.current.propertyBought();
    }
  }, [balances]);

  // Handle insolvency - returns Promise that resolves when debt is paid or bankruptcy declared
  const handleInsolvency = useCallback(async (playerId, debt, creditor) => {
    const liquidatable = Estate.liquidatableValue(playerId, deeds, spaces);

    if (balances[playerId] + liquidatable < debt) {
      // Bankruptcy - return all deeds to bank
      const playerDeeds = Object.entries(deeds).filter(([, deed]) => deed.owner === playerId);
      setDeeds((prev) => {
        const next = { ...prev };
        playerDeeds.forEach(([spaceId]) => {
          delete next[spaceId];
        });
        return next;
      });
      setBalances((prev) => ({ ...prev, [playerId]: 0 }));
      return;
    }

    // Open raise-funds modal for human player
    if (playerId === 'p1') {
      return new Promise((resolve) => {
        setRaiseFunds({ playerId, debt, creditor, resolve });
      });
    }

    // AI liquidation - naive: sell buildings first, then mortgage
    let currentCash = balances[playerId];
    const updatedDeeds = { ...deeds };

    while (currentCash < debt) {
      // Try selling a building
      const buildingSpace = Object.keys(updatedDeeds).find(
        (spaceId) =>
          updatedDeeds[spaceId].owner === playerId &&
          Estate.canSellBuilding(updatedDeeds, spaceId, spaces)
      );

      if (buildingSpace) {
        const result = Estate.sellOneBuilding(updatedDeeds, buildingSpace, spaces);
        Object.assign(updatedDeeds, result.updatedDeeds);
        currentCash += result.cash;
        continue;
      }

      // Try mortgaging
      const mortgageSpace = Object.keys(updatedDeeds).find(
        (spaceId) =>
          updatedDeeds[spaceId].owner === playerId &&
          Estate.canMortgage(updatedDeeds, spaceId, spaces)
      );

      if (mortgageSpace) {
        const value = Estate.mortgageValue(mortgageSpace, spaces);
        updatedDeeds[mortgageSpace] = { ...updatedDeeds[mortgageSpace], mortgaged: true };
        currentCash += value;
        continue;
      }

      break;
    }

    setDeeds(updatedDeeds);
    setBalances((prev) => ({
      ...prev,
      [playerId]: currentCash - debt,
      [creditor]: prev[creditor] + debt,
    }));
  }, [balances, deeds]);

  // Lets the resolver below call itself for the one card that can land a token
  // on another card space.
  const resolveDrawnCardRef = useRef(null);

  // Draw a card, hold it on screen, then apply its effect. Returns a sentence
  // describing what actually happened for the activity log. Called as part of
  // destination resolution, so the caller still commits exactly one turn.
  const resolveDrawnCard = useCallback(
    async (playerId, deckName, deck) => {
      const card = drawCard(deck);
      const player = players.find((entry) => entry.id === playerId);
      const opponents = players.filter((entry) => entry.id !== playerId);
      const isHost = playerId === 'p1';
      const subject = isHost ? 'You' : player.name;
      const possessive = isHost ? 'your' : `${player.name}'s`;

      audioHooksRef.current.cardDraw();
      setDrawnCard({ deckName, text: card.text, playerName: player.name });

      // The card sits face-up before anything moves or changes hands.
      await new Promise((resolve) =>
        setTimeout(resolve, CARD_DISPLAY_DURATION),
      );
      setDrawnCard(null);

      const { effect } = card;

      switch (effect.kind) {
        case 'advance': {
          setIsMoving(true);
          const passed = await movePlayerToSpace(playerId, effect.target);
          setIsMoving(false);

          const awarded = awardStartReward(playerId, passed);
          let message = `${subject} ${isHost ? 'advance' : 'advances'} to ${
            spaces[effect.target].name
          }`;
          if (awarded) {
            message += `\n${formatRupees(START_REWARD)} collected at Rajyabhishekam`;
          }
          return message;
        }

        case 'nearest-route':
        case 'nearest-utility': {
          const isRoute = effect.kind === 'nearest-route';
          const target = nextSpaceAhead(
            playerId,
            isRoute ? ROUTE_SPACES : UTILITY_SPACES,
          );

          setIsMoving(true);
          const passed = await movePlayerToSpace(playerId, target);
          setIsMoving(false);

          if (isRoute) audioHooksRef.current.routeLand();
          const awarded = awardStartReward(playerId, passed);

          let message = `${subject} ${isHost ? 'advance' : 'advances'} to ${
            spaces[target].name
          }`;
          if (awarded) {
            message += `\n${formatRupees(START_REWARD)} collected at Rajyabhishekam`;
          }
          message += '\nNo rent is charged when a card moves you here';
          return message;
        }

        case 'back': {
          setIsMoving(true);
          await movePlayerStepByStep(playerId, effect.steps, {
            backwards: true,
          });
          setIsMoving(false);

          const landed = spaces[positionsRef.current[playerId]];
          const message = `${subject} ${
            isHost ? 'retreat' : 'retreats'
          } ${effect.steps} spaces to ${landed.name}`;

          // Retreating three from the last Raja's Order lands on Temple Hundi,
          // which draws in turn. Only this card can do that, so the nesting
          // stops one level deep.
          if (landed.type === 'chance' || landed.type === 'community') {
            const nested = await resolveDrawnCardRef.current(
              playerId,
              landed.name,
              landed.type === 'chance' ? RAJAS_ORDER_DECK : TEMPLE_HUNDI_DECK,
            );
            return `${message}\n${nested}`;
          }

          return message;
        }

        case 'detention': {
          setIsMoving(true);
          await movePlayerToSpace(playerId, DETENTION_SPACE);
          setIsMoving(false);

          // Sent directly: no Rajyabhishekam reward, even though the token
          // walks past it.
          return `${subject} ${
            isHost ? 'are' : 'is'
          } sent straight to Kaidi Kottai\nNo Rajyabhishekam reward`;
        }

        case 'collect': {
          adjustBalance(playerId, effect.amount);
          return `${subject} ${isHost ? 'collect' : 'collects'} ${formatRupees(
            effect.amount,
          )}`;
        }

        case 'pay': {
          adjustBalance(playerId, -effect.amount);
          return `${subject} ${isHost ? 'pay' : 'pays'} ${formatRupees(
            effect.amount,
          )}`;
        }

        case 'pay-each': {
          opponents.forEach((opponent) =>
            adjustBalance(opponent.id, effect.amount),
          );
          adjustBalance(playerId, -effect.amount * opponents.length);

          return `${subject} ${isHost ? 'pay' : 'pays'} ${formatRupees(
            effect.amount,
          )} to each of the other ${
            opponents.length === 1 ? 'player' : 'players'
          }, ${formatRupees(effect.amount * opponents.length)} in all`;
        }

        case 'collect-each': {
          opponents.forEach((opponent) =>
            adjustBalance(opponent.id, -effect.amount),
          );
          adjustBalance(playerId, effect.amount * opponents.length);

          return `${subject} ${isHost ? 'collect' : 'collects'} ${formatRupees(
            effect.amount,
          )} from each of the other ${
            opponents.length === 1 ? 'player' : 'players'
          }, ${formatRupees(effect.amount * opponents.length)} in all`;
        }

        case 'pardon': {
          setPardons((prev) => ({
            ...prev,
            [playerId]: prev[playerId] + 1,
          }));

          return `${subject} ${
            isHost ? 'keep' : 'keeps'
          } the pardon, it will free ${possessive} token once detention rules arrive`;
        }

        case 'repairs': {
          // Houses and hotels do not exist yet, so the assessment totals zero.
          return `${subject} ${
            isHost ? 'owe' : 'owes'
          } nothing for repairs this time`;
        }

        default:
          return `${subject} ${isHost ? 'draw' : 'draws'} a card`;
      }
    },
    [
      movePlayerToSpace,
      movePlayerStepByStep,
      nextSpaceAhead,
      awardStartReward,
      adjustBalance,
      players,
    ],
  );

  resolveDrawnCardRef.current = resolveDrawnCard;

  // Handle keyboard events for property card and dice info
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (selectedProperty !== null) {
          setSelectedProperty(null);
        } else if (showDiceInfo) {
          setShowDiceInfo(false);
        } else if (showMatchInfo) {
          setShowMatchInfo(false);
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedProperty, showDiceInfo, showMatchInfo]);

  // Handle AI opponent turn
  const completeAITurn = useCallback(async () => {
    const aiPlayerId = activePlayer.id;
    const aiPlayerName = activePlayer.name;

    // Roll two dice for AI using cryptographically secure random
    const aiDiceResult = rollDice();
    const { d1: aiDice1, d2: aiDice2, total: aiTotal, isDouble: aiIsDouble } = aiDiceResult;

    setDice1(aiDice1);
    setDice2(aiDice2);

    // Check for three doubles in a row -> go to Kaidi Kottai (jail)
    const currentAIDoublesCount = doublesCount[aiPlayerId] || 0;
    if (aiIsDouble) {
      const newAIDoublesCount = currentAIDoublesCount + 1;
      setDoublesCount((prev) => ({ ...prev, [aiPlayerId]: newAIDoublesCount }));

      if (newAIDoublesCount === 3) {
        // Three doubles in a row - send to Kaidi Kottai (space 10)
        setActivityText(
          `${aiPlayerName} rolled doubles three times\n${aiPlayerName} must go to Kaidi Kottai (Detention)`
        );
        setPlayerPosition(aiPlayerId, DETENTION_SPACE);
        setDoublesCount((prev) => ({ ...prev, [aiPlayerId]: 0 }));

        // This turn is fully resolved
        const matchEnded = commitTurn();

        await new Promise((resolve) => setTimeout(resolve, 1800));
        setDice1(null);
        setDice2(null);
        setActivityText(
          matchEnded ? `Match complete after ${TOTAL_MATCH_TURNS} turns` : 'Your turn',
        );

        movementInProgressRef.current = false;
        return;
      }
    } else {
      // Not doubles, reset counter
      setDoublesCount((prev) => ({ ...prev, [aiPlayerId]: 0 }));
    }

    const rollMessage = aiIsDouble
      ? `${aiPlayerName} rolled doubles ${aiDice1} + ${aiDice2} = ${aiTotal}\n${aiPlayerName}'s token is moving`
      : `${aiPlayerName} rolled ${aiDice1} + ${aiDice2} = ${aiTotal}\n${aiPlayerName}'s token is moving`;
    setActivityText(rollMessage);

    await new Promise((resolve) => setTimeout(resolve, 600));

    // Move AI player step by step
    setIsMoving(true);
    const passedStart = await movePlayerStepByStep(aiPlayerId, aiTotal);
    setIsMoving(false);

    const awarded = awardStartReward(aiPlayerId, passedStart);

    // Check if AI landed on route/station
    const landedSpace = spaces[positionsRef.current[aiPlayerId]];
    const isRoute = landedSpace.type === 'route';
    const isUtility = landedSpace.type === 'utility';

    if (isRoute) {
      audioHooksRef.current.routeLand(landedSpace.id);
    } else if (isUtility) {
      audioHooksRef.current.utilityLand();
    }

    let message = `${aiPlayerName} advanced ${aiTotal} spaces to ${landedSpace.name}`;
    if (awarded) {
      message += `\n${aiPlayerName} received ${formatCurrency(START_REWARD)} for passing Rajyabhishekam`;
    }

    // A card draw is part of resolving the destination, so it happens before
    // the turn is committed.
    if (landedSpace.type === 'chance' || landedSpace.type === 'community') {
      setActivityText(`${message}\n${aiPlayerName} draws a card`);
      const cardOutcome = await resolveDrawnCard(
        aiPlayerId,
        landedSpace.name,
        landedSpace.type === 'chance' ? RAJAS_ORDER_DECK : TEMPLE_HUNDI_DECK,
      );
      message += `\n${cardOutcome}`;
    }

    // Property economics: rent or purchase
    if (landedSpace.type === 'property' || landedSpace.type === 'route' || landedSpace.type === 'utility') {
      const deed = deeds[landedSpace.id];

      if (deed && deed.owner !== aiPlayerId && !deed.mortgaged) {
        // Owned by someone else - pay rent
        const rent = Estate.rentFor(deeds, landedSpace.id, aiTotal, spaces);
        if (rent > 0) {
          if (balances[aiPlayerId] < rent) {
            await handleInsolvency(aiPlayerId, rent, deed.owner);
          } else {
            transferCash(aiPlayerId, deed.owner, rent);
            message += `\nPaid ${formatRupees(rent)} rent`;
          }
        }
      } else if (!deed && landedSpace.price) {
        // Unowned and purchasable - AI decides
        aiDecidePurchase(aiPlayerId, landedSpace);
        if (balances[aiPlayerId] >= landedSpace.price) {
          message += `\nPurchased ${landedSpace.name}`;
        }
      }
    }

    // Mark this player's turn as complete (movement and destination resolved)
    const matchEnded = commitTurn();

    // Switch back to next player
    await new Promise((resolve) => setTimeout(resolve, 500));
    setDice1(null);
    setDice2(null);

    message += matchEnded ? `\nMatch complete after ${TOTAL_MATCH_TURNS} turns` : '\nYour turn';

    setActivityText(message);
    movementInProgressRef.current = false;
  }, [
    activePlayer,
    movePlayerStepByStep,
    awardStartReward,
    resolveDrawnCard,
    setPlayerPosition,
    doublesCount,
    commitTurn,
    deeds,
    balances,
    transferCash,
    handleInsolvency,
    aiDecidePurchase,
  ]);

  // Auto-trigger AI turns when it's an AI player's turn
  useEffect(() => {
    // Don't trigger if game is over, movement in progress, or it's the human player's turn
    if (
      gameOver ||
      movementInProgressRef.current ||
      isMoving ||
      isRolling ||
      activePlayer.id === 'p1'
    ) {
      return;
    }

    // It's an AI player's turn - trigger after a short delay
    const timer = setTimeout(() => {
      movementInProgressRef.current = true;
      completeAITurn();
    }, 850);

    return () => clearTimeout(timer);
  }, [activePlayer.id, gameOver, isMoving, isRolling, completeAITurn]);

  // Roll dice handler
  const rollDiceHandler = useCallback(async () => {
    if (
      isRolling ||
      isMoving ||
      movementInProgressRef.current ||
      activePlayer.id !== 'p1' ||
      gameOver
    ) {
      return;
    }

    movementInProgressRef.current = true;
    setIsRolling(true);
    setActivityText('The royal dice are rolling');

    // Play dice roll audio hook
    audioHooksRef.current.diceRoll();

    // Simulate dice rolling animation
    await new Promise((resolve) => setTimeout(resolve, 620));

    // Generate two dice values using cryptographically secure random
    const diceResult = rollDice();
    const { d1, d2, total, isDouble } = diceResult;

    setDice1(d1);
    setDice2(d2);
    setIsRolling(false);

    // Check for three doubles in a row -> go to Kaidi Kottai (jail)
    const currentDoublesCount = doublesCount.p1 || 0;
    if (isDouble) {
      const newDoublesCount = currentDoublesCount + 1;
      setDoublesCount((prev) => ({ ...prev, p1: newDoublesCount }));

      if (newDoublesCount === 3) {
        // Three doubles in a row - send to Kaidi Kottai (space 10)
        setActivityText(
          'Doubles three times\nYou must go to Kaidi Kottai (Detention)'
        );
        setPlayerPosition('p1', DETENTION_SPACE);
        setDoublesCount((prev) => ({ ...prev, p1: 0 }));

        // This turn is fully resolved
        const matchEnded = commitTurn();

        await new Promise((resolve) => setTimeout(resolve, 1800));

        if (matchEnded) {
          setDice1(null);
          setDice2(null);
          setActivityText(`Match complete after ${TOTAL_MATCH_TURNS} turns`);
          movementInProgressRef.current = false;
          return;
        }

        setActivityText(`${players[1]?.name ?? 'Your opponent'} is preparing a move`);

        await new Promise((resolve) => setTimeout(resolve, 850));
        movementInProgressRef.current = false;
        completeAITurn();
        return;
      }
    } else {
      // Not doubles, reset counter
      setDoublesCount((prev) => ({ ...prev, p1: 0 }));
    }

    const rollMessage = isDouble
      ? `You rolled doubles ${d1} + ${d2} = ${total}\nYour token is moving`
      : `You rolled ${d1} + ${d2} = ${total}\nYour token is moving`;
    setActivityText(rollMessage);

    await new Promise((resolve) => setTimeout(resolve, 400));

    // Move player step by step
    setIsMoving(true);
    const passedStart = await movePlayerStepByStep('p1', total);
    setIsMoving(false);

    const awarded = awardStartReward('p1', passedStart);

    // Check if host landed on route or utility
    const landedSpace = spaces[positionsRef.current.p1];
    const isRoute = landedSpace.type === 'route';
    const isUtility = landedSpace.type === 'utility';

    if (isRoute) {
      audioHooksRef.current.routeLand(landedSpace.id);
    } else if (isUtility) {
      audioHooksRef.current.utilityLand();
    }

    let finalMessage = `You advanced ${total} spaces to ${landedSpace.name}`;
    if (awarded) {
      finalMessage += `\nYou received ${formatCurrency(START_REWARD)} for passing Rajyabhishekam`;
    }

    setActivityText(finalMessage);

    // A card draw is part of resolving the destination, so it happens before
    // the turn is committed.
    if (landedSpace.type === 'chance' || landedSpace.type === 'community') {
      setActivityText(`${finalMessage}\nDrawing a card`);
      const cardOutcome = await resolveDrawnCard(
        'p1',
        landedSpace.name,
        landedSpace.type === 'chance' ? RAJAS_ORDER_DECK : TEMPLE_HUNDI_DECK,
      );
      finalMessage += `\n${cardOutcome}`;
      setActivityText(finalMessage);
    }

    // Property economics: rent or purchase
    if (landedSpace.type === 'property' || landedSpace.type === 'route' || landedSpace.type === 'utility') {
      const deed = deeds[landedSpace.id];

      if (deed && deed.owner !== 'p1' && !deed.mortgaged) {
        // Owned by someone else - pay rent
        const rent = Estate.rentFor(deeds, landedSpace.id, total, spaces);
        if (rent > 0) {
          if (balances.p1 < rent) {
            await handleInsolvency('p1', rent, deed.owner);
          } else {
            transferCash('p1', deed.owner, rent);
            finalMessage += `\nPaid ${formatRupees(rent)} rent`;
            setActivityText(finalMessage);
          }
        }
      } else if (!deed && landedSpace.price) {
        // Unowned and purchasable - offer purchase
        await offerPurchase('p1', landedSpace.id);
      }
    }

    // Movement and destination resolved: this turn is complete
    const matchEnded = commitTurn();

    if (matchEnded) {
      setActivityText(`${finalMessage}\nMatch complete after ${TOTAL_MATCH_TURNS} turns`);
      movementInProgressRef.current = false;
      return;
    }

    // Reset movement flag so next player's turn can trigger
    movementInProgressRef.current = false;

    // Activity text will be set by the next player's turn (auto-triggered by useEffect)
    setActivityText(`${finalMessage}\nPreparing the next turn`);
  }, [
    isRolling,
    isMoving,
    activePlayer.id,
    gameOver,
    doublesCount,
    commitTurn,
    movePlayerStepByStep,
    awardStartReward,
    resolveDrawnCard,
    setPlayerPosition,
    completeAITurn,
    deeds,
    balances,
    transferCash,
    handleInsolvency,
    offerPurchase,
    players,
  ]);

  return (
    <main className="board-game-page">
      <header className="board-topbar">
        <button className="lobby-brand" type="button" onClick={onExit} aria-label="Leave the game">
          <BrandLogo size={22} />
        </button>

        <div className="round-indicator">
          <span>Turn</span>
          <strong>{turnCount.toString().padStart(3, '0')}</strong>
          <span>of {TOTAL_MATCH_TURNS}</span>
          <button
            type="button"
            className="match-info-button"
            onClick={() => setShowMatchInfo(true)}
            aria-label="How match length works"
            title="How match length works"
          >
            i
          </button>
        </div>

        <div className="board-topbar-actions">
          {onMusicToggle && (
            <button
              className="music-toggle-button"
              type="button"
              onClick={onMusicToggle}
              aria-pressed={isMusicEnabled}
              aria-label={isMusicEnabled ? 'Mute music' : 'Play music'}
              title={isMusicEnabled ? 'Mute music' : 'Play music'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path className="music-icon-body" d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
                {isMusicEnabled ? (
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
        <aside className="player-panel">
          <p className="eyebrow">The table</p>

          <div className="player-list">
            {players.map((player, index) => (
              <article
                className={`game-player seat-${player.pieceKey} ${
                  index === activePlayerIndex ? 'game-player--active' : ''
                }`}
                key={player.id}
              >
                <span className="game-player-token">
                  <PieceMark piece={player.pieceKey} variant="token" title={player.name} />
                </span>

                <div>
                  <strong>{player.name}</strong>
                  <span>
                    {index === activePlayerIndex
                      ? 'Taking a turn'
                      : 'Considering the court'}
                  </span>
                  {pardons[player.id] > 0 && (
                    <span
                      className="player-pardons"
                      title="Get Out of Kaidi Kottai Free"
                    >
                      ⚖ {pardons[player.id]} pardon
                      {pardons[player.id] > 1 ? 's' : ''} held
                    </span>
                  )}
                </div>

                <b>{formatCurrency(balances[player.id])}</b>
              </article>
            ))}
          </div>

          <div className="match-notice">
            <p className="match-notice-label">Latest move</p>
            <p className="match-notice-text" aria-live="polite">{activityText}</p>
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

              const isClickable =
                space.type === 'property' ||
                space.type === 'route' ||
                space.type === 'utility';

              return (
                <article
                  className={`board-space ${getSpaceClass(space)} ${
                    isClickable ? 'board-space--clickable' : ''
                  } ${selectedProperty === space.id ? 'board-space--selected' : ''}`}
                  key={space.id}
                  style={{
                    gridColumn: column,
                    gridRow: row,
                  }}
                  onClick={() => isClickable && setSelectedProperty(space.id)}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setSelectedProperty(space.id);
                    }
                  }}
                  tabIndex={isClickable ? 0 : -1}
                  role={isClickable ? 'button' : undefined}
                  aria-label={isClickable ? `View details for ${space.name}` : undefined}
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

                  {space.price && (
                    <span className="space-cost">
                      {formatCurrency(space.price)}
                    </span>
                  )}

                  {space.icon && (
                    <span className="space-icon">{space.icon}</span>
                  )}

                  {/* Ownership stamp - faded piece mark in owner's color */}
                  {deeds[space.id] && !deeds[space.id].mortgaged && (() => {
                    const owner = players.find(p => p.id === deeds[space.id].owner);
                    return owner ? (
                      <div className={`ownership-stamp seat-${owner.pieceKey}`}>
                        <PieceMark piece={owner.pieceKey} variant="stamp" />
                      </div>
                    ) : null;
                  })()}

                  {/* Property tally marks - houses and hotel indicators */}
                  {deeds[space.id] && (deeds[space.id].houses > 0 || deeds[space.id].hotel) && (() => {
                    const owner = players.find(p => p.id === deeds[space.id].owner);
                    return owner ? (
                      <div className={`property-tally-container seat-${owner.pieceKey}`}>
                        <PropertyTally
                          houses={deeds[space.id].houses}
                          hotel={deeds[space.id].hotel}
                        />
                      </div>
                    ) : null;
                  })()}

                  {playersOnSpace.length > 0 && (
                    <div className="space-tokens">
                      {playersOnSpace.map((player) => (
                        <span className={`board-token seat-${player.pieceKey}`} key={player.id}>
                          <PieceMark
                            piece={player.pieceKey}
                            variant="token"
                            title={player.name}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}

            {/* Direction indicator - clockwise arrow */}
            <div className="board-direction-indicator" aria-label="Movement direction is clockwise">
              <svg viewBox="0 0 100 100" className="direction-arrow">
                <path
                  d="M 50 10 A 40 40 0 1 1 10 50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
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
            </div>
          </div>

          {/* Drawn card: held on screen for three seconds before it resolves */}
          {drawnCard !== null && (
            <div className="drawn-card-overlay">
              <div
                className="drawn-card"
                role="status"
                aria-live="polite"
                aria-label={`${drawnCard.deckName}, ${drawnCard.text}`}
              >
                <span className="drawn-card-deck">{drawnCard.deckName}</span>
                <div className="drawn-card-rule" />
                <p className="drawn-card-text">{drawnCard.text}</p>
                <span className="drawn-card-holder">
                  Drawn by {drawnCard.playerName}
                </span>
              </div>
            </div>
          )}

          {/* Purchase Offer Modal */}
          {purchaseOffer !== null && (() => {
            const space = spaces[purchaseOffer.spaceId];
            const player = players.find(p => p.id === purchaseOffer.playerId);

            if (!space || !player) return null;

            const canAfford = balances[purchaseOffer.playerId] >= space.price;
            const remaining = balances[purchaseOffer.playerId] - space.price;
            const accentColor = space.colorGroup
              ? `var(--color-${space.colorGroup})`
              : space.type === 'route'
                ? '#2f6170'
                : '#a46f17';

            return (
              <div className="drawn-card-overlay">
                <div
                  className="property-card purchase-offer"
                  role="dialog"
                  aria-labelledby="purchase-offer-title"
                >
                  <header className="property-card-header">
                    <div
                      className="property-card-color-bar"
                      style={{ background: accentColor }}
                    />
                    <p className="property-card-kicker">For sale</p>
                    <h3 id="purchase-offer-title">{space.name}</h3>
                  </header>

                  <div className="property-card-body">
                    <div className="property-card-row">
                      <span>Price</span>
                      <strong className={canAfford ? 'amount-positive' : 'amount-negative'}>
                        {formatRupees(space.price)}
                      </strong>
                    </div>

                    <div className="property-card-row">
                      <span>Your balance</span>
                      <span>{formatRupees(balances[purchaseOffer.playerId])}</span>
                    </div>

                    <div className="property-card-row">
                      <span>{canAfford ? 'Balance after buying' : 'Shortfall'}</span>
                      <span className={canAfford ? '' : 'amount-negative'}>
                        {formatRupees(Math.abs(remaining))}
                      </span>
                    </div>

                    {!canAfford && (
                      <p className="property-card-note property-card-note--warning">
                        You do not have enough cash to buy this space right now
                      </p>
                    )}

                    <div className="purchase-offer-actions">
                      <GoldButton
                        onClick={() => handlePurchaseDecision(true)}
                        disabled={!canAfford}
                      >
                        Buy property
                      </GoldButton>
                      <GoldButton
                        variant="ghost"
                        onClick={() => handlePurchaseDecision(false)}
                      >
                        Decline
                      </GoldButton>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Property Information Card */}
          {selectedProperty !== null && (
            <div
              className="property-card-overlay"
              onClick={() => setSelectedProperty(null)}
            >
              <div
                className="property-card"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="property-card-title"
              >
                {(() => {
                  const space = spaces[selectedProperty];

                  if (!space) return null;

                  const details = propertyDetails[selectedProperty];
                  const isRoute = space.type === 'route';
                  const isUtility = space.type === 'utility';

                  if (!isRoute && !isUtility && !details) return null;

                  const accentColor = isRoute
                    ? '#2f6170'
                    : isUtility
                      ? '#a46f17'
                      : space.colorGroup
                        ? `var(--color-${space.colorGroup})`
                        : '#888';

                  const kicker = isRoute
                    ? 'Express route'
                    : isUtility
                      ? 'Utility'
                      : 'District';

                  return (
                    <>
                      <header className="property-card-header">
                        <div
                          className="property-card-color-bar"
                          style={{ background: accentColor }}
                        />
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

                      {isRoute && (
                        <div className="property-card-body">
                          <div className="property-card-row">
                            <span>Purchase price</span>
                            <strong>{formatRupees(routeDetails.price)}</strong>
                          </div>

                          <div className="property-card-section">
                            <h4>Rent by routes owned</h4>
                            <div className="property-card-row">
                              <span>1 route owned</span>
                              <span>{formatRupees(routeDetails.rent[0])}</span>
                            </div>
                            <div className="property-card-row">
                              <span>2 routes owned</span>
                              <span>{formatRupees(routeDetails.rent[1])}</span>
                            </div>
                            <div className="property-card-row">
                              <span>3 routes owned</span>
                              <span>{formatRupees(routeDetails.rent[2])}</span>
                            </div>
                            <div className="property-card-row">
                              <span>4 routes owned</span>
                              <strong>{formatRupees(routeDetails.rent[3])}</strong>
                            </div>
                          </div>

                          <div className="property-card-section">
                            <div className="property-card-row">
                              <span>Mortgage value</span>
                              <span>{formatRupees(routeDetails.mortgage)}</span>
                            </div>
                          </div>

                          <p className="property-card-note">
                            All four express route spaces, two on the Pallavan Superfast
                            Express and two on The Farakka Express, share this schedule
                            and rent rises with how many routes a single owner holds
                          </p>
                        </div>
                      )}

                      {isUtility && (
                        <div className="property-card-body">
                          <div className="property-card-row">
                            <span>Purchase price</span>
                            <strong>{formatRupees(utilityDetails.price)}</strong>
                          </div>

                          <div className="property-card-section">
                            <h4>Rent by dice roll</h4>
                            <div className="property-card-row">
                              <span>Owning one utility</span>
                              <span>
                                {utilityDetails.multipliers[0]} × dice roll ×{' '}
                                {formatRupees(utilityDetails.perPip)}
                              </span>
                            </div>
                            <div className="property-card-row">
                              <span>Owning both utilities</span>
                              <strong>
                                {utilityDetails.multipliers[1]} × dice roll ×{' '}
                                {formatRupees(utilityDetails.perPip)}
                              </strong>
                            </div>
                          </div>

                          <div className="property-card-section">
                            <div className="property-card-row">
                              <span>Mortgage value</span>
                              <span>{formatRupees(utilityDetails.mortgage)}</span>
                            </div>
                          </div>

                          <p className="property-card-note">
                            Kaveri Power Company and Tungabhadra Water Works share this
                            schedule, a roll of 7 costs{' '}
                            {formatRupees(
                              utilityDetails.multipliers[0] * 7 * utilityDetails.perPip,
                            )}{' '}
                            against one utility and{' '}
                            {formatRupees(
                              utilityDetails.multipliers[1] * 7 * utilityDetails.perPip,
                            )}{' '}
                            against both
                          </p>
                        </div>
                      )}

                      {!isRoute && !isUtility && (
                        <div className="property-card-body">
                          <div className="property-card-row">
                            <span>Purchase price</span>
                            <strong>{formatCurrency(space.price)}</strong>
                          </div>

                          <div className="property-card-section">
                            <h4>Rent schedule</h4>
                            <div className="property-card-row">
                              <span>Base rent</span>
                              <span>{formatCurrency(details.rent[0])}</span>
                            </div>
                            <div className="property-card-row">
                              <span>With 1 house</span>
                              <span>{formatCurrency(details.rent[1])}</span>
                            </div>
                            <div className="property-card-row">
                              <span>With 2 houses</span>
                              <span>{formatCurrency(details.rent[2])}</span>
                            </div>
                            <div className="property-card-row">
                              <span>With 3 houses</span>
                              <span>{formatCurrency(details.rent[3])}</span>
                            </div>
                            <div className="property-card-row">
                              <span>With 4 houses</span>
                              <span>{formatCurrency(details.rent[4])}</span>
                            </div>
                            <div className="property-card-row">
                              <span>With a hotel</span>
                              <strong>{formatCurrency(details.rent[5])}</strong>
                            </div>
                          </div>

                          <div className="property-card-section">
                            <div className="property-card-row">
                              <span>House cost</span>
                              <span>{formatCurrency(details.houseCost)}</span>
                            </div>
                            <div className="property-card-row">
                              <span>Mortgage value</span>
                              <span>{formatCurrency(details.mortgage)}</span>
                            </div>
                          </div>

                          <p className="property-card-note">
                            Own every district in this colour family to start building,
                            houses go up evenly across the family before a hotel
                          </p>
                        </div>
                      )}

                      {/* Owner Actions - Build/Sell/Mortgage buttons */}
                      {(() => {
                        const deed = deeds[selectedProperty];
                        if (!deed || deed.owner !== 'p1') return null;

                        const details = propertyDetails[selectedProperty];
                        if (!details) return null;

                        const canBuildHouse = Estate.canBuild(deeds, selectedProperty, spaces);
                        const canSellBuilding = Estate.canSellBuilding(deeds, selectedProperty, spaces);
                        const canMortgage = Estate.canMortgage(deeds, selectedProperty, spaces);
                        const unmortgageCost = deed.mortgaged ? Estate.unmortgageCost(selectedProperty, spaces) : 0;
                        const buildingType = deed.houses === 4 ? 'Hotel' : 'House';
                        const buildCost = details.houseCost;
                        const sellRevenue = Math.floor(details.houseCost * 0.5);

                        return (
                          <div className="property-card-actions">
                            {!deed.mortgaged && (
                              <>
                                <button
                                  type="button"
                                  className="property-action-btn"
                                  disabled={!canBuildHouse || balances['p1'] < buildCost}
                                  onClick={() => {
                                    if (balances['p1'] >= buildCost) {
                                      setBalances(prev => ({ ...prev, p1: prev.p1 - buildCost }));
                                      setDeeds(prev => {
                                        const updated = { ...prev };
                                        if (deed.houses === 4) {
                                          updated[selectedProperty] = { ...deed, houses: 0, hotel: true };
                                        } else {
                                          updated[selectedProperty] = { ...deed, houses: deed.houses + 1 };
                                        }
                                        return updated;
                                      });
                                    }
                                  }}
                                  title={!canBuildHouse ? 'Own the full colour family and build evenly first' : `Build a ${buildingType.toLowerCase()} for ${formatRupees(buildCost)}`}
                                >
                                  Build {buildingType} ({formatRupees(buildCost)})
                                </button>
                                <button
                                  type="button"
                                  className="property-action-btn"
                                  disabled={!canSellBuilding}
                                  onClick={() => {
                                    const result = Estate.sellOneBuilding(deeds, selectedProperty, spaces);
                                    if (result) {
                                      setDeeds(result.updatedDeeds);
                                      setBalances(prev => ({ ...prev, p1: prev.p1 + result.cash }));
                                    }
                                  }}
                                  title={!canSellBuilding ? 'No buildings to sell' : `Sell for ${formatRupees(sellRevenue)}`}
                                >
                                  Sell Building ({formatRupees(sellRevenue)})
                                </button>
                                <button
                                  type="button"
                                  className="property-action-btn"
                                  disabled={!canMortgage}
                                  onClick={() => {
                                    const value = Estate.mortgageValue(selectedProperty, spaces);
                                    setDeeds(prev => ({
                                      ...prev,
                                      [selectedProperty]: { ...deed, mortgaged: true }
                                    }));
                                    setBalances(prev => ({ ...prev, p1: prev.p1 + value }));
                                  }}
                                  title={!canMortgage ? 'Sell the buildings in this family before mortgaging' : `Mortgage for ${formatRupees(details.mortgage)}`}
                                >
                                  Mortgage ({formatRupees(details.mortgage)})
                                </button>
                              </>
                            )}
                            {deed.mortgaged && (
                              <button
                                type="button"
                                className="property-action-btn"
                                disabled={balances['p1'] < unmortgageCost}
                                onClick={() => {
                                  if (balances['p1'] >= unmortgageCost) {
                                    setBalances(prev => ({ ...prev, p1: prev.p1 - unmortgageCost }));
                                    setDeeds(prev => ({
                                      ...prev,
                                      [selectedProperty]: { ...deed, mortgaged: false }
                                    }));
                                  }
                                }}
                                title={`Unmortgage for ${formatRupees(unmortgageCost)}, including 10% interest`}
                              >
                                Unmortgage ({formatRupees(unmortgageCost)})
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Dice Information Modal */}
          {showDiceInfo && (
            <div
              className="property-card-overlay"
              onClick={() => setShowDiceInfo(false)}
            >
              <div
                className="property-card dice-info-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="dice-info-title"
              >
                <header className="property-card-header">
                  <p className="property-card-kicker">Fair play</p>
                  <h3 id="dice-info-title">How the dice work</h3>
                  <button
                    type="button"
                    className="property-card-close"
                    onClick={() => setShowDiceInfo(false)}
                    aria-label="Close dice information"
                  >
                    ✕
                  </button>
                </header>

                <div className="property-card-body dice-info-body">
                  <p className="dice-info-intro">
                    Manapally rolls with the cryptographically secure random generator
                    built into your browser, so every roll is fair and unpredictable
                  </p>

                  <div className="property-card-section">
                    <h4>Two standard dice</h4>
                    <p>
                      Each turn rolls two six sided dice showing 1 to 6, both values are
                      shown and your token moves their total, three doubles in a row
                      sends you to Kaidi Kottai (Detention)
                    </p>
                  </div>

                  <div className="property-card-section">
                    <h4>Why a cryptographic generator</h4>
                    <p>
                      The everyday random function in JavaScript is a pseudo random
                      generator, its results can in theory be predicted and its spread is
                      not perfectly even
                    </p>
                    <p>
                      Manapally uses <code>getRandomValues</code> from the Web Crypto API
                      instead, the same technology browsers rely on for encryption
                    </p>
                  </div>

                  <div className="property-card-section">
                    <h4>Perfectly fair with rejection sampling</h4>
                    <p>
                      The generator produces random bytes from 0 to 255, and 256 does not
                      divide evenly by 6 (256 = 6 × 42 + 4), so a plain remainder would
                      make faces 1 to 4 appear 43 times for every 42 of faces 5 and 6,
                      this is called <strong>modulo bias</strong>
                    </p>
                    <p>
                      The fix is to discard any byte of 252 or more (252 = 6 × 42) and
                      draw again, the remaining values split into exactly 42 per face and
                      a redraw happens only 4 times in 256, so the loop almost never runs
                      twice
                    </p>
                  </div>

                  <div className="property-card-section">
                    <h4>Real dice probabilities</h4>
                    <p>
                      Rolling two separate dice rather than one number from 2 to 12 gives
                      authentic odds
                    </p>
                    <ul className="dice-probability-list">
                      <li><strong>7</strong> is the most common total with 6 ways to roll it</li>
                      <li><strong>6 and 8</strong> follow closely with 5 ways each</li>
                      <li><strong>2 and 12</strong> are the rarest with 1 way each</li>
                    </ul>
                    <p className="dice-info-note">
                      This matches physical dice exactly
                    </p>
                  </div>

                  <div className="property-card-section">
                    <h4>The algorithm</h4>
                    <ol className="dice-info-steps">
                      <li>Draw a random byte from 0 to 255 with the Web Crypto API</li>
                      <li>If the byte is 252 or more, discard it and draw again</li>
                      <li>Divide by 6 and keep the remainder, giving 0 to 5</li>
                      <li>Add 1 for a final face from 1 to 6</li>
                      <li>Repeat independently for the second die</li>
                    </ol>
                  </div>

                  <p className="dice-info-footer">
                    Every roll is unpredictable, fair and mathematically sound
                    <br />
                    May fortune favour your strategy
                  </p>
                </div>
              </div>
            </div>
          )}

          {showMatchInfo && (
            <div
              className="property-card-overlay"
              onClick={() => setShowMatchInfo(false)}
            >
              <div
                className="property-card match-info-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="match-info-title"
              >
                <header className="property-card-header">
                  <p className="property-card-kicker">Match rules</p>
                  <h3 id="match-info-title">Match length</h3>
                  <button
                    type="button"
                    className="property-card-close"
                    onClick={() => setShowMatchInfo(false)}
                    aria-label="Close match information"
                  >
                    ✕
                  </button>
                </header>

                <div className="property-card-body dice-info-body">
                  <p className="dice-info-intro">
                    Manapally is an original strategy game played over a fixed match of{' '}
                    {TOTAL_MATCH_TURNS} turns
                  </p>

                  <div className="property-card-section">
                    <h4>The {TOTAL_MATCH_TURNS} turn benchmark</h4>
                    <p>
                      The benchmark is inspired by simulation based board game analysis,
                      automated models can play thousands of games to study how dice odds,
                      player decisions and events shape the length of a match
                    </p>
                    <p>
                      At a four player table {TOTAL_MATCH_TURNS} total turns gives each
                      player {TOTAL_MATCH_TURNS / 4}, with fewer players each person
                      receives more turns before the shared count ends
                    </p>
                  </div>

                  <div className="property-card-section">
                    <h4>Winning</h4>
                    <p>
                      In the current version the highest cash balance after turn{' '}
                      {TOTAL_MATCH_TURNS} wins, future versions will score full net worth
                    </p>
                  </div>

                  <div className="property-card-section">
                    <h4>Rajyabhishekam</h4>
                    <p>
                      Passing or landing on Rajyabhishekam awards{' '}
                      {formatRupees(START_REWARD)}, it does not start or complete a round
                    </p>
                  </div>

                  <p className="dice-info-footer">
                    Every match is a fixed length strategic contest
                    <br />
                    Build your fortune wisely
                  </p>
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
              <strong>{activePlayer.name}</strong>

              <span>
                {activePlayer.id === 'p1'
                  ? 'The court awaits your decision'
                  : `${activePlayer.name} is making a move`}
              </span>
            </div>
          </div>

          <div
            className={`dice-display ${
              isRolling ? 'dice-display--rolling' : ''
            }`}
            aria-live="polite"
            aria-label={
              dice1 !== null && dice2 !== null
                ? `Rolled ${dice1} and ${dice2}, total ${dice1 + dice2}`
                : 'Dice ready'
            }
          >
            <div className="dice-pair">
              <DieFace value={dice1} />
              <DieFace value={dice2} />
            </div>

            <span className="dice-total">
              {dice1 !== null && dice2 !== null ? `Total ${dice1 + dice2}` : 'Ready to roll'}
            </span>
          </div>

          <div className="dice-info-row">
            <p className="dice-transparency-label">Secure roll by Web Crypto</p>
            <button
              type="button"
              className="dice-info-button"
              onClick={() => setShowDiceInfo(true)}
              aria-label="Learn how the dice work"
              title="Learn how the dice work"
            >
              How the dice work
            </button>
          </div>

          <GoldButton
            loading={isRolling || isMoving}
            disabled={gameOver || activePlayer.id !== 'p1' || isMoving}
            onClick={rollDiceHandler}
          >
            {gameOver
              ? 'Match complete'
              : activePlayer.id === 'p1'
                ? 'Roll the dice'
                : `Awaiting ${activePlayer.name}`}
          </GoldButton>

          {gameOver && (
            <div className="match-result" role="status" aria-live="polite">
              <p className="match-result-label">
                Match complete after {TOTAL_MATCH_TURNS} turns
              </p>

              {matchResult.isTie ? (
                <>
                  <strong className="match-result-winner">Tie</strong>
                  <p className="match-result-detail">
                    {matchResult.winners.map((p) => p.name).join(' and ')} finish
                    level at {formatCurrency(matchResult.winningBalance)}
                  </p>
                </>
              ) : (
                <>
                  <strong className="match-result-winner">
                    {matchResult.winners[0].name === 'You'
                      ? 'You win'
                      : `${matchResult.winners[0].name} wins`}
                  </strong>
                  <p className="match-result-detail">
                    Highest balance {formatCurrency(matchResult.winningBalance)}
                  </p>
                </>
              )}
            </div>
          )}

          <p className="turn-tip">
            Tap any district, route or utility on the board to see its rent and
            building costs
          </p>
        </aside>
      </section>
    </main>
  );
}
