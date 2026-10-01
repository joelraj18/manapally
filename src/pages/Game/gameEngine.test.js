import GameEngine, { computeStandings, AUCTION_MIN_BID } from './gameEngine';
import { TOTAL_MATCH_TURNS } from './matchRules';
import { BOARD_SPACES } from './boardData';

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
