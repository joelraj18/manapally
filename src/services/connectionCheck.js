// A quick look at what this device's network allows, so a player who cannot
// join learns why and what to try. Three checks run side by side:
//   service  can the PeerJS room service be reached
//   direct   can WebRTC find a public route (STUN) or a TURN relay
//   relay    can a websocket relay be reached
// Each resolves to 'ok', 'limited' or 'blocked'.

import Peer from 'peerjs';
import { canReachRelay } from './relayTransport';
import { iceServers, transportKind } from './roomTransport';

const withTimeout = (promise, ms, fallback) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);

const checkService = () =>
  new Promise((resolve) => {
    let peer;

    try {
      peer = new Peer({ debug: 0 });
    } catch {
      resolve('blocked');
      return;
    }

    const done = (result) => {
      peer.destroy();
      resolve(result);
    };

    peer.on('open', () => done('ok'));
    peer.on('error', () => done('blocked'));
    setTimeout(() => done('blocked'), 6000);
  });

// Gathers ICE candidates: a public (srflx) or relay candidate means a direct
// link can be made, only local (host) candidates mean it most likely cannot.
const checkDirect = () =>
  new Promise((resolve) => {
    if (typeof RTCPeerConnection !== 'function') {
      resolve('blocked');
      return;
    }

    const found = new Set();
    let connection;

    try {
      connection = new RTCPeerConnection({ iceServers: iceServers() });
    } catch {
      resolve('blocked');
      return;
    }

    const finish = () => {
      connection.close();
      resolve(found.has('srflx') || found.has('relay') ? 'ok' : found.size ? 'limited' : 'blocked');
    };

    connection.onicecandidate = ({ candidate }) => {
      if (!candidate) {
        finish();
        return;
      }

      const type = candidate.type || / typ (\w+)/.exec(candidate.candidate)?.[1];
      if (type) found.add(type);
    };

    connection.createDataChannel('check');
    connection
      .createOffer()
      .then((offer) => connection.setLocalDescription(offer))
      .catch(() => resolve('blocked'));
    setTimeout(finish, 6000);
  });

export const runConnectionCheck = async () => {
  if (transportKind() === 'local') {
    return { service: 'ok', direct: 'ok', relay: 'ok' };
  }

  const [service, direct, relay] = await Promise.all([
    withTimeout(checkService(), 7000, 'blocked'),
    withTimeout(checkDirect(), 7000, 'blocked'),
    withTimeout(canReachRelay().then((ok) => (ok ? 'ok' : 'blocked')), 9000, 'blocked'),
  ]);

  return { service, direct, relay };
};

// Plain advice for the result, in the order a player should act on it.
export const checkVerdict = ({ service, direct, relay }) => {
  if (service === 'ok' && direct === 'ok') {
    return 'Your connection is ready, you can host and join directly';
  }

  if (relay === 'ok') {
    return 'Your network blocks direct links, Manapally switches to Relay by itself so you can still play';
  }

  return 'This network blocks every game route, switch to mobile data or a hotspot, turn off any VPN or ad blocking DNS and try again';
};
