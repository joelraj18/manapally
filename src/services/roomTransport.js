// Message transports for private rooms.
//
// `peer` uses PeerJS: WebRTC data channels between browsers, introduced by the
// free public PeerJS signalling server, so a static site on GitHub Pages needs
// no backend of its own. Game traffic flows directly between players.
//
// `local` uses a BroadcastChannel, which links tabs of the same browser. It
// powers automated tests and works offline. Add ?net=local to the URL to use it.
//
// Both expose the same small interface:
//   host:  { ready, send(peerId, msg), broadcast(msg), kick(peerId), close() }
//   guest: { ready, send(msg), close() }
// with callbacks onPeerOpen(peerId), onMessage(peerId, msg), onPeerClose(peerId),
// onClose() and onError(code).

import Peer from 'peerjs';

const ID_PREFIX = 'manapally-room-';
const CONNECT_TIMEOUT = 15000;

export const transportKind = () => {
  try {
    return new URLSearchParams(window.location.search).get('net') === 'local' ? 'local' : 'peer';
  } catch {
    return 'peer';
  }
};

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

// ------------------------------------------------------------------ PeerJS

const peerErrorCode = (error) => {
  switch (error?.type) {
    case 'unavailable-id':
      return 'code-taken';
    case 'peer-unavailable':
      return 'not-found';
    case 'browser-incompatible':
      return 'unsupported';
    default:
      return 'network';
  }
};

const hostWithPeer = (code, handlers) => {
  const peer = new Peer(`${ID_PREFIX}${code.toLowerCase()}`, { debug: 0 });
  const connections = new Map();

  const ready = new Promise((resolve, reject) => {
    peer.on('open', () => resolve());
    peer.on('error', (error) => {
      const reason = peerErrorCode(error);
      reject(new Error(reason));
      handlers.onError?.(reason);
    });
  });

  peer.on('connection', (connection) => {
    connection.on('open', () => {
      connections.set(connection.peer, connection);
      handlers.onPeerOpen?.(connection.peer);
    });
    connection.on('data', (data) => handlers.onMessage?.(connection.peer, data));
    connection.on('close', () => {
      connections.delete(connection.peer);
      handlers.onPeerClose?.(connection.peer);
    });
    connection.on('error', () => {});
  });

  peer.on('disconnected', () => {
    // Lost the signalling server; existing data channels keep working, but
    // reconnecting lets new friends still find the room.
    if (!peer.destroyed) {
      peer.reconnect();
    }
  });

  return {
    ready,
    send: (peerId, message) => connections.get(peerId)?.send(message),
    broadcast: (message) => connections.forEach((connection) => connection.send(message)),
    kick: (peerId) => connections.get(peerId)?.close(),
    close: () => peer.destroy(),
  };
};

const guestWithPeer = (code, handlers) => {
  const peer = new Peer({ debug: 0 });
  let connection = null;

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), CONNECT_TIMEOUT);

    peer.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(peerErrorCode(error)));
    });

    peer.on('open', () => {
      connection = peer.connect(`${ID_PREFIX}${code.toLowerCase()}`, {
        reliable: true,
        serialization: 'json',
      });
      connection.on('open', () => {
        clearTimeout(timer);
        resolve();
      });
      connection.on('data', (data) => handlers.onMessage?.('host', data));
      connection.on('close', () => handlers.onClose?.());
      connection.on('error', () => {});
    });
  });

  return {
    ready,
    send: (message) => connection?.open && connection.send(message),
    close: () => peer.destroy(),
  };
};

// -------------------------------------------------------- BroadcastChannel

const hostWithChannel = (code, handlers) => {
  const channel = new BroadcastChannel(`${ID_PREFIX}${code}`);
  const guests = new Set();

  channel.onmessage = ({ data }) => {
    if (!data || data.to !== 'host') {
      return;
    }

    if (data.kind === 'probe') {
      channel.postMessage({ to: data.from, kind: 'here' });
    } else if (data.kind === 'join') {
      guests.add(data.from);
      channel.postMessage({ to: data.from, kind: 'accepted' });
      handlers.onPeerOpen?.(data.from);
    } else if (data.kind === 'leave') {
      guests.delete(data.from);
      handlers.onPeerClose?.(data.from);
    } else if (data.kind === 'msg' && guests.has(data.from)) {
      handlers.onMessage?.(data.from, data.payload);
    }
  };

  const onUnload = () => channel.postMessage({ to: '*', kind: 'host-gone' });
  window.addEventListener('pagehide', onUnload);

  return {
    ready: Promise.resolve(),
    send: (peerId, payload) => channel.postMessage({ to: peerId, kind: 'msg', payload }),
    broadcast: (payload) => guests.forEach((id) => channel.postMessage({ to: id, kind: 'msg', payload })),
    kick: (peerId) => {
      guests.delete(peerId);
      channel.postMessage({ to: peerId, kind: 'host-gone' });
    },
    close: () => {
      onUnload();
      window.removeEventListener('pagehide', onUnload);
      channel.close();
    },
  };
};

const guestWithChannel = (code, handlers) => {
  const channel = new BroadcastChannel(`${ID_PREFIX}${code}`);
  const id = randomId();

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('not-found')), 2500);

    channel.onmessage = ({ data }) => {
      if (!data || (data.to !== id && data.to !== '*')) {
        return;
      }

      if (data.kind === 'here') {
        channel.postMessage({ to: 'host', from: id, kind: 'join' });
      } else if (data.kind === 'accepted') {
        clearTimeout(timer);
        resolve();
      } else if (data.kind === 'msg') {
        handlers.onMessage?.('host', data.payload);
      } else if (data.kind === 'host-gone') {
        handlers.onClose?.();
      }
    };

    channel.postMessage({ to: 'host', from: id, kind: 'probe' });
  });

  const onUnload = () => channel.postMessage({ to: 'host', from: id, kind: 'leave' });
  window.addEventListener('pagehide', onUnload);

  return {
    ready,
    send: (payload) => channel.postMessage({ to: 'host', from: id, kind: 'msg', payload }),
    close: () => {
      onUnload();
      window.removeEventListener('pagehide', onUnload);
      channel.close();
    },
  };
};

export const openHostTransport = (code, handlers) =>
  transportKind() === 'local' ? hostWithChannel(code, handlers) : hostWithPeer(code, handlers);

export const openGuestTransport = (code, handlers) =>
  transportKind() === 'local' ? guestWithChannel(code, handlers) : guestWithPeer(code, handlers);
