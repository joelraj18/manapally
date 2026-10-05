# Manapally

A property trading board game set in Andhra Pradesh and Telangana, played in the browser with friends, computer opponents or premium AI opponents.

## How players connect

Manapally is a static site with no backend. The host's browser runs the match. Friends reach it in one of two ways:

- **Direct.** A WebRTC data channel between the browsers, introduced by the public PeerJS signalling server. This is the fastest route.
- **Relay.** Messages go through public Nostr relays over secure websockets on port 443, the same port as ordinary websites. College, office and VPN networks that block WebRTC or the PeerJS server usually allow this. Every message is encrypted with AES GCM under a key derived from the room code, and is sent as an ephemeral event that relays forward without storing.

The host listens on both routes at once. A guest in Auto mode tries Direct first, falls back to Relay when Direct is blocked or slow, and remembers which route worked. Under **Having trouble joining** in the lobby, players can pick a route by hand and run a connection check.

### Optional TURN server

Direct play on strict networks improves with a TURN server on port 443. Free tiers exist, for example at Metered or Cloudflare. Supply the credentials at build time:

```
REACT_APP_TURN_URLS=turns:example.turn.server:443?transport=tcp
REACT_APP_TURN_USERNAME=...
REACT_APP_TURN_CREDENTIAL=...
```

These are ICE relay credentials, not secrets, and they are served to every visitor.

### Testing switches

- `?net=local` uses a BroadcastChannel between tabs of one browser, for automated tests.
- `?net=relay` forces Relay.
- `?relay=wss://a,wss://b` replaces the relay list, for example with a local test relay.
- `?join=CODE` opens the lobby with the room code filled in. Invite links use this.

## Scripts

- `npm start` runs the development server.
- `npm test` runs the unit tests.
- `npm run build` builds the site, and `npm run deploy` publishes it to GitHub Pages.
