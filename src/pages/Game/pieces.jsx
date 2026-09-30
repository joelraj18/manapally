import React from 'react';

// The four MANAPALLY pieces, drawn as single-stroke outlines so one path can
// serve as the panel token, the board token, and the ownership stamp — each
// tinted by its piece through `currentColor`.
export const PIECES = {
  lamp: {
    label: 'Deepam (Lamp)',
    name: 'Lamp',
    colour: '#5fae8c', // Emerald
    d: 'M12 2c0 2-2 4-2 6 0 1.5 1 2.5 2 2.5s2-1 2-2.5c0-2-2-4-2-6zm-7 10c0 3.5 3 6 7 6s7-2.5 7-6H5zm3 6v4h8v-4',
  },
  temple: {
    label: 'Gopuram (Temple)',
    name: 'Temple',
    colour: '#c2564f', // Ruby
    d: 'M12 2l1 2h2.5l-1 3h2l-1 3h2.5v2H5v-2h2.5l-1-3h2l-1-3H11l1-2zm-4 10v8m4-8v8m4-8v8M4 20h16v2H4z',
  },
  elephant: {
    label: 'Gaja (Elephant)',
    name: 'Elephant',
    colour: '#d9a441', // Saffron
    d: 'M19 19v-5c0-3.5-2.5-5.5-6-5.5h-3c-2 0-3.5 1.5-3.5 3.5v1c-1.5 0-2.5 1-2.5 2.5 0 1.5 1 2.5 2.5 2.5h.5v4h2.5v-3h3.5v3H15v-3h4zm-9-8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  },
  bell: {
    label: 'Ghanta (Temple Bell)',
    name: 'Temple Bell',
    colour: '#6f8fc2', // Indigo
    d: 'M12 2a2 2 0 0 0-2 2v2a6 6 0 0 0-5 6v3l-2 2v1h18v-1l-2-2v-3a6 6 0 0 0-5-6V4a2 2 0 0 0-2-2zm-2 16a2 2 0 0 0 4 0',
  },
};

export const PIECE_ORDER = ['lamp', 'temple', 'elephant', 'bell'];

/**
 * Seats for one match: the host's chosen piece takes seat 1, the remaining
 * pieces fill seats 2…n in PIECE_ORDER.
 * @param {string} hostPiece key from PIECES (e.g., 'lamp')
 * @param {number} playerCount number of players (2-4)
 * @returns {string[]} array of piece keys for each seat index (0-based)
 */
export const seatPieces = (hostPiece = 'lamp', playerCount = 2) => {
  const safeHost = PIECES[hostPiece] ? hostPiece : 'lamp';
  const remaining = PIECE_ORDER.filter((p) => p !== safeHost);
  const seats = [safeHost];
  for (let i = 1; i < playerCount; i++) {
    seats.push(remaining[(i - 1) % remaining.length]);
  }
  return seats;
};

/**
 * Renders a piece as an inline SVG.
 * @param {{ piece: string, variant?: 'token'|'stamp'|'chip', title?: string, className?: string }} props
 */
export function PieceMark({ piece, variant = 'token', title, className = '' }) {
  const config = PIECES[piece] || PIECES.lamp;

  let variantClass = 'piece-mark--token';
  let size = 28;
  let strokeWidth = 0;
  let fill = 'currentColor';

  if (variant === 'stamp') {
    variantClass = 'piece-mark--stamp';
    size = 36;
    strokeWidth = 1.8;
    fill = 'none';
  } else if (variant === 'chip') {
    variantClass = 'piece-mark--chip';
    size = 16;
    strokeWidth = 1.8;
    fill = 'none';
  }

  const combinedClass = `piece-mark piece-mark--${piece} ${variantClass} ${className}`.trim();

  return (
    <svg
      className={combinedClass}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-label={title || config.label}
      role="img"
    >
      <path
        d={config.d}
        fill={fill}
        stroke={strokeWidth > 0 ? 'currentColor' : 'none'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Renders Roman tally / 5-bar gate marks for property improvements:
 * 1-4 houses: 1 to 4 vertical strokes
 * hotel: 4 vertical strokes + 1 diagonal slash
 * @param {{ houses?: number, hotel?: boolean, className?: string }} props
 */
export function PropertyTally({ houses = 0, hotel = false, className = '' }) {
  if (!hotel && houses <= 0) return null;

  const count = hotel ? 4 : Math.min(houses, 4);
  const strokeWidth = 1.8;

  return (
    <svg
      className={`property-tally ${hotel ? 'property-tally--hotel' : ''} ${className}`.trim()}
      viewBox="0 0 20 14"
      width="20"
      height="14"
      role="img"
      aria-label={hotel ? 'Hotel (5 builds)' : `${houses} House${houses > 1 ? 's' : ''}`}
    >
      {/* 1-4 vertical tally lines */}
      {count >= 1 && <line x1="4" y1="2" x2="4" y2="12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />}
      {count >= 2 && <line x1="8" y1="2" x2="8" y2="12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />}
      {count >= 3 && <line x1="12" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />}
      {count >= 4 && <line x1="16" y1="2" x2="16" y2="12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />}
      {/* Diagonal slash for hotel */}
      {hotel && <line x1="2" y1="12" x2="18" y2="2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />}
    </svg>
  );
}
