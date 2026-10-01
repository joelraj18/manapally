import GameEngine, { computeStandings, AUCTION_MIN_BID } from './gameEngine';
import { TOTAL_MATCH_TURNS } from './matchRules';
import { BOARD_SPACES } from './boardData';
import * as Estate from './estate';

const FAST = {
  roll: 0, step: 0, afterRoll: 0, card: 0, turnGap: 0, botDelay: 0,
  auction: 30, auctionExtend: 10, botBidGap: 5, remoteDecision: 50, remoteRoll: 50, advisor: 20,
};

const seats = (kinds) =>
  kinds.map((kind, index) => ({
    id: `p${index + 1}`,
    name: `Seat ${index + 1}`,
    pieceKey: ['lamp', 'temple', 'elephant', 'bell'][index],
    kind,
  }));

// Seeded dice so matches are reproducible.
const seeded = (seed) => {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const runToEnd = (engine) =>
  new Promise((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error('match did not finish')), 20000);
    const original = engine.onChange;
    engine.onChange = (state) => {
      original(state);
      if (state.gameOver) {
        clearTimeout(guard);
        resolve(state);
      }
    };
    engine.start();
  });

describe('game engine', () => {
  test.each([2, 3, 4])('a %i seat computer match ends with net worth standings', async (count) => {
    const random = seeded(count * 97);
    const engine = new GameEngine({
      players: seats(Array(count).fill('bot')),
      timing: FAST,
      random,
      rollDie: () => Math.floor(random() * 6) + 1,
      pickIndex: (range) => Math.floor(random() * range),
    });

    const state = await runToEnd(engine);
    engine.destroy();

    const alive = state.players.filter((p) => !state.bankrupt[p.id]);
    expect(alive.length === 1 || state.turnCount === TOTAL_MATCH_TURNS).toBe(true);
    expect(state.gameOver.reason).toBe(alive.length === 1 ? 'bankruptcy' : 'turns');

    // No negative cash and no deeds held by bankrupt players.
    Object.values(state.balances).forEach((balance) => expect(balance).toBeGreaterThanOrEqual(0));
    Object.values(state.deeds).forEach((deed) => expect(state.bankrupt[deed.owner]).toBe(false));

    // Standings are sorted by net worth and include property value.
    const { standings, winners } = state.gameOver;
    expect(standings).toHaveLength(count);
    standings.forEach((entry, index) => {
      expect(entry.netWorth).toBe(entry.bankrupt ? 0 : entry.cash + entry.propertyValue);
      if (index > 0) expect(standings[index - 1].netWorth).toBeGreaterThanOrEqual(entry.netWorth);
    });
    expect(winners[0]).toBe(standings[0].id);
  }, 30000);

  test('a declined purchase goes to auction and the highest bid wins', async () => {
    const dice = [1, 2]; // 3 steps lands on Satavahana Street (space 3)
    const engine = new GameEngine({
      players: seats(['human', 'human']),
      timing: { ...FAST, auction: 80 },
      rollDie: () => dice.shift() ?? 1,
    });
    engine.start();

    const turn = engine.playTurn('p1');
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.state.purchaseOffer).toEqual({ playerId: 'p1', spaceId: 3 });

    expect(engine.resolvePurchase('p2', true)).toBe(false); // not their offer
    engine.resolvePurchase('p1', false);
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.state.auction.spaceId).toBe(3);

    expect(engine.placeBid('p2', AUCTION_MIN_BID - 1)).toBe(false);
    expect(engine.placeBid('p2', 20000)).toBe(true);
    expect(engine.placeBid('p1', 25000)).toBe(false); // below the increment
    expect(engine.placeBid('p1', 30000)).toBe(true);
    expect(engine.placeBid('p2', 99999999)).toBe(false); // more than their cash

    await turn;
    expect(engine.state.deeds[3].owner).toBe('p1');
    expect(engine.state.balances.p1).toBe(1500000 - 30000);
    expect(engine.state.activeIndex).toBe(1);
    engine.destroy();
  });

  test('a player who cannot pay rent sells and mortgages, then goes bankrupt', () => {
    const engine = new GameEngine({ players: seats(['bot', 'bot']), timing: FAST });
    engine.state.deeds = {
      1: { owner: 'p1', houses: 0, hotel: false, mortgaged: false },
      39: { owner: 'p2', houses: 0, hotel: true, mortgaged: false },
    };
    engine.state.balances = { p1: 10000, p2: 100000 };
    const lines = [];

    const paid = engine.charge('p1', 2000000, 'p2', (line) => lines.push(line));

    // Mortgaging Pallava Path raised its mortgage value, all cash went to p2.
    expect(paid).toBe(10000 + 30000);
    expect(engine.state.bankrupt.p1).toBe(true);
    expect(engine.state.balances.p1).toBe(0);
    expect(engine.state.balances.p2).toBe(140000);
    expect(engine.state.deeds[1].owner).toBe('p2');
    expect(lines.some((line) => line.includes('bankrupt'))).toBe(true);
  });

  test('standings count property value in net worth', () => {
    const engine = new GameEngine({ players: seats(['bot', 'bot']), timing: FAST });
    engine.state.balances = { p1: 1000000, p2: 1300000 };
    engine.state.deeds = { 39: { owner: 'p1', houses: 0, hotel: false, mortgaged: false } };

    const [first, second] = computeStandings(engine.state);
    expect(first.id).toBe('p1');
    expect(first.netWorth).toBe(1000000 + BOARD_SPACES[39].price);
    expect(first.propertyValue).toBe(BOARD_SPACES[39].price);
    expect(second.netWorth).toBe(1300000);
  });

  test('a remote player who leaves is replaced by a computer opponent', () => {
    const players = seats(['human', 'human']);
    players[1].clientId = 'guest-1';
    const engine = new GameEngine({ players, timing: FAST });
    engine.replaceWithBot('p2');
    expect(engine.state.players[1]).toMatchObject({ kind: 'bot', clientId: null });
    engine.destroy();
  });
});

describe('rules audit', () => {
  const engineWith = (dice, kinds = ['human', 'human'], extra = {}) => {
    const queue = [...dice];
    return new GameEngine({
      players: seats(kinds),
      timing: FAST,
      rollDie: () => queue.shift() ?? 1,
      pickIndex: () => 0,
      ...extra,
    });
  };

  // Decline every purchase and let auctions lapse so turns stay simple.
  const autoDecline = (engine) => {
    const original = engine.onChange;
    engine.onChange = (state) => {
      original(state);
      if (state.purchaseOffer) setTimeout(() => engine.resolvePurchase(state.purchaseOffer.playerId, false), 0);
    };
  };

  test('doubles earn another roll in the same turn', async () => {
    // 2+2 lands on Kandayam (tax), then 1+3 lands on Hoysala Halebidu Marg (8)
    const engine = engineWith([2, 2, 1, 3]);
    autoDecline(engine);
    await engine.playTurn('p1');
    expect(engine.state.positions.p1).toBe(8);
    expect(engine.state.balances.p1).toBe(1500000 - 200000);
    expect(engine.state.turnCount).toBe(1);
    expect(engine.state.activeIndex).toBe(1);
    engine.destroy();
  });

  test('three doubles in one turn send the player to Kaidi Kottai', async () => {
    const engine = engineWith([1, 1, 2, 2, 3, 3]);
    autoDecline(engine);
    await engine.playTurn('p1');
    expect(engine.state.positions.p1).toBe(10);
    expect(engine.state.detained.p1).toBe(0);
    expect(engine.state.activeIndex).toBe(1);
    engine.destroy();
  });

  test('a detained player can pay the fine, use a pardon, or must pay after three misses', async () => {
    const engine = engineWith([1, 2, 1, 2, 1, 2, 1, 3]);
    autoDecline(engine);
    engine.state.detained = { p1: 0, p2: null };
    engine.state.positions = { p1: 10, p2: 0 };

    // Miss one: stays put
    await engine.playTurn('p1');
    expect(engine.state.positions.p1).toBe(10);
    expect(engine.state.detained.p1).toBe(1);

    engine.state.activeIndex = 0;
    await engine.playTurn('p1'); // miss two
    expect(engine.state.detained.p1).toBe(2);

    engine.state.activeIndex = 0;
    const before = engine.state.balances.p1;
    await engine.playTurn('p1'); // third miss pays the fine and moves 3 to space 13
    expect(engine.state.detained.p1).toBe(null);
    expect(engine.state.positions.p1).toBe(13);
    expect(engine.state.balances.p1).toBe(before - 50000);
    engine.destroy();
  });

  test('a pardon frees a detained player without paying', async () => {
    const engine = engineWith([1, 2]);
    autoDecline(engine);
    engine.state.detained = { p1: 1, p2: null };
    engine.state.positions = { p1: 10, p2: 0 };
    engine.state.pardons = { p1: 1, p2: 0 };
    await engine.playTurn('p1', { release: 'pardon' });
    expect(engine.state.pardons.p1).toBe(0);
    expect(engine.state.detained.p1).toBe(null);
    expect(engine.state.positions.p1).toBe(13);
    expect(engine.state.balances.p1).toBe(1500000);
    engine.destroy();
  });

  test('landing on Go to Kaidi Kottai detains the player', async () => {
    const engine = engineWith([4, 6]);
    autoDecline(engine);
    engine.state.positions = { p1: 20, p2: 0 };
    await engine.playTurn('p1');
    expect(engine.state.positions.p1).toBe(10);
    expect(engine.state.detained.p1).toBe(0);
    engine.destroy();
  });

  test('both tax spaces charge the player', async () => {
    const engine = engineWith([1, 3, 2, 1]);
    autoDecline(engine);
    await engine.playTurn('p1'); // lands on 4, Kandayam
    expect(engine.state.balances.p1).toBe(1500000 - 200000);
    engine.state.positions.p2 = 35;
    await engine.playTurn('p2'); // lands on 38, Vajra Tax
    expect(engine.state.balances.p2).toBe(1500000 - 100000);
    engine.destroy();
  });

  test('houses and a hotel follow the even building rule and raise rent', () => {
    const engine = engineWith([]);
    const own = (id) => ({ owner: 'p1', houses: 0, hotel: false, mortgaged: false });
    engine.state.deeds = { 1: own(1), 3: own(3) };

    // Monopoly doubles base rent before any building
    expect(Estate.rentFor(engine.state.deeds, 1, 7, BOARD_SPACES)).toBe(4000);

    expect(engine.manageProperty('p1', 1, 'build')).toBe(true);
    expect(engine.manageProperty('p1', 1, 'build')).toBe(false); // must build evenly
    expect(engine.manageProperty('p1', 3, 'build')).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      expect(engine.manageProperty('p1', 1, 'build')).toBe(true);
      expect(engine.manageProperty('p1', 3, 'build')).toBe(true);
    }
    expect(engine.state.deeds[1].houses).toBe(4);
    expect(Estate.rentFor(engine.state.deeds, 1, 7, BOARD_SPACES)).toBe(160000);

    expect(engine.manageProperty('p1', 1, 'build')).toBe(true); // fifth build is a hotel
    expect(engine.state.deeds[1]).toMatchObject({ hotel: true, houses: 0 });
    expect(Estate.rentFor(engine.state.deeds, 1, 7, BOARD_SPACES)).toBe(250000);
    expect(engine.state.balances.p1).toBe(1500000 - 9 * 50000);

    // Cannot mortgage while buildings stand, selling a hotel returns four houses
    expect(engine.manageProperty('p1', 3, 'mortgage')).toBe(false);
    expect(engine.manageProperty('p1', 1, 'sell')).toBe(true);
    expect(engine.state.deeds[1]).toMatchObject({ hotel: false, houses: 4 });
    expect(engine.state.balances.p1).toBe(1500000 - 9 * 50000 + 25000);

    // Someone else cannot build on your street
    expect(engine.manageProperty('p2', 1, 'build')).toBe(false);
    engine.destroy();
  });

  test('a detained bot pays its way out when it can afford to', () => {
    const engine = engineWith([], ['bot', 'bot']);
    engine.state.detained = { p1: 0, p2: null };
    expect(engine.botRelease('p1')).toBe('pay');
    engine.state.pardons = { p1: 1, p2: 0 };
    expect(engine.botRelease('p1')).toBe('pardon');
    expect(engine.botRelease('p2')).toBe(undefined);
  });

  test('computer opponents build houses during a full match', async () => {
    const random = seeded(4242);
    let maxBuilds = 0;
    const engine = new GameEngine({
      players: seats(['bot', 'bot', 'bot', 'bot']),
      timing: FAST,
      random,
      rollDie: () => Math.floor(random() * 6) + 1,
      pickIndex: (range) => Math.floor(random() * range),
      onChange: (state) => {
        const builds = Object.values(state.deeds).reduce((sum, deed) => sum + (deed.hotel ? 5 : deed.houses), 0);
        maxBuilds = Math.max(maxBuilds, builds);
      },
    });
    await runToEnd(engine);
    engine.destroy();
    expect(maxBuilds).toBeGreaterThan(0);
  }, 30000);
});

describe('ending the game by agreement', () => {
  test('a lone human against computers ends the game straight away', () => {
    const engine = new GameEngine({ players: seats(['human', 'bot']), timing: FAST });
    engine.state.deeds = { 39: { owner: 'p2', houses: 0, hotel: false, mortgaged: false } };
    expect(engine.proposeEnd('p2')).toBe(false); // computers cannot propose
    expect(engine.proposeEnd('p1')).toBe(true);
    expect(engine.state.gameOver.reason).toBe('agreed');
    expect(engine.state.gameOver.winners).toEqual(['p2']); // net worth includes the boulevard
    engine.destroy();
  });

  test('every human must agree, and one no keeps the game going', () => {
    const engine = new GameEngine({ players: seats(['human', 'human', 'human']), timing: FAST });
    engine.proposeEnd('p1');
    engine.voteEnd('p2', true);
    expect(engine.state.gameOver).toBe(null);
    engine.voteEnd('p3', false);
    expect(engine.state.endVote).toBe(null);

    engine.proposeEnd('p2');
    engine.voteEnd('p1', true);
    engine.voteEnd('p3', true);
    expect(engine.state.gameOver.reason).toBe('agreed');
    expect(engine.voteEnd('p1', true)).toBe(false);
    engine.destroy();
  });

  test('a vote that passes mid turn ends the game when the turn finishes', async () => {
    const queue = [2, 2, 1, 3];
    const engine = new GameEngine({ players: seats(['human', 'human']), timing: FAST, rollDie: () => queue.shift() ?? 1 });
    const turn = engine.playTurn('p1');
    engine.proposeEnd('p1');
    engine.voteEnd('p2', true);
    expect(engine.state.gameOver).toBe(null);
    expect(engine.state.endVote.passed).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    if (engine.state.purchaseOffer) engine.resolvePurchase('p1', false);
    await turn;
    expect(engine.state.gameOver.reason).toBe('agreed');
    expect(engine.state.positions.p1).toBe(4); // the doubles reroll was skipped
    engine.destroy();
  });

  test('a player leaving removes them from the vote', () => {
    const players = seats(['human', 'human']);
    players[1].clientId = 'guest';
    const engine = new GameEngine({ players, timing: FAST });
    engine.proposeEnd('p1');
    expect(engine.state.gameOver).toBe(null);
    engine.replaceWithBot('p2');
    expect(engine.state.gameOver.reason).toBe('agreed');
    engine.destroy();
  });
});
