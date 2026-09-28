# UNO

Real-time multiplayer UNO in the browser. Create a table, share the link, and play with friends by the official rules.

## Features

- Official rules: 108-card deck, action and wild cards, the Wild Draw Four challenge, calling and catching UNO, official scoring
- Quick game or Race to 500 with a running scoreboard
- Tables for 2 to 10 players, invite by code, link or QR code, and up to 20 spectators
- Bots for empty seats in three difficulty levels
- Sessions survive refreshes, closed tabs and dropped connections; a bot plays for anyone who leaves until they return
- Game state is persisted, so tables survive server restarts and redeploys
- Chat, quick phrases and emoji reactions
- Keyboard shortcuts: `D` draw, `K` keep, `U` call UNO, `C` catch, `S` sort, `T` chat, `1`-`4` pick a color
- Responsive layout for phones, tablets and desktops

## Tech stack

| Area       | Tools                                                 |
| ---------- | ----------------------------------------------------- |
| Client     | React 19, Vite, TypeScript, Zustand, Motion, Radix UI |
| Server     | Node.js 22, Fastify, Socket.IO, Zod                   |
| Storage    | libSQL (local SQLite file or Turso)                   |
| Testing    | Vitest, fast-check, Playwright                        |
| Deployment | Docker, Render, GitHub Actions                        |

## Project structure

```
apps/
  server/      Game server: HTTP API, WebSockets, rooms, sessions, timers, bots, persistence
  web/         Browser client
packages/
  engine/      Rules engine: deck, turns, scoring, bots, per-player views
  protocol/    Shared types, constants and input validation
e2e/           End-to-end browser tests
scripts/       Development tooling
```

## Getting started

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

The server runs on http://localhost:3001 and the client on http://localhost:5173.

## Scripts

| Command             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start the server and client in watch mode       |
| `npm run build`     | Build the client and bundle the server          |
| `npm start`         | Run the production server with the built client |
| `npm test`          | Run unit and integration tests                  |
| `npm run test:e2e`  | Run end-to-end tests against a production build |
| `npm run typecheck` | Type-check every package                        |
| `npm run format`    | Format the codebase with Prettier               |

End-to-end tests use the installed Microsoft Edge by default. Set `PW_CHANNEL=chromium` to use Playwright's Chromium, or `E2E_BASE_URL` to test a running deployment.

## Deployment

The app ships as a single Docker image that serves both the API and the client.

```bash
docker build -t uno .
docker run --rm -p 3001:3001 -e SESSION_SECRET=change-me uno
```

### Render

1. Create a database on [Turso](https://turso.tech) and note its URL and auth token.
2. In Render, create a new Blueprint from this repository. `render.yaml` provisions a free Docker web service in Singapore with a health check on `/healthz`.
3. Set `DATABASE_URL` and `DATABASE_AUTH_TOKEN`. `SESSION_SECRET` is generated automatically.
4. Free services sleep after 15 minutes of inactivity. The `Keep alive` workflow pings `/healthz` every 10 minutes to keep the service warm; update its URL if you deploy under a different name.

## Configuration

| Variable              | Default              | Description                                                  |
| --------------------- | -------------------- | ------------------------------------------------------------ |
| `PORT`                | `3001`               | HTTP port                                                    |
| `DATABASE_URL`        | `file:./data/uno.db` | libSQL connection URL                                        |
| `DATABASE_AUTH_TOKEN` |                      | Turso auth token                                             |
| `SESSION_SECRET`      |                      | Secret used to sign session cookies (required in production) |
| `ALLOWED_ORIGINS`     |                      | Comma-separated extra origins allowed to connect             |

## Architecture

The server is authoritative. Clients send intents, the server validates them against the rules engine, and each player receives a snapshot containing only their own hand. Commands carry ids so retries are applied once. Rooms are persisted shortly after every change and deadlines are stored as timestamps, so a restarted server resumes every game where it left off.

Turns last 45 seconds, 20 seconds after drawing and 20 seconds for a challenge or the opening color. A timed-out player draws automatically, and after three consecutive timeouts a bot plays for them until they return. A disconnected player's seat is held for 60 seconds before a bot takes over.
