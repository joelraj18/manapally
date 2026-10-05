// Relay: room messages carried through public Nostr relays.
//
// Direct WebRTC needs the PeerJS signalling server and an open path between
// two browsers. College and office networks, VPNs and some mobile carriers
// block one or both. Relays are ordinary secure websockets on port 443, the
// same as any website, so they get through almost everywhere.
//
// Every message is sealed with AES GCM under a key made from the room code,
// so only people who know the code can read it, and sent as a short lived
// (ephemeral) event that relays forward without storing. Several relays are
// used at once and duplicates are dropped, so one relay going down does not
// matter. The signing key is made fresh for each tab and only kept in memory.
//
// It speaks the same small protocol as the BroadcastChannel transport:
// probe, here, join, accepted, msg, leave, host-gone, plus ping so each side
// notices when the other has gone quiet.

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom'];

const KIND = 25050;
const OPEN_TIMEOUT = 8000;
const FIND_TIMEOUT = 12000;
const PROBE_EVERY = 1500;
const PING_EVERY = 8000;
const SILENT_FOR = 30000;
const GAME_EVERY = 300;
const SEEN_LIMIT = 2000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ?relay=wss://a,wss://b swaps the relay list, used by tests with a local relay.
export const relayUrls = () => {
  try {
    const custom = new URLSearchParams(window.location.search).get('relay');
    const list = custom ? custom.split(',').map((url) => url.trim()).filter((url) => /^wss?:\/\//.test(url)) : [];
    return list.length ? list : DEFAULT_RELAYS;
  } catch {
    return DEFAULT_RELAYS;
  }
};

const randomId = () => `r${bytesToHex(crypto.getRandomValues(new Uint8Array(6)))}`;

const toBase64 = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
};

const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

// --------------------------------------------------------------- sealing

const roomTopic = (code) => bytesToHex(sha256(encoder.encode(`manapally topic ${code.toUpperCase()}`))).slice(0, 32);

const roomKey = (code) =>
  crypto.subtle.importKey('raw', sha256(encoder.encode(`manapally room ${code.toUpperCase()}`)), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

const pipeThrough = async (bytes, stream) => {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
};

// One flag byte says whether the body was deflated, so a browser without
// CompressionStream can still talk to one that has it.
export const seal = async (key, envelope) => {
  const plain = encoder.encode(JSON.stringify(envelope));
  let body = plain;
  let flag = 0;

  if (canCompress() && plain.length > 512) {
    body = await pipeThrough(plain, new CompressionStream('deflate'));
    flag = 1;
  }

  const framed = new Uint8Array(body.length + 1);
  framed[0] = flag;
  framed.set(body, 1);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, framed));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv);
  out.set(cipher, iv.length);
  return toBase64(out);
};

export const unseal = async (key, text) => {
  const bytes = fromBase64(text);
  const framed = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)),
  );
  const body = framed.subarray(1);
  const plain = framed[0] === 1 ? await pipeThrough(body, new DecompressionStream('deflate')) : body;
  return JSON.parse(decoder.decode(plain));
};

// ------------------------------------------------------------- the pool

// Opens every relay, keeps them open while the room lives, and hands over
// each sealed envelope once, in the order it arrived.
export const openRelayPool = (
  code,
  onEnvelope,
  { urls = relayUrls(), Socket = window.WebSocket, openTimeout = OPEN_TIMEOUT } = {},
) => {
  const secret = schnorr.utils.randomPrivateKey();
  const pubkey = bytesToHex(schnorr.getPublicKey(secret));
  const topic = roomTopic(code);
  const keyReady = roomKey(code);
  const sockets = new Map();
  const seen = new Set();
  const backlog = [];
  let closed = false;
  let chain = Promise.resolve();
  let markOpen;
  let markFailed;

  const ready = new Promise((resolve, reject) => {
    markOpen = resolve;
    markFailed = reject;
  });
  ready.catch(() => {});
  const failTimer = setTimeout(() => markFailed(new Error('blocked')), openTimeout);

  const remember = (id) => {
    seen.add(id);
    if (seen.size > SEEN_LIMIT) {
      seen.delete(seen.values().next().value);
    }
  };

  const handleEvent = (event) => {
    if (!event || event.kind !== KIND || seen.has(event.id)) return;
    remember(event.id);
    if (event.pubkey === pubkey) return;

    chain = chain
      .then(async () => onEnvelope(await unseal(await keyReady, event.content)))
      .catch(() => {});
  };

  const connect = (url, attempt = 0) => {
    if (closed) return;
    let socket;

    try {
      socket = new Socket(url);
    } catch {
      return;
    }

    sockets.set(url, socket);

    socket.onopen = () => {
      attempt = 0;
      socket.send(JSON.stringify(['REQ', 'room', { kinds: [KIND], '#t': [topic], since: Math.floor(Date.now() / 1000) - 30 }]));
      backlog.splice(0).forEach((frame) => socket.send(frame));
      clearTimeout(failTimer);
      markOpen();
    };

    socket.onmessage = ({ data }) => {
      try {
        const frame = JSON.parse(typeof data === 'string' ? data : decoder.decode(data));
        if (frame[0] === 'EVENT') handleEvent(frame[2]);
      } catch {
        // Not ours, or not JSON.
      }
    };

    socket.onerror = () => {};
    socket.onclose = () => {
      if (sockets.get(url) === socket) sockets.delete(url);
      if (!closed) {
        setTimeout(() => connect(url, attempt + 1), Math.min(15000, 1000 * 2 ** attempt));
      }
    };
  };

  urls.forEach((url) => connect(url));

  const openSockets = () => [...sockets.values()].filter((socket) => socket.readyState === 1);

  const publish = async (envelope) => {
    const content = await seal(await keyReady, envelope);
    const event = { pubkey, created_at: Math.floor(Date.now() / 1000), kind: KIND, tags: [['t', topic]], content };
    event.id = bytesToHex(sha256(encoder.encode(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]))));
    event.sig = bytesToHex(schnorr.sign(event.id, secret));
    remember(event.id);

    const frame = JSON.stringify(['EVENT', event]);
    const live = openSockets();

    if (live.length) {
      live.forEach((socket) => socket.send(frame));
    } else if (backlog.length < 50) {
      backlog.push(frame);
    }
  };

  return {
    ready,
    publish: (envelope) => {
      if (!closed) publish(envelope).catch(() => {});
    },
    close: () => {
      closed = true;
      clearTimeout(failTimer);
      sockets.forEach((socket) => {
        try {
          socket.close();
        } catch {
          // Already gone.
        }
      });
      sockets.clear();
    },
  };
};

// Snapshots of the board change many times a second while a piece moves.
// Over a relay only the newest one matters, so they are sent at most every
// GAME_EVERY ms and a newer snapshot replaces one still waiting.
const gameThrottle = (send) => {
  let pending = null;
  let timer = null;
  let last = 0;

  const flush = () => {
    timer = null;
    last = Date.now();
    if (pending) {
      const payload = pending;
      pending = null;
      send(payload);
    }
  };

  return (payload) => {
    pending = payload;
    if (timer) return;
    const wait = Math.max(0, GAME_EVERY - (Date.now() - last));
    timer = setTimeout(flush, wait);
  };
};

// ------------------------------------------------------------------ host

// Relays replay the last few seconds to a new subscriber, so every host run
// has its own session id. Guests echo it, and anything carrying another
// session's id (from before a reload) is ignored.
export const hostWithRelay = (code, handlers, options) => {
  const guests = new Map(); // id -> last heard
  const session = randomId();
  let pool = null;

  const post = (envelope) => pool.publish({ from: 'host', hs: session, ...envelope });

  pool = openRelayPool(
    code,
    (data) => {
      if (!data || data.to !== 'host' || typeof data.from !== 'string') return;
      if (data.kind !== 'probe' && data.hs !== session) return;

      if (guests.has(data.from)) guests.set(data.from, Date.now());

      if (data.kind === 'probe') {
        post({ to: data.from, kind: 'here' });
      } else if (data.kind === 'join') {
        const fresh = !guests.has(data.from);
        guests.set(data.from, Date.now());
        post({ to: data.from, kind: 'accepted' });
        if (fresh) handlers.onPeerOpen?.(data.from);
      } else if (data.kind === 'leave') {
        if (guests.delete(data.from)) handlers.onPeerClose?.(data.from);
      } else if (data.kind === 'msg' && guests.has(data.from)) {
        handlers.onMessage?.(data.from, data.payload);
      }
    },
    options,
  );

  const broadcastGame = gameThrottle((payload) => post({ to: '*', kind: 'msg', payload }));

  // Guests ping; one that stays silent has closed its tab or lost signal.
  const ping = setInterval(() => {
    post({ to: '*', kind: 'ping' });
    const cutoff = Date.now() - SILENT_FOR;
    guests.forEach((heard, id) => {
      if (heard < cutoff) {
        guests.delete(id);
        handlers.onPeerClose?.(id);
      }
    });
  }, PING_EVERY);

  const onUnload = () => post({ to: '*', kind: 'host-gone' });
  window.addEventListener('pagehide', onUnload);

  return {
    ready: pool.ready,
    owns: (peerId) => guests.has(peerId),
    send: (peerId, payload) => post({ to: peerId, kind: 'msg', payload }),
    broadcast: (payload) => {
      if (!guests.size) return;
      if (payload?.t === 'game') broadcastGame(payload);
      else post({ to: '*', kind: 'msg', payload });
    },
    kick: (peerId) => {
      guests.delete(peerId);
      post({ to: peerId, kind: 'host-gone' });
    },
    close: () => {
      clearInterval(ping);
      window.removeEventListener('pagehide', onUnload);
      onUnload();
      setTimeout(() => pool.close(), 400);
    },
  };
};

// ----------------------------------------------------------------- guest

export const guestWithRelay = (code, handlers, options) => {
  const id = randomId();
  let heard = Date.now();
  let joined = false;
  let hostSession = null;
  let gameSeq = 0;
  let pool = null;
  let probe = null;
  let watch = null;
  let resolveReady;
  let rejectReady;

  const post = (envelope) => pool.publish({ from: id, to: 'host', hs: hostSession, ...envelope });

  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  pool = openRelayPool(
    code,
    (data) => {
      if (!data || data.from !== 'host' || (data.to !== id && data.to !== '*')) return;
      if (joined && data.hs !== hostSession) return;
      if (joined) heard = Date.now();

      if (data.kind === 'here' && !joined) {
        post({ kind: 'join', hs: data.hs });
      } else if (data.kind === 'accepted' && !joined) {
        hostSession = data.hs;
        heard = Date.now();
        joined = true;
        clearInterval(probe);
        clearTimeout(findTimer);
        resolveReady();
      } else if (data.kind === 'msg' && joined) {
        // Relays can deliver a little out of order; a stale board is dropped.
        if (data.payload?.t === 'game') {
          const at = data.payload.sentAt || 0;
          if (at < gameSeq) return;
          gameSeq = at;
        }
        handlers.onMessage?.('host', data.payload);
      } else if (data.kind === 'host-gone' && joined) {
        handlers.onClose?.();
      }
    },
    options,
  );

  let findTimer = null;

  pool.ready.then(
    () => {
      post({ kind: 'probe' });
      probe = setInterval(() => post({ kind: 'probe' }), PROBE_EVERY);
      findTimer = setTimeout(() => rejectReady(new Error('not-found')), options?.findTimeout || FIND_TIMEOUT);
    },
    (error) => rejectReady(error),
  );

  ready.then(
    () => {
      watch = setInterval(() => {
        post({ kind: 'ping' });
        if (Date.now() - heard > SILENT_FOR) {
          clearInterval(watch);
          handlers.onClose?.();
        }
      }, PING_EVERY);
    },
    () => {},
  );

  const onUnload = () => post({ kind: 'leave' });
  window.addEventListener('pagehide', onUnload);

  return {
    ready,
    send: (payload) => joined && post({ kind: 'msg', payload }),
    close: () => {
      clearInterval(probe);
      clearInterval(watch);
      clearTimeout(findTimer);
      window.removeEventListener('pagehide', onUnload);
      if (joined) onUnload();
      setTimeout(() => pool.close(), 400);
    },
  };
};

// For the connection check: can this device reach any relay at all?
export const canReachRelay = async (options) => {
  const pool = openRelayPool('CHECK0', () => {}, options);
  try {
    await pool.ready;
    return true;
  } catch {
    return false;
  } finally {
    pool.close();
  }
};
