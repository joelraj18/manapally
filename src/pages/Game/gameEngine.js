// The MANAPALLY game engine.
//
// One engine runs per match, on the host's device. It owns the complete game
// state as a plain serialisable object, applies every rule, drives computer
// and AI opponents, and reports each change through `onChange` so the board
// can render it and the room can broadcast it to the other players. Remote
// players never run rules themselves; they send intents (roll, buy, bid) that
// the host feeds into the public methods below.

import * as Estate from './estate';
import {
  BOARD_SPACES,
  DETENTION_SPACE,
  RAJAS_ORDER_DECK,
  ROUTE_SPACES,
  START_SPACE,
  STARTING_BALANCE,
  TEMPLE_HUNDI_DECK,
  UTILITY_SPACES,
} from './boardData';
import { START_REWARD, TOTAL_MATCH_TURNS } from './matchRules';

export const DEFAULT_TIMING = {
  roll: 620, // dice tumble before the result shows
  step: 120, // per space while a token walks
  afterRoll: 400, // pause between showing the dice and moving
  card: 3000, // a drawn card stays face up this long
  turnGap: 500, // breath between turns
  botDelay: 900, // before a computer opponent rolls
  auction: 12000, // auction length
  auctionExtend: 4000, // a late bid keeps the auction open at least this long
  botBidGap: 900, // average pause between computer bids
  remoteDecision: 40000, // an absent remote player declines after this
  remoteRoll: 45000, // an absent remote player is rolled for after this
  advisor: 15000, // premium AI must answer within this
};

export const AUCTION_MIN_BID = 10000;
export const DETENTION_FINE = 50000;
export const DETENTION_MAX_ATTEMPTS = 3;
// Kandayam (Land Tax) and Vajra (Diamond) Tax, on the same thousand rupee
// scale as every other amount on the board.
export const TAXES = { 4: 200000, 38: 100000 };
const BUILD_RESERVE = 200000;
export const AUCTION_INCREMENT = 10000;
const BOT_RESERVE = 120000;

const CANCELLED = Symbol('cancelled');

export const formatRupees = (amount) =>
  `₹${Math.round(amount).toLocaleString('en-IN')}`;

// Cryptographically secure die roll with rejection sampling, so every face is
// exactly as likely as any other.
export const secureRollDie = () => {
  const buf = new Uint8Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= 252);
  return (buf[0] % 6) + 1;
};

// Secure index in [0, range) using the same rejection sampling.
export const secureIndex = (range) => {
  const buf = new Uint8Array(1);
  const limit = 256 - (256 % range);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % range;
};

const byId = (players) => (key) =>
  Object.fromEntries(players.map((player) => [player.id, key(player)]));

export const createInitialState = (players) => {
  const each = byId(players);

  return {
    version: 0,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      pieceKey: player.pieceKey,
      kind: player.kind, // 'human' | 'bot' | 'ai'
      clientId: player.clientId || null, // set for remote humans
    })),
    positions: each(() => START_SPACE),
    balances: each(() => STARTING_BALANCE),
    pardons: each(() => 0),
    doubles: each(() => 0),
    detained: each(() => null), // turns already served in Kaidi Kottai, or null when free
    bankrupt: each(() => false),
    deeds: {},
    turnCount: 0,
    activeIndex: 0,
    dice: null,
    rolling: false,
    busy: false,
    activity: `${players[0].name} begins at Rajyabhishekam\nRoll the royal dice to begin`,
    drawnCard: null,
    purchaseOffer: null,
    auction: null,
    endVote: null, // { proposerId, agreed: [ids], passed }
    gameOver: null,
    sfx: null,
  };
};

// Final standings by total net worth: cash plus the value of every district,
// route, utility and building a player still holds.
export const computeStandings = (state) =>
  state.players
    .map((player) => {
      const cash = state.balances[player.id] || 0;
      const netWorth = state.bankrupt[player.id]
        ? 0
        : Estate.netWorth(player.id, state.balances, state.deeds, BOARD_SPACES);

      return {
        id: player.id,
        name: player.name,
        pieceKey: player.pieceKey,
        bankrupt: Boolean(state.bankrupt[player.id]),
        cash,
        propertyValue: Math.max(0, netWorth - cash),
        netWorth,
        deeds: Object.values(state.deeds).filter((deed) => deed.owner === player.id).length,
      };
    })
    .sort((a, b) => b.netWorth - a.netWorth || Number(a.bankrupt) - Number(b.bankrupt));

export default class GameEngine {
  constructor({
    players,
    timing = {},
    advisor = null,
    rollDie = secureRollDie,
    pickIndex = secureIndex,
    random = Math.random,
    onChange = () => {},
    onChat = () => {},
  }) {
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.advisor = advisor;
    this.rollDie = rollDie;
    this.pickIndex = pickIndex;
    this.random = random;
    this.onChange = onChange;
    this.onChat = onChat;
    this.state = createInitialState(players);
    this.timers = new Set();
    this.pendingPurchase = null;
    this.destroyed = false;
    this.sfxCounter = 0;
    this.advisorFailed = false;
  }

  // ---------------------------------------------------------------- basics

  start() {
    this.emit();
    this.schedule();
  }

  destroy() {
    this.destroyed = true;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();

    if (this.pendingPurchase) {
      this.pendingPurchase.resolve(false);
      this.pendingPurchase = null;
    }
  }

  emit() {
    if (!this.destroyed) {
      this.onChange(this.state);
    }
  }

  set(patch) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    this.emit();
  }

  later(fn, ms) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  clearLater(timer) {
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(timer);
    }
  }

  sleep(ms) {
    return new Promise((resolve, reject) => {
      if (this.destroyed) {
        reject(CANCELLED);
        return;
      }

      this.later(() => (this.destroyed ? reject(CANCELLED) : resolve()), ms);
    });
  }

  player(id) {
    return this.state.players.find((player) => player.id === id);
  }

  nameOf(id) {
    return this.player(id)?.name || 'The bank';
  }

  isAlive(id) {
    return !this.state.bankrupt[id];
  }

  alivePlayers() {
    return this.state.players.filter((player) => this.isAlive(player.id));
  }

  get activePlayer() {
    return this.state.players[this.state.activeIndex];
  }

  sound(key) {
    this.sfxCounter += 1;
    this.set({ sfx: { key, id: this.sfxCounter } });
  }

  chat(text, playerId = null) {
    this.onChat({ playerId, text });
  }

  setBalance(id, value) {
    this.set({ balances: { ...this.state.balances, [id]: value } });
  }

  adjust(id, delta) {
    this.setBalance(id, this.state.balances[id] + delta);
  }

  setPosition(id, position) {
    this.set({ positions: { ...this.state.positions, [id]: position } });
  }

  setDeed(spaceId, deed) {
    const deeds = { ...this.state.deeds };

    if (deed) {
      deeds[spaceId] = deed;
    } else {
      delete deeds[spaceId];
    }

    this.set({ deeds });
  }

  // ----------------------------------------------------------- scheduling

  // Starts the next computer turn, or arms the idle timer for a remote human.
  schedule() {
    this.clearLater(this.turnTimer);
    this.turnTimer = null;

    if (this.destroyed || this.state.gameOver || this.state.busy) {
      return;
    }

    if (this.state.endVote?.passed) {
      this.finish('agreed');
      return;
    }

    const active = this.activePlayer;

    if (active.kind === 'bot' || active.kind === 'ai') {
      this.turnTimer = this.later(
        () => this.playTurn(active.id, { release: this.botRelease(active.id) }),
        this.timing.botDelay,
      );
    } else if (active.clientId) {
      this.turnTimer = this.later(() => {
        this.chat(`${active.name} was away, the table rolled for them`);
        this.playTurn(active.id);
      }, this.timing.remoteRoll);
    }
  }

  // ---------------------------------------------------------------- turns

  // Plays one complete turn. Returns false when it is not that player's turn.
  // A player held in Kaidi Kottai may pass `release: 'pay'` to pay the fine or
  // `release: 'pardon'` to spend a pardon before rolling; otherwise they roll
  // for doubles.
  async playTurn(playerId, { release } = {}) {
    const { state } = this;

    if (
      this.destroyed ||
      state.gameOver ||
      state.busy ||
      this.activePlayer.id !== playerId ||
      !this.isAlive(playerId)
    ) {
      return false;
    }

    this.clearLater(this.turnTimer);
    this.turnTimer = null;
    this.set({ busy: true });

    const name = this.nameOf(playerId);
    const lines = [];
    const say = (text) => {
      lines.push(text);
      this.set({ activity: lines.join('\n') });
    };

    try {
      let detained = this.isDetained(playerId);

      if (detained && release === 'pardon' && this.state.pardons[playerId] > 0) {
        this.set({ pardons: { ...this.state.pardons, [playerId]: this.state.pardons[playerId] - 1 } });
        this.release(playerId);
        say(`${name} used a Get Out of Kaidi Kottai Free pardon`);
        detained = false;
      } else if (detained && release === 'pay') {
        this.charge(playerId, DETENTION_FINE, null, say);

        if (!this.isAlive(playerId)) {
          this.endTurn();
          return true;
        }

        this.release(playerId);
        say(`${name} paid the ${formatRupees(DETENTION_FINE)} fine and leaves Kaidi Kottai`);
        detained = false;
      }

      // Doubles earn another roll; a third double in one turn means detention.
      let doubles = 0;

      for (;;) {
        this.set({ rolling: true, dice: null });
        say(`${name} rolls the royal dice`);
        await this.sleep(this.timing.roll);

        const d1 = this.rollDie();
        const d2 = this.rollDie();
        const total = d1 + d2;
        const isDouble = d1 === d2;
        lines.pop();
        this.set({ rolling: false, dice: [d1, d2] });

        if (detained) {
          const attempt = this.state.detained[playerId] + 1;

          if (isDouble) {
            say(`${name} rolled doubles ${d1} + ${d2} and walks free`);
            this.release(playerId);
          } else if (attempt >= DETENTION_MAX_ATTEMPTS) {
            say(`${name} rolled ${d1} + ${d2}, a third miss, and must pay the fine`);
            this.charge(playerId, DETENTION_FINE, null, say);

            if (!this.isAlive(playerId)) {
              break;
            }

            this.release(playerId);
          } else {
            say(`${name} rolled ${d1} + ${d2} and stays in Kaidi Kottai, attempt ${attempt} of ${DETENTION_MAX_ATTEMPTS}`);
            this.set({ detained: { ...this.state.detained, [playerId]: attempt } });
            await this.sleep(this.timing.turnGap);
            break;
          }

          // Leaving detention moves the token, but never earns a second roll.
          await this.sleep(this.timing.afterRoll);
          const passed = await this.walk(playerId, total);
          this.awardStart(playerId, passed, say);
          await this.resolveLanding(playerId, total, say, { depth: 0 });
          break;
        }

        doubles = isDouble ? doubles + 1 : 0;
        this.set({ doubles: { ...this.state.doubles, [playerId]: doubles } });

        if (doubles === 3) {
          say(`${name} rolled doubles three times in a row`);
          this.sendToDetention(playerId, say);
          await this.sleep(this.timing.turnGap);
          break;
        }

        say(`${name} rolled ${isDouble ? 'doubles ' : ''}${d1} + ${d2} = ${total}`);
        await this.sleep(this.timing.afterRoll);

        const passedStart = await this.walk(playerId, total);
        this.awardStart(playerId, passedStart, say);
        await this.resolveLanding(playerId, total, say, { depth: 0 });

        if (
          !isDouble ||
          this.isDetained(playerId) ||
          !this.isAlive(playerId) ||
          this.state.gameOver ||
          this.state.endVote?.passed
        ) {
          break;
        }

        say(`Doubles, ${name} rolls again`);
        await this.sleep(this.timing.turnGap);
      }

      // Computer and AI opponents develop their estate between rolls.
      const player = this.player(playerId);

      if ((player.kind === 'bot' || player.kind === 'ai') && this.isAlive(playerId)) {
        this.botDevelop(playerId, say);
      }

      await this.sleep(this.timing.turnGap);
      this.set({ doubles: { ...this.state.doubles, [playerId]: 0 } });
      this.endTurn();
      return true;
    } catch (error) {
      if (error !== CANCELLED) {
        throw error;
      }

      return false;
    } finally {
      if (!this.destroyed) {
        this.set({ busy: false, rolling: false });
        this.schedule();
      }
    }
  }

  isDetained(playerId) {
    const served = this.state.detained?.[playerId];
    return served !== null && served !== undefined;
  }

  release(playerId) {
    this.set({ detained: { ...this.state.detained, [playerId]: null } });
  }

  // Straight to Kaidi Kottai: no walking, no Rajyabhishekam reward, and the
  // turn ends even after doubles.
  sendToDetention(playerId, say) {
    this.set({
      positions: { ...this.state.positions, [playerId]: DETENTION_SPACE },
      detained: { ...this.state.detained, [playerId]: 0 },
    });
    say(`${this.nameOf(playerId)} is sent to Kaidi Kottai (Detention)`);
  }

  // How a computer leaves detention: a pardon if held, the fine if cash is
  // comfortable, otherwise roll for doubles.
  botRelease(playerId) {
    if (!this.isDetained(playerId)) {
      return undefined;
    }

    if (this.state.pardons[playerId] > 0) {
      return 'pardon';
    }

    return this.state.balances[playerId] >= DETENTION_FINE + 400000 ? 'pay' : undefined;
  }

  // Computer and AI opponents lift mortgages and build houses and hotels on
  // complete colour families, always keeping a cash reserve.
  botDevelop(playerId, say) {
    const name = this.nameOf(playerId);

    Object.keys(this.state.deeds)
      .filter((id) => this.state.deeds[id].owner === playerId && this.state.deeds[id].mortgaged)
      .forEach((id) => {
        const cost = Estate.unmortgageCost(id, BOARD_SPACES);

        if (this.state.balances[playerId] - cost >= BUILD_RESERVE * 2 && this.manageProperty(playerId, id, 'unmortgage')) {
          say(`${name} lifted the mortgage on ${BOARD_SPACES[id].name}`);
        }
      });

    let built = 0;
    let hotels = 0;

    for (let guard = 0; guard < 40; guard += 1) {
      const deeds = this.state.deeds;
      const balance = this.state.balances[playerId];
      const target = Object.keys(deeds).find((id) => {
        const details = Estate.propertyDetails[id];
        return (
          deeds[id].owner === playerId &&
          details &&
          balance - details.houseCost >= BUILD_RESERVE &&
          Estate.canBuild(deeds, id, BOARD_SPACES)
        );
      });

      if (!target || !this.manageProperty(playerId, target, 'build')) {
        break;
      }

      if (this.state.deeds[target].hotel) {
        hotels += 1;
      } else {
        built += 1;
      }
    }

    if (built || hotels) {
      const parts = [];
      if (built) parts.push(`${built} house${built > 1 ? 's' : ''}`);
      if (hotels) parts.push(`${hotels} hotel${hotels > 1 ? 's' : ''}`);
      say(`${name} built ${parts.join(' and ')}`);
    }
  }

  endTurn() {
    const turnCount = this.state.turnCount + 1;
    const alive = this.alivePlayers();

    if (this.state.endVote?.passed) {
      this.set({ turnCount });
      this.finish('agreed');
      return;
    }

    if (alive.length <= 1) {
      this.set({ turnCount });
      this.finish('bankruptcy');
      return;
    }

    if (turnCount >= TOTAL_MATCH_TURNS) {
      this.set({ turnCount });
      this.finish('turns');
      return;
    }

    const count = this.state.players.length;
    let next = this.state.activeIndex;

    do {
      next = (next + 1) % count;
    } while (!this.isAlive(this.state.players[next].id));

    this.set({ turnCount, activeIndex: next, dice: null });
  }

  finish(reason) {
    if (this.state.gameOver) {
      return;
    }

    const standings = computeStandings(this.state);
    const top = standings[0]?.netWorth ?? 0;
    const winners = standings
      .filter((entry) => !entry.bankrupt && entry.netWorth === top)
      .map((entry) => entry.id);

    this.set({
      gameOver: { reason, standings, winners, turns: this.state.turnCount },
      endVote: null,
      purchaseOffer: null,
      auction: null,
      drawnCard: null,
    });

    const winnerNames = winners.map((id) => this.nameOf(id)).join(' and ');
    this.set({
      activity:
        reason === 'bankruptcy'
          ? `${winnerNames} is the last player standing`
          : reason === 'agreed'
            ? `The table agreed to end the game after ${this.state.turnCount} turns\n${winnerNames} ${winners.length > 1 ? 'share' : 'takes'} the crown`
            : `Match complete after ${TOTAL_MATCH_TURNS} turns\n${winnerNames} ${winners.length > 1 ? 'share' : 'takes'} the crown`,
    });
    this.chat(`Match over, ${winnerNames} ${winners.length > 1 ? 'share the win' : 'wins'} with ${formatRupees(top)} net worth`);
    this.sound('winner');
  }

  // -------------------------------------------------------------- movement

  async walk(playerId, steps, { backwards = false } = {}) {
    let passedStart = false;

    for (let step = 1; step <= steps; step += 1) {
      const from = this.state.positions[playerId];
      const next = (from + (backwards ? -1 : 1) + BOARD_SPACES.length) % BOARD_SPACES.length;

      if (next === START_SPACE && !backwards) {
        passedStart = true;
      }

      this.setPosition(playerId, next);
      await this.sleep(this.timing.step);
    }

    return passedStart;
  }

  walkTo(playerId, target) {
    const from = this.state.positions[playerId];
    const steps = (target - from + BOARD_SPACES.length) % BOARD_SPACES.length;

    return steps === 0 ? Promise.resolve(false) : this.walk(playerId, steps);
  }

  nextSpaceAhead(playerId, candidates) {
    const from = this.state.positions[playerId];
    const distance = (space) => {
      const gap = (space - from + BOARD_SPACES.length) % BOARD_SPACES.length;
      return gap === 0 ? BOARD_SPACES.length : gap;
    };

    return candidates.reduce((best, candidate) =>
      distance(candidate) < distance(best) ? candidate : best,
    );
  }

  awardStart(playerId, passed, say) {
    if (!passed) {
      return;
    }

    this.adjust(playerId, START_REWARD);
    this.sound('coronation');
    say(`${this.nameOf(playerId)} collected ${formatRupees(START_REWARD)} at Rajyabhishekam`);
  }

  // --------------------------------------------------------------- landing

  async resolveLanding(playerId, diceTotal, say, options) {
    const space = BOARD_SPACES[this.state.positions[playerId]];
    const name = this.nameOf(playerId);

    switch (space.type) {
      case 'route':
        this.sound(space.name.includes('Farakka') ? 'farakkaExpress' : 'pallavanExpress');
        await this.resolveOwnable(playerId, space, diceTotal, say, options);
        break;

      case 'utility':
        this.sound('utility');
        await this.resolveOwnable(playerId, space, diceTotal, say, options);
        break;

      case 'property':
        await this.resolveOwnable(playerId, space, diceTotal, say, options);
        break;

      case 'chance':
      case 'community':
        if (options.depth < 2) {
          await this.resolveCard(playerId, space.name, space.type === 'chance' ? RAJAS_ORDER_DECK : TEMPLE_HUNDI_DECK, diceTotal, say, options.depth + 1);
        }
        break;

      case 'go-to-detention':
        this.sendToDetention(playerId, say);
        break;

      case 'tax': {
        const amount = TAXES[space.id] || 0;

        if (amount > 0) {
          const paid = this.charge(playerId, amount, null, say);
          say(`${name} paid ${formatRupees(paid)} ${space.name} ${space.subname || ''}`.trim());
        }
        break;
      }

      default:
        break;
    }
  }

  async resolveOwnable(playerId, space, diceTotal, say, { doubleRent = false, utilityTen = false } = {}) {
    const deed = this.state.deeds[space.id];
    const name = this.nameOf(playerId);

    if (deed && deed.owner === playerId) {
      say(`${name} is home at ${space.name}`);
      return;
    }

    if (deed) {
      if (deed.mortgaged || !this.isAlive(deed.owner)) {
        say(`${space.name} is mortgaged, no rent is due`);
        return;
      }

      let rent;

      if (utilityTen && space.type === 'utility') {
        const throwTotal = this.rollDie() + this.rollDie();
        rent = 10 * throwTotal * 1000;
        say(`${name} threw ${throwTotal} for the utility card`);
      } else {
        rent = Estate.rentFor(this.state.deeds, space.id, diceTotal, BOARD_SPACES);
      }

      if (doubleRent) {
        rent *= 2;
      }

      if (rent > 0) {
        const paid = this.charge(playerId, rent, deed.owner, say);
        say(`${name} paid ${formatRupees(paid)} rent to ${this.nameOf(deed.owner)}`);
      }

      return;
    }

    await this.offerProperty(playerId, space, say);
  }

  async offerProperty(playerId, space, say) {
    const name = this.nameOf(playerId);
    const canAfford = this.state.balances[playerId] >= space.price;
    const wantsIt = canAfford ? await this.decidePurchase(playerId, space) : false;

    if (wantsIt && this.state.balances[playerId] >= space.price) {
      this.adjust(playerId, -space.price);
      this.setDeed(space.id, { owner: playerId, houses: 0, hotel: false, mortgaged: false });
      this.sound('propertyBought');
      say(`${name} bought ${space.name} for ${formatRupees(space.price)}`);
      return;
    }

    say(`${name} passed on ${space.name}, it goes to auction`);
    await this.runAuction(space, say);
  }

  decidePurchase(playerId, space) {
    const player = this.player(playerId);

    if (player.kind === 'bot') {
      return Promise.resolve(this.botWantsToBuy(playerId, space));
    }

    if (player.kind === 'ai') {
      return this.askAdvisor('purchase', playerId, space).then((answer) =>
        answer ? Boolean(answer.buy) : this.botWantsToBuy(playerId, space),
      );
    }

    // A human decides through the purchase sheet.
    return new Promise((resolve) => {
      let timer = null;

      const finish = (accept) => {
        this.clearLater(timer);
        this.pendingPurchase = null;
        this.set({ purchaseOffer: null });
        resolve(accept);
      };

      this.pendingPurchase = { playerId, resolve: finish };
      this.set({ purchaseOffer: { playerId, spaceId: space.id } });

      if (player.clientId) {
        timer = this.later(() => finish(false), this.timing.remoteDecision);
      }
    });
  }

  // Called from the purchase sheet, locally or through a remote intent.
  resolvePurchase(playerId, accept) {
    if (this.pendingPurchase && this.pendingPurchase.playerId === playerId) {
      this.pendingPurchase.resolve(Boolean(accept));
      return true;
    }

    return false;
  }

  ownsInGroup(playerId, space) {
    if (space.type !== 'property') {
      const group = space.type === 'route' ? ROUTE_SPACES : UTILITY_SPACES;
      return group.filter((id) => this.state.deeds[id]?.owner === playerId).length;
    }

    return Estate.getGroupSpaceIds(space.id, BOARD_SPACES).filter(
      (id) => this.state.deeds[id]?.owner === playerId,
    ).length;
  }

  botWantsToBuy(playerId, space) {
    const cash = this.state.balances[playerId];
    const reserve = this.ownsInGroup(playerId, space) > 0 ? BOT_RESERVE / 2 : BOT_RESERVE;

    return cash - space.price >= reserve;
  }

  botMaxBid(playerId, space) {
    const cash = this.state.balances[playerId];
    const appetite = this.ownsInGroup(playerId, space) > 0 ? 1.15 : 0.85;
    const value = space.price * appetite * (0.9 + this.random() * 0.2);
    const cap = cash - BOT_RESERVE / 2;

    return Math.max(0, Math.floor(Math.min(value, cap) / AUCTION_INCREMENT) * AUCTION_INCREMENT);
  }

  // Ask the premium AI for a decision, falling back to the built in strategy
  // when no advisor is configured, it is slow or it fails.
  async askAdvisor(kind, playerId, space) {
    if (!this.advisor) {
      return null;
    }

    try {
      const answer = await Promise.race([
        this.advisor({ kind, playerId, space, state: this.state }),
        new Promise((resolve) => this.later(() => resolve(null), this.timing.advisor)),
      ]);

      if (answer?.comment) {
        this.chat(answer.comment, playerId);
      }

      return answer;
    } catch (error) {
      if (!this.advisorFailed) {
        this.advisorFailed = true;
        this.chat('The premium AI could not be reached, AI opponents now use the built in strategy');
      }

      return null;
    }
  }

  // ---------------------------------------------------------------- auction

  async runAuction(space, say) {
    const bidders = this.alivePlayers().filter(
      (player) => this.state.balances[player.id] >= AUCTION_MIN_BID,
    );

    if (bidders.length === 0) {
      say(`Nobody can bid, ${space.name} stays with the bank`);
      return;
    }

    // Computer limits are fixed up front; premium AI limits arrive when the
    // advisor answers.
    const limits = {};

    bidders.forEach((player) => {
      if (player.kind === 'bot' || player.kind === 'ai') {
        limits[player.id] = this.botMaxBid(player.id, space);
      }

      if (player.kind === 'ai') {
        this.askAdvisor('bid', player.id, space).then((answer) => {
          if (answer && Number.isFinite(answer.maxBid)) {
            const cash = this.state.balances[player.id];
            limits[player.id] = Math.max(0, Math.min(Math.floor(answer.maxBid), cash));
          }
        });
      }
    });

    this.set({
      auction: {
        spaceId: space.id,
        highBid: 0,
        highBidder: null,
        endsAt: Date.now() + this.timing.auction,
        bids: [],
      },
    });
    this.chat(`Auction open for ${space.name}, listed at ${formatRupees(space.price)}`);

    let nextBotBid = Date.now() + this.timing.botBidGap * (0.6 + this.random() * 0.8);

    while (this.state.auction && Date.now() < this.state.auction.endsAt) {
      await this.sleep(Math.min(200, Math.max(10, this.state.auction.endsAt - Date.now())));

      if (Date.now() >= nextBotBid) {
        this.botAuctionMove(limits);
        nextBotBid = Date.now() + this.timing.botBidGap * (0.6 + this.random() * 0.8);
      }
    }

    const { highBid, highBidder } = this.state.auction;
    this.set({ auction: null });

    if (highBidder && this.state.balances[highBidder] >= highBid) {
      this.adjust(highBidder, -highBid);
      this.setDeed(space.id, { owner: highBidder, houses: 0, hotel: false, mortgaged: false });
      this.sound('propertyBought');
      const message = `${this.nameOf(highBidder)} won ${space.name} at auction for ${formatRupees(highBid)}`;
      say(message);
      this.chat(message);
    } else {
      say(`No bids, ${space.name} stays with the bank`);
      this.chat(`No bids for ${space.name}, it stays with the bank`);
    }
  }

  botAuctionMove(limits) {
    const auction = this.state.auction;

    if (!auction) {
      return;
    }

    const nextBid = auction.highBid === 0 ? AUCTION_MIN_BID : auction.highBid + AUCTION_INCREMENT;
    const candidates = Object.keys(limits).filter(
      (id) =>
        id !== auction.highBidder &&
        this.isAlive(id) &&
        limits[id] >= nextBid &&
        this.state.balances[id] >= nextBid,
    );

    if (candidates.length === 0) {
      return;
    }

    const bidder = candidates[Math.floor(this.random() * candidates.length)];
    const jump = this.random() < 0.3 ? AUCTION_INCREMENT * 2 : 0;
    const amount = Math.min(limits[bidder], nextBid + jump);

    this.placeBid(bidder, amount);
  }

  // Validates and records a bid. Returns true when it was accepted.
  placeBid(playerId, amount) {
    const auction = this.state.auction;
    const value = Math.floor(Number(amount));

    if (!auction || Date.now() >= auction.endsAt || !this.isAlive(playerId)) {
      return false;
    }

    const minimum = auction.highBid === 0 ? AUCTION_MIN_BID : auction.highBid + AUCTION_INCREMENT;

    if (!Number.isFinite(value) || value < minimum || value > this.state.balances[playerId]) {
      return false;
    }

    const endsAt = Math.max(auction.endsAt, Date.now() + this.timing.auctionExtend);

    this.set({
      auction: {
        ...auction,
        highBid: value,
        highBidder: playerId,
        endsAt,
        bids: [...auction.bids, { playerId, amount: value }].slice(-6),
      },
    });

    return true;
  }

  // ------------------------------------------------------------------ cards

  async resolveCard(playerId, deckName, deck, diceTotal, say, depth) {
    const card = deck[this.pickIndex(deck.length)];
    const name = this.nameOf(playerId);

    this.set({ drawnCard: { deckName, text: card.text, playerId, playerName: name } });
    await this.sleep(this.timing.card);
    this.set({ drawnCard: null });

    const { effect } = card;

    switch (effect.kind) {
      case 'advance': {
        const passed = await this.walkTo(playerId, effect.target);
        say(`${name} advanced to ${BOARD_SPACES[effect.target].name}`);
        this.awardStart(playerId, passed, say);
        await this.resolveLanding(playerId, diceTotal, say, { depth });
        break;
      }

      case 'nearest-route':
      case 'nearest-utility': {
        const isRoute = effect.kind === 'nearest-route';
        const target = this.nextSpaceAhead(playerId, isRoute ? ROUTE_SPACES : UTILITY_SPACES);
        const passed = await this.walkTo(playerId, target);
        say(`${name} advanced to ${BOARD_SPACES[target].name}`);
        this.awardStart(playerId, passed, say);
        await this.resolveLanding(playerId, diceTotal, say, {
          depth,
          doubleRent: isRoute,
          utilityTen: !isRoute,
        });
        break;
      }

      case 'back': {
        await this.walk(playerId, effect.steps, { backwards: true });
        say(`${name} stepped back ${effect.steps} spaces`);
        await this.resolveLanding(playerId, diceTotal, say, { depth });
        break;
      }

      case 'detention':
        this.sendToDetention(playerId, say);
        break;

      case 'collect':
        this.adjust(playerId, effect.amount);
        say(`${name} collected ${formatRupees(effect.amount)}`);
        break;

      case 'pay': {
        const paid = this.charge(playerId, effect.amount, null, say);
        say(`${name} paid ${formatRupees(paid)}`);
        break;
      }

      case 'pay-each':
        this.alivePlayers()
          .filter((other) => other.id !== playerId)
          .forEach((other) => {
            if (this.isAlive(playerId)) {
              this.charge(playerId, effect.amount, other.id, say);
            }
          });
        say(`${name} paid ${formatRupees(effect.amount)} to each player`);
        break;

      case 'collect-each':
        this.alivePlayers()
          .filter((other) => other.id !== playerId)
          .forEach((other) => this.charge(other.id, effect.amount, playerId, say));
        say(`${name} collected ${formatRupees(effect.amount)} from each player`);
        break;

      case 'pardon':
        this.set({ pardons: { ...this.state.pardons, [playerId]: this.state.pardons[playerId] + 1 } });
        say(`${name} keeps a Get Out of Kaidi Kottai Free pardon`);
        break;

      case 'repairs': {
        let houses = 0;
        let hotels = 0;

        Object.values(this.state.deeds).forEach((deed) => {
          if (deed.owner === playerId) {
            houses += deed.hotel ? 0 : deed.houses || 0;
            hotels += deed.hotel ? 1 : 0;
          }
        });

        const bill = houses * effect.perHouse + hotels * effect.perHotel;

        if (bill > 0) {
          const paid = this.charge(playerId, bill, null, say);
          say(`${name} paid ${formatRupees(paid)} for repairs`);
        } else {
          say(`${name} owns no buildings, nothing to repair`);
        }
        break;
      }

      default:
        break;
    }
  }

  // ------------------------------------------------------- debts and estate

  // Takes `amount` from a player, raising cash from their estate if needed.
  // Anything they still cannot cover bankrupts them. Returns what was paid.
  charge(playerId, amount, creditorId, say) {
    if (amount <= 0 || !this.isAlive(playerId)) {
      return 0;
    }

    if (this.state.balances[playerId] < amount) {
      const raised = this.liquidate(playerId, amount - this.state.balances[playerId]);

      if (raised > 0) {
        say(`${this.nameOf(playerId)} raised ${formatRupees(raised)} by selling buildings and mortgaging districts`);
      }
    }

    const balance = this.state.balances[playerId];
    const paid = Math.max(0, Math.min(balance, amount));
    const balances = { ...this.state.balances, [playerId]: balance - paid };

    if (creditorId && this.isAlive(creditorId)) {
      balances[creditorId] += paid;
    }

    this.set({ balances });

    if (paid < amount) {
      this.declareBankrupt(playerId, creditorId, say);
    }

    return paid;
  }

  liquidate(playerId, needed) {
    let deeds = { ...this.state.deeds };
    let raised = 0;

    // Sell buildings first (evenly, as the rules require), then mortgage.
    const nextBuilding = (current) =>
      Object.keys(current).find(
        (id) => current[id].owner === playerId && Estate.canSellBuilding(current, id, BOARD_SPACES),
      );
    const nextMortgage = (current) =>
      Object.keys(current).find(
        (id) => current[id].owner === playerId && Estate.canMortgage(current, id, BOARD_SPACES),
      );

    while (raised < needed) {
      const building = nextBuilding(deeds);

      if (building) {
        const result = Estate.sellOneBuilding(deeds, building, BOARD_SPACES);
        deeds = result.updatedDeeds;
        raised += result.cash;
        continue;
      }

      const mortgage = nextMortgage(deeds);

      if (!mortgage) {
        break;
      }

      deeds = { ...deeds, [mortgage]: { ...deeds[mortgage], mortgaged: true } };
      raised += Estate.mortgageValue(mortgage, BOARD_SPACES);
    }

    if (raised > 0) {
      this.set({
        deeds,
        balances: { ...this.state.balances, [playerId]: this.state.balances[playerId] + raised },
      });
    }

    return raised;
  }

  declareBankrupt(playerId, creditorId, say) {
    const deeds = { ...this.state.deeds };
    const heir = creditorId && this.isAlive(creditorId) ? creditorId : null;

    Object.keys(deeds).forEach((id) => {
      if (deeds[id].owner === playerId) {
        if (heir) {
          deeds[id] = { ...deeds[id], owner: heir, houses: 0, hotel: false };
        } else {
          delete deeds[id];
        }
      }
    });

    this.set({
      deeds,
      balances: { ...this.state.balances, [playerId]: 0 },
      bankrupt: { ...this.state.bankrupt, [playerId]: true },
      detained: { ...this.state.detained, [playerId]: null },
    });

    const message = heir
      ? `${this.nameOf(playerId)} is bankrupt, their estate passes to ${this.nameOf(heir)}`
      : `${this.nameOf(playerId)} is bankrupt, their estate returns to the bank`;
    say(message);
    this.chat(message);

    if (this.pendingPurchase?.playerId === playerId) {
      this.pendingPurchase.resolve(false);
    }

    this.checkEndVote();
  }

  // Owner actions from the property sheet. Each returns true when applied.
  manageProperty(playerId, spaceId, action) {
    const { state } = this;
    const deed = state.deeds[spaceId];

    if (!deed || deed.owner !== playerId || state.gameOver || state.auction || !this.isAlive(playerId)) {
      return false;
    }

    const details = Estate.propertyDetails[spaceId];
    const balance = state.balances[playerId];

    switch (action) {
      case 'build': {
        if (!details || !Estate.canBuild(state.deeds, spaceId, BOARD_SPACES) || balance < details.houseCost) {
          return false;
        }

        const next = deed.houses === 4 ? { ...deed, houses: 0, hotel: true } : { ...deed, houses: deed.houses + 1 };
        this.set({
          deeds: { ...state.deeds, [spaceId]: next },
          balances: { ...state.balances, [playerId]: balance - details.houseCost },
        });
        return true;
      }

      case 'sell': {
        const result = Estate.sellOneBuilding(state.deeds, spaceId, BOARD_SPACES);

        if (!result) {
          return false;
        }

        this.set({
          deeds: result.updatedDeeds,
          balances: { ...state.balances, [playerId]: balance + result.cash },
        });
        return true;
      }

      case 'mortgage': {
        if (!Estate.canMortgage(state.deeds, spaceId, BOARD_SPACES)) {
          return false;
        }

        this.set({
          deeds: { ...state.deeds, [spaceId]: { ...deed, mortgaged: true } },
          balances: { ...state.balances, [playerId]: balance + Estate.mortgageValue(spaceId, BOARD_SPACES) },
        });
        return true;
      }

      case 'unmortgage': {
        const cost = Estate.unmortgageCost(spaceId, BOARD_SPACES);

        if (!deed.mortgaged || balance < cost) {
          return false;
        }

        this.set({
          deeds: { ...state.deeds, [spaceId]: { ...deed, mortgaged: false } },
          balances: { ...state.balances, [playerId]: balance - cost },
        });
        return true;
      }

      default:
        return false;
    }
  }

  // ------------------------------------------------------------ end vote

  // Everyone still playing who is a person gets a vote; computer and AI
  // opponents always go along with the table.
  voters() {
    return this.alivePlayers().filter((player) => player.kind === 'human');
  }

  proposeEnd(playerId) {
    const player = this.player(playerId);

    if (!player || player.kind !== 'human' || !this.isAlive(playerId) || this.state.gameOver || this.state.endVote) {
      return false;
    }

    this.set({ endVote: { proposerId: playerId, agreed: [playerId], passed: false } });

    if (this.voters().length > 1) {
      this.chat(`${player.name} proposed ending the game, everyone must agree`);
    }

    this.checkEndVote();
    return true;
  }

  voteEnd(playerId, agree) {
    const vote = this.state.endVote;

    if (!vote || vote.passed || !this.voters().some((player) => player.id === playerId)) {
      return false;
    }

    if (!agree) {
      this.set({ endVote: null });
      this.chat(`${this.nameOf(playerId)} wants to keep playing, the game goes on`);
      return true;
    }

    if (!vote.agreed.includes(playerId)) {
      this.set({ endVote: { ...vote, agreed: [...vote.agreed, playerId] } });
    }

    this.checkEndVote();
    return true;
  }

  checkEndVote() {
    const vote = this.state.endVote;

    if (!vote || vote.passed || this.state.gameOver) {
      return;
    }

    const voters = this.voters();

    if (!voters.every((player) => vote.agreed.includes(player.id))) {
      return;
    }

    this.set({ endVote: { ...vote, passed: true } });

    if (this.state.busy) {
      this.chat('Everyone agreed, the game ends when this turn is over');
    } else {
      this.finish('agreed');
    }
  }

  // A remote player left mid match: a computer opponent takes the seat.
  replaceWithBot(playerId) {
    const player = this.player(playerId);

    if (!player || player.kind !== 'human') {
      return;
    }

    this.set({
      players: this.state.players.map((entry) =>
        entry.id === playerId ? { ...entry, kind: 'bot', clientId: null } : entry,
      ),
    });
    this.chat(`${player.name} left the table, a computer opponent takes over the seat`);

    if (this.pendingPurchase?.playerId === playerId) {
      this.pendingPurchase.resolve(false);
    }

    this.checkEndVote();

    if (!this.state.busy && !this.state.gameOver) {
      this.schedule();
    }
  }
}
