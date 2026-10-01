// Static MANAPALLY board data shared by the game engine, the board view and
// the landing page: the 40 spaces, their grid positions and both card decks.

export const STARTING_BALANCE = 1500000; // ₹15,00,000

// Board landmarks the card decks steer players toward.
export const ROUTE_SPACES = [5, 15, 25, 35];
export const UTILITY_SPACES = [12, 28];
export const DETENTION_SPACE = 10;
export const GO_TO_DETENTION_SPACE = 30;
export const START_SPACE = 0;

// The two decks. Each card carries its printed text plus a machine readable
// effect that the game engine applies.
export const RAJAS_ORDER_DECK = [
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

export const TEMPLE_HUNDI_DECK = [
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

// 40 space board data following the approved specification
export const BOARD_SPACES = [
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

// Grid coordinates for the 40 space square board (11x11 grid)
export const BOARD_GRID = [
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
