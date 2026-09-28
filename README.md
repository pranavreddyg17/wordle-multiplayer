# Multiplayer Wordle

A real-time word game with private rooms, simultaneous guesses, timed rounds, and a shared scoreboard. The frontend uses plain JavaScript; a Node.js server owns room state and validates guesses.

## Run locally

Use Node.js 22+ and npm.

```sh
git clone https://github.com/pranavreddyg17/wordle-multiplayer.git
cd wordle-multiplayer
npm ci
npm run dev
```

Open <http://localhost:3000> in two browser tabs. Create a room in one, join with its room code in the other, and start a game as the host. `PORT=3102 npm start` selects another local port.

## What works

- Private room codes and host-controlled rounds/timers.
- WebSocket updates for room state and round progress.
- Server-side dictionary checks and repeated-letter tile scoring.
- Rankings by words solved, guesses, and solve time.

## Architecture

| Path | Responsibility |
| --- | --- |
| `public/` | Screens, keyboard, tile grid, and WebSocket client |
| `server/gameEngine.js` | Pure scoring, guess validation, and ranking |
| `server/roomManager.js` | In-memory rooms and player sessions |
| `server/wsHandler.js` | Connections, broadcasts, and round timers |
| `server/wordService.js` | Word lists and selection |

## Check changes

```sh
npm test
```

The tests cover repeated letters, invalid guesses, ranking, room limits, host permissions, and round expiration. For browser testing, use two independent players and check reconnect behavior during both the lobby and an active round.

## Limitations

Rooms and sessions disappear when the server restarts. Reconnection and identity handling are prototype features, not production account security. Public hosting would need abuse controls, deployment hardening, and a durable state plan if persistence is required.

Wordle is the inspiration for the game; this is an independent project. No open-source license is currently granted for the application source.
