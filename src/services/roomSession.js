// A private room: lobby seats, chat and the game channel.
//
// The host's browser is the source of truth. Guests send `hello`, `chat` and
// `intent` messages; the host answers with `lobby`, `chat`, `start` and `game`
// snapshots. Nothing secret ever travels through a room: the premium AI key
// stays inside services/premiumAi.js on the host's device.

import { openGuestTransport, openHostTransport } from './roomTransport';
import { PIECE_ORDER } from '../pages/Game/pieces.jsx';

const CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CHAT = 120;
const MAX_TEXT = 240;
const PROTOCOL = 1;

export const createRoomCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (byte) => CODE_CHARACTERS[byte % CODE_CHARACTERS.length],
  ).join('');

export const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, 18);

const cleanText = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

let chatCounter = 0;
const chatId = () => {
  chatCounter += 1;
  return `${Date.now().toString(36)}${chatCounter}`;
};

export default class RoomSession {
  constructor(role) {
    this.role = role;
    this.code = '';
    this.status = 'connecting'; // 'online' | 'offline' | 'connecting' | 'closed'
    this.transport = null;
    this.myClientId = role === 'host' ? 'host' : null;
    this.lobby = { tableSize: 2, seats: [] };
    this.chat = [];
    this.started = false;
    this.players = null;
    this.myPlayerId = null;
    this.listeners = new Map();
    this.botCounter = { bot: 0, ai: 0 };
  }

  // --------------------------------------------------------------- events

  on(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  get isHost() {
    return this.role === 'host';
  }

  // ------------------------------------------------------------- creation

  static async host({ name, pieceKey }) {
    const session = new RoomSession('host');
    session.lobby.seats = [
      { seatId: 'host', name: cleanName(name), pieceKey, kind: 'human', clientId: 'host' },
    ];

    // A clashing code is astronomically rare, but retry just in case.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      session.code = createRoomCode();

      try {
        session.transport = openHostTransport(session.code, {
          onPeerOpen: () => {},
          onMessage: (peerId, message) => session.handleGuestMessage(peerId, message),
          onPeerClose: (peerId) => session.handleGuestLeft(peerId),
          onError: () => {},
        });
        await session.transport.ready;
        session.status = 'online';
        break;
      } catch (error) {
        session.transport?.close();
        session.transport = null;

        if (error.message !== 'code-taken') {
          session.status = 'offline';
          break;
        }
      }
    }

    if (!session.transport) {
      session.status = 'offline';
    }

    session.postSystem(`${cleanName(name)} opened the room`);
    return session;
  }

  static async join({ code, name, pieceKey }) {
    const session = new RoomSession('guest');
    session.code = code.toUpperCase();

    session.transport = openGuestTransport(session.code, {
      onMessage: (_, message) => session.handleHostMessage(message),
      onClose: () => session.handleClosed('The host closed the room'),
    });

    try {
      await session.transport.ready;
    } catch (error) {
      session.transport.close();
      throw new Error(error.message === 'not-found' || error.message === 'timeout' ? 'not-found' : 'network');
    }

    const welcome = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('not-found')), 8000);
      session.pendingWelcome = { resolve, reject, timer };
    });

    session.transport.send({ t: 'hello', v: PROTOCOL, name: cleanName(name), pieceKey });

    try {
      await welcome;
    } catch (error) {
      session.transport.close();
      throw error;
    }

    session.status = 'online';
    return session;
  }

  // ----------------------------------------------------------- host side

  broadcast(message) {
    this.transport?.broadcast(message);
  }

  publishLobby() {
    this.broadcast({ t: 'lobby', lobby: this.lobby });
    this.emit('lobby', this.lobby);
  }

  freePiece(preferred) {
    const taken = new Set(this.lobby.seats.map((seat) => seat.pieceKey));
    return taken.has(preferred) || !PIECE_ORDER.includes(preferred)
      ? PIECE_ORDER.find((piece) => !taken.has(piece))
      : preferred;
  }

  handleGuestMessage(peerId, message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    const seat = this.lobby.seats.find((entry) => entry.clientId === peerId);

    switch (message.t) {
      case 'hello': {
        if (seat) {
          return;
        }

        const reject = (reason) => {
          this.transport.send(peerId, { t: 'reject', reason });
          setTimeout(() => this.transport?.kick(peerId), 300);
        };

        if (this.started) {
          reject('started');
          return;
        }

        if (this.lobby.seats.length >= 4) {
          reject('full');
          return;
        }

        const name = cleanName(message.name) || 'Guest';
        this.lobby.seats.push({
          seatId: peerId,
          name,
          pieceKey: this.freePiece(message.pieceKey),
          kind: 'human',
          clientId: peerId,
        });
        this.lobby.tableSize = Math.max(this.lobby.tableSize, this.lobby.seats.length);

        this.transport.send(peerId, { t: 'welcome', clientId: peerId, code: this.code });
        this.transport.send(peerId, { t: 'chat-log', chat: this.chat });
        this.publishLobby();
        this.postSystem(`${name} joined the table`);
        break;
      }

      case 'chat':
        if (seat) {
          this.appendChat({ name: seat.name, pieceKey: seat.pieceKey, text: message.text });
        }
        break;

      case 'intent':
        if (seat && this.started) {
          this.emit('intent', { clientId: peerId, action: message.action || {} });
        }
        break;

      default:
        break;
    }
  }

  handleGuestLeft(peerId) {
    const seat = this.lobby.seats.find((entry) => entry.clientId === peerId);

    if (!seat) {
      return;
    }

    if (this.started) {
      seat.clientId = null;
      seat.kind = 'bot';
      this.emit('peer-left', peerId);
    } else {
      this.lobby.seats = this.lobby.seats.filter((entry) => entry !== seat);
      this.publishLobby();
      this.postSystem(`${seat.name} left the table`);
    }
  }

  setTableSize(size) {
    if (!this.isHost || this.started) {
      return;
    }

    this.lobby.tableSize = Math.min(4, Math.max(2, size, this.lobby.seats.length));
    this.publishLobby();
  }

  addOpponent(kind) {
    if (!this.isHost || this.started || this.lobby.seats.length >= this.lobby.tableSize) {
      return;
    }

    this.botCounter[kind] += 1;
    const number = this.botCounter[kind];
    this.lobby.seats.push({
      seatId: `${kind}-${number}`,
      name: kind === 'ai' ? `AI Opponent ${number}` : `Computer ${number}`,
      pieceKey: this.freePiece(),
      kind,
      clientId: null,
    });
    this.publishLobby();
  }

  removeSeat(seatId) {
    if (!this.isHost || this.started || seatId === 'host') {
      return;
    }

    const seat = this.lobby.seats.find((entry) => entry.seatId === seatId);

    if (!seat) {
      return;
    }

    this.lobby.seats = this.lobby.seats.filter((entry) => entry !== seat);

    if (seat.clientId) {
      this.transport?.send(seat.clientId, { t: 'reject', reason: 'removed' });
      setTimeout(() => this.transport?.kick(seat.clientId), 300);
      this.postSystem(`${seat.name} was removed from the table`);
    }

    this.publishLobby();
  }

  // Seats become players in seat order; the host is always p1.
  startGame() {
    if (!this.isHost || this.lobby.seats.length < 2) {
      return;
    }

    this.started = true;
    this.players = this.lobby.seats.map((seat, index) => ({
      id: `p${index + 1}`,
      name: seat.name,
      pieceKey: seat.pieceKey,
      kind: seat.kind,
      clientId: seat.clientId === 'host' ? null : seat.clientId,
    }));
    this.myPlayerId = 'p1';

    const gameId = Date.now().toString(36);
    this.broadcast({ t: 'start', players: this.players, gameId });
    this.emit('start', { players: this.players, myPlayerId: 'p1', gameId });
  }

  // A rematch keeps everyone who is still connected.
  restartGame() {
    if (!this.isHost || !this.players) {
      return;
    }

    const connected = new Set(
      this.lobby.seats.filter((seat) => seat.clientId).map((seat) => seat.clientId),
    );
    this.players = this.players.map((player) =>
      player.clientId && !connected.has(player.clientId)
        ? { ...player, kind: 'bot', clientId: null }
        : player,
    );

    const gameId = Date.now().toString(36);
    this.broadcast({ t: 'start', players: this.players, gameId });
    this.emit('start', { players: this.players, myPlayerId: 'p1', gameId });
  }

  broadcastGame(state) {
    if (this.isHost) {
      this.broadcast({ t: 'game', state, sentAt: Date.now() });
    }
  }

  postSystem(text) {
    if (this.isHost) {
      this.appendChat({ name: 'Manapally', pieceKey: null, text, system: true });
    }
  }

  // Chat from a player seat (AI opponents included), hosted locally.
  postAs(playerName, pieceKey, text) {
    if (this.isHost) {
      this.appendChat({ name: playerName, pieceKey, text });
    }
  }

  appendChat({ name, pieceKey, text, system = false }) {
    const clean = cleanText(text);

    if (!clean) {
      return;
    }

    const message = { id: chatId(), name, pieceKey, text: clean, system, ts: Date.now() };
    this.chat = [...this.chat, message].slice(-MAX_CHAT);
    this.broadcast({ t: 'chat', message });
    this.emit('chat', this.chat);
  }

  // ---------------------------------------------------------- guest side

  handleHostMessage(message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.t) {
      case 'welcome':
        this.myClientId = message.clientId;

        if (this.pendingWelcome) {
          clearTimeout(this.pendingWelcome.timer);
          this.pendingWelcome.resolve();
          this.pendingWelcome = null;
        }
        break;

      case 'reject':
        if (this.pendingWelcome) {
          clearTimeout(this.pendingWelcome.timer);
          this.pendingWelcome.reject(new Error(message.reason || 'rejected'));
          this.pendingWelcome = null;
        } else {
          this.handleClosed(
            message.reason === 'removed' ? 'The host removed you from the table' : 'The room is no longer available',
          );
        }
        break;

      case 'lobby':
        this.lobby = message.lobby;
        this.emit('lobby', this.lobby);
        break;

      case 'chat-log':
        this.chat = Array.isArray(message.chat) ? message.chat.slice(-MAX_CHAT) : [];
        this.emit('chat', this.chat);
        break;

      case 'chat':
        this.chat = [...this.chat, message.message].slice(-MAX_CHAT);
        this.emit('chat', this.chat);
        break;

      case 'start': {
        this.started = true;
        this.lastGame = null;
        this.players = message.players;
        const me = message.players.find((player) => player.clientId === this.myClientId);
        this.myPlayerId = me ? me.id : null;
        this.emit('start', { players: message.players, myPlayerId: this.myPlayerId, gameId: message.gameId });
        break;
      }

      case 'game':
        // Cached so a board that mounts a moment later still starts in sync.
        this.lastGame = message;
        this.emit('game', message);
        break;

      case 'closed':
        this.handleClosed('The host closed the room');
        break;

      default:
        break;
    }
  }

  sendIntent(action) {
    if (!this.isHost) {
      this.transport?.send({ t: 'intent', action });
    }
  }

  // ------------------------------------------------------------- shared

  sendChat(text) {
    const clean = cleanText(text);

    if (!clean) {
      return;
    }

    if (this.isHost) {
      const me = this.lobby.seats.find((seat) => seat.clientId === 'host');
      this.appendChat({ name: me?.name || 'Host', pieceKey: me?.pieceKey, text: clean });
    } else {
      this.transport?.send({ t: 'chat', text: clean });
    }
  }

  handleClosed(reason) {
    if (this.status === 'closed') {
      return;
    }

    this.status = 'closed';
    this.transport?.close();
    this.emit('closed', reason);
  }

  close() {
    if (this.status === 'closed') {
      return;
    }

    if (this.isHost) {
      this.broadcast({ t: 'closed' });
    }

    this.status = 'closed';
    // Give the goodbye a moment to leave before tearing the channel down.
    const transport = this.transport;
    setTimeout(() => transport?.close(), 150);
    this.listeners.clear();
  }
}
