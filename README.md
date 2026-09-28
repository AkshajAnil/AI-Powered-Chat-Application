# Full-Stack Real-Time Chat Application

A real-time chat app with a **React (Vite)** frontend and a **Node.js + Express + Socket.io** backend.
Messages are persisted in **PostgreSQL** (SQLite / JSON file fallback), delivered instantly over WebSockets, and restored after a refresh.

```
frontend/   React (Vite) chat client  -> http://localhost:5174 (5173 by default)
backend/    Express REST + Socket.io  -> http://localhost:5000
database/   PostgreSQL "Chat-Application", table "messages"
```

---

## Features

**Core (required)**
- Send messages and receive them instantly via Socket.io (no refresh/polling).
- REST APIs to send messages and fetch chat history.
- Previous messages restored after refreshing the app.
- Timestamps on every message (plus day separators: Today / Yesterday / date).
- Graceful connect / reconnect / disconnect handling with a visible connection state.
- Validation and error handling on both REST and Socket layers (structured error payloads).

**Bonus**
- **AI agents powered by Groq** — Nova, Atlas and Sage sit in the room as always-online
  users and answer `@mentions` (see the *AI agents* section).
- Username-based dummy login (no password, stored in `localStorage`).
- Typing indicator (throttled client-side, auto-expiring server-side).
- Online / offline user presence list.
- Message status: `sent` → `delivered` → `read` with ✓ / ✓✓ ticks.
- **PostgreSQL** persistence (`DB_DRIVER=postgres`), with `sqlite` and `file` drivers as drop-in fallbacks.
- Server-side tests (`node --test`) and headless-browser E2E flows.

---

## Project structure

```
.
├── backend/
│   ├── src/
│   │   ├── config/env.js              # environment configuration
│   │   ├── controllers/               # request handlers (thin)
│   │   ├── middleware/                # 404 + central error handler
│   │   ├── agents/                    # AI personas (registry) + Groq client
│   │   ├── repositories/              # storage abstraction (postgres | sqlite | file)
│   │   ├── routes/                    # REST route definitions
│   │   ├── services/                  # business logic (messages + agents)
│   │   ├── sockets/                   # Socket.io server, presence, event gateway
│   │   ├── utils/                     # logger, ApiError, asyncHandler
│   │   ├── validators/                # input validation
│   │   ├── app.js                     # express app factory
│   │   └── server.js                  # composition root + lifecycle
│   ├── tests/api.test.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/client.js              # fetch wrapper for REST
│   │   ├── socket/socket.js           # shared Socket.io client
│   │   ├── hooks/useChat.js           # all real-time state in one hook
│   │   ├── components/                # LoginForm, ChatLayout, MessageList, ...
│   │   ├── utils/format.js            # timestamps, initials, grouping
│   │   └── styles/index.css
│   └── vite.config.js                 # dev proxy for /api and /socket.io
├── package.json                       # root convenience scripts
└── README.md
```

**Layering:** `routes → controllers → services → repositories`.
Socket handlers call the *same* services as REST, so both paths behave identically.
Broadcasting goes through a small event gateway (`sockets/chatEvents.js`) so services never
depend on Socket.io internals.

---

## Prerequisites

- Node.js **18+** (tested on Node 22)
- npm 10+
- A C/C++ toolchain is **not** required: `better-sqlite3` installs prebuilt binaries.

---

## Setup

### 1. Backend

```bash
cd backend
npm install
copy .env.example .env      # Windows: copy, macOS/Linux: cp .env.example .env
npm start                   # or: npm run dev  (auto-restart on changes)
```

**Database (PostgreSQL).** Create the database once, then point `.env` at it:

```bash
psql -U postgres -c 'CREATE DATABASE "Chat-Application";'
```

```env
DB_DRIVER=postgres
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=****
PGDATABASE=Chat-Application
```

The `messages` table and its index are created automatically on first start.
No migration step is needed. Prefer no database? Set `DB_DRIVER=sqlite` (file at
`./data/chat.db`) or `DB_DRIVER=file` (JSON) — the rest of the app is unchanged.

API + Socket.io now listen on `http://localhost:5000`.
Check: `curl http://localhost:5000/api/health`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and `/socket.io`
to the backend, so no CORS configuration is needed in development.

### 3. Everything at once (from the repo root)

```bash
npm install          # installs root tooling (concurrently)
npm run install:all  # installs backend + frontend dependencies
npm run dev          # starts backend and frontend together
```

### 4. Tests

```bash
npm --prefix backend test   # 12 integration tests (REST, Socket.io, Postgres, agents)
npm test                    # backend tests + frontend production build
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable        | Default                  | Description                                              |
| --------------- | ------------------------ | -------------------------------------------------------- |
| `PORT`          | `5000`                   | HTTP + Socket.io port                                    |
| `HOST`          | `0.0.0.0`                | Bind address                                             |
| `CORS_ORIGINS`  | `http://localhost:5173`  | Comma-separated allowed origins (`*` allows any)         |
| `DB_DRIVER`     | `sqlite`                 | `postgres` \| `sqlite` \| `file`                         |
| `PGHOST`        | `localhost`              | PostgreSQL host                                          |
| `PGPORT`        | `5432`                   | PostgreSQL port                                          |
| `PGUSER`        | `postgres`               | PostgreSQL user                                          |
| `PGPASSWORD`    | _(empty)_                | PostgreSQL password                                      |
| `PGDATABASE`    | `Chat-Application`       | PostgreSQL database name                                 |
| `PG_POOL_MAX`   | `10`                     | Maximum pooled connections                               |
| `DATABASE_PATH` | `./data/chat.db`         | SQLite file location (used when `DB_DRIVER=sqlite`)      |
| `LOG_LEVEL`     | `info`                   | `debug` \| `info` \| `warn` \| `error` \| `silent`       |
| `GROQ_API_KEY`  | _(empty)_                | Groq API key — enables the AI agents ([console.groq.com](https://console.groq.com/keys)) |
| `GROQ_MODEL`    | `openai/gpt-oss-120b`    | Groq chat model                                         |
| `GROQ_TEMPERATURE` | `0.7`                  | Sampling temperature for agent replies                  |

### Frontend (`frontend/.env`, optional)

| Variable        | Default          | Description                                                        |
| --------------- | ---------------- | ------------------------------------------------------------------ |
| `VITE_API_URL`  | _(same origin)_  | Backend base URL. Set when the API is hosted elsewhere (prod)       |
| `VITE_API_PROXY`| `http://localhost:5000` | Backend target for the Vite **dev** proxy                     |

---

## REST API

All responses use the envelope `{ success, data, error? }`.

| Method | Endpoint               | Body / Query                                   | Purpose                          |
| ------ | ---------------------- | ---------------------------------------------- | -------------------------------- |
| `GET`  | `/api/health`          | –                                              | Health check                     |
| `POST` | `/api/auth/login`      | `{ "username": "ada" }`                        | Dummy login (returns token)      |
| `GET`  | `/api/messages`        | `?limit=50&before=<ISO timestamp>`             | Fetch chat history (newest page) |
| `POST` | `/api/messages`        | `{ "author", "text", "clientId?" }`            | Send a message (broadcasts it)   |
| `POST` | `/api/messages/read`   | `{ "ids": ["..."], "reader": "ada" }`          | Mark messages as read            |
| `GET`  | `/api/messages/stats`  | –                                              | Stored message count             |
| `GET`  | `/api/users/online`    | –                                              | Currently connected usernames    |

Example:

```bash
curl -X POST http://localhost:5000/api/messages \
  -H "Content-Type: application/json" \
  -d '{"author":"ada","text":"Hello world"}'
```

---

## Socket.io events

Connect with `io(API_URL)`, then emit `join` — messages are only accepted after joining.

**Client → Server** (all accept an ack callback)

| Event          | Payload                        | Ack                                   |
| -------------- | ------------------------------ | ------------------------------------- |
| `join`         | `{ username }`                 | `{ ok, username, onlineUsers }`       |
| `message:send` | `{ text, clientId }`           | `{ ok, message }` / `{ ok:false, error }` |
| `typing`       | `{ isTyping: boolean }`        | –                                     |
| `message:read` | `{ ids: [...] }`               | `{ ok, updatedIds }`                  |

**Server → Client**

| Event            | Payload                                        |
| ---------------- | ---------------------------------------------- |
| `message:new`    | full message object                            |
| `message:status` | `{ id, status, updatedAt }`                    |
| `presence:list`  | `{ onlineUsers }` (sent on connect)            |
| `presence:update`| `{ username, status, onlineUsers }`            |
| `typing:update`  | `{ users: [...] }` (auto-cleared after 3 s)    |
| `chat:error`     | `{ message, code }` (when no ack callback)     |

Message shape:

```json
{
  "id": "e6c1…",
  "author": "ada",
  "text": "Hello world",
  "status": "delivered",
  "clientId": "4b0f…",
  "createdAt": "2026-09-27T18:56:43.671Z"
}
```

---

## AI agents (Groq)

Three personas live in the room as **always-online users** (no sockets, no tabs):

| Agent   | Role                | Personality                                            |
| ------- | ------------------- | ------------------------------------------------------ |
| `Nova`  | Coding assistant    | debugging, code review, technical questions            |
| `Atlas` | Ideas & planning    | feature ideas, brainstorming, next steps               |
| `Sage`  | General knowledge   | concise factual answers (also the fallback responder)  |

**How to talk to them**

- `@Nova how do I debounce a function?` → Nova answers (case-insensitive).
- Two mentions in one message are supported, e.g. `@Nova say hi @Sage say hi`.
- Tap the **@** button in the *AI Agents* sidebar panel to insert a mention.
- **No mention + you are the only human online** → `Sage` answers, so solo usage feels
  conversational. With other humans present, agents stay quiet unless mentioned.
- While an agent generates, its name shows in the typing indicator; replies appear with
  an **AI** badge and are stored in history like any other message.

**Rules & safeguards**

- Agent names are reserved: login, socket `join` and `POST /api/messages` reject them,
  so nobody can impersonate an agent.
- Replies are serialised per agent (mentions queue in order) and each reply carries a
  deterministic `clientId` (`agent:<Name>:<triggerId>`).
- The triggering message is marked `read` by the agent that answered it.
- Failures are graceful: missing key / auth error / Groq outage produce a short notice
  from the agent, throttled to one notice per 45 s instead of flooding the room.
- Reasoning models can return an empty answer; the client retries once with a nudge
  (`max_tokens: 2048`) before giving up.

**Endpoints**

| Method | Endpoint       | Purpose                                |
| ------ | -------------- | -------------------------------------- |
| `GET`  | `/api/agents`  | personas (name, role, description)     |

**Adding a persona:** append an entry to `backend/src/agents/registry.js`
(`name`, `role`, `description`, `temperature`, `system`) — presence, reserved-name
protection and the sidebar pick it up automatically.

---

## Design decisions

1. **One service layer for REST and sockets.** `POST /api/messages` and the
   `message:send` socket event both call `messageService.sendMessage()`, so validation,
   persistence and broadcasting stay consistent no matter which door is used.
2. **Repository pattern for storage.** The service only sees
   `create/findAll/findByIds/markStatus/count`, so swapping PostgreSQL for SQLite
   (`DB_DRIVER=sqlite`), a JSON file (`file`) or MongoDB requires a new repository and
   nothing else. **PostgreSQL is the primary driver**: a `pg` Pool with auto-DDL
   (`CREATE TABLE IF NOT EXISTS messages …`), parameterized queries and a single
   conditional `UPDATE` that enforces the status guard in SQL.
3. **Optimistic UI with `clientId`.** The client renders the message immediately as
   `sending`, then the server broadcast/ack (matched by `clientId`) replaces it with the
   canonical record. Failed sends keep the bubble with a *Retry* action.
4. **Statuses are monotonic.** `sent → delivered → read` can only move forward in the
   database (`STATUS_RANK`), so a late `delivered` can never overwrite a `read`.
   `delivered` is applied when at least one other user is online; `read` is emitted by the
   receiving client when its tab is visible.
5. **Presence via socket registry.** Online users are derived from connected socket IDs
   (a user with two tabs stays "online" until the last tab closes) — no polling.
6. **Typing state lives on the server** with a 3-second auto-expiry, so a dropped client
   can never leave someone "typing" forever. Clients throttle emits to 1 per 1.5 s.
7. **Composition root (`server.js`).** Dependencies are wired in one place and exported,
   which keeps the integration tests able to boot a full server on an ephemeral port.
8. **Errors are structured.** REST returns `{ success:false, error:{ message, code } }`
   with proper status codes; socket handlers reply through acks (`{ ok:false, error }`)
   or `chat:error` when no callback is present. Unknown 5xx errors are logged, known
   validation errors are not.
9. **Vite dev proxy** for `/api` + `/socket.io` avoids CORS headaches in development;
   production CORS is controlled by `CORS_ORIGINS`.
10. **Agents are messages, not a side-channel.** The agent runtime subscribes to an
    `onMessage` hook fired by the service (so REST- and socket-sent messages behave
    identically), then persists its answer through `messageService.sendMessage()` —
    history, presence, read receipts and the UI all work with zero special cases.
    Groq is behind a small client with timeout/abort + retry, injectable for tests.
11. **Agents hold no sockets.** They are "virtual" presence entries merged into the
    online list, which keeps connection bookkeeping honest (a tab-less bot is not a
    connection) and lets presence/typing code stay unchanged.

---

## Assumptions

- **Single shared room** ("general") — all logged-in users talk in one global chat.
  Multi-room would only need a `room` field on `join` and `io.to(room).emit(...)`.
- **AI agents** answer `@mentions` (max 2 per message) and act as a fallback only when
  no other human is online; they have no memory between conversations beyond the last
  16 messages of the shared room, and each persona's system prompt stays server-side.
- **Dummy authentication**: usernames are not unique or password-protected and the token
  is a placeholder — anyone can impersonate anyone. Not for production.
- Message history is returned newest-first in one page (`limit`, default 50, max 200);
  infinite scroll/pagination UI is not implemented.
- Message text is capped at 2000 characters; usernames at 24 characters.
- Deleting or editing messages and user avatars are out of scope.
- The frontend is **React for the web** (chosen over React Native so the app runs and can
  be verified in any browser); the `useChat` hook and `api/socket` modules are UI-agnostic
  and portable to React Native.
- Credentials live in `backend/.env` (gitignored) — never commit them.
- Deployment was not performed; see below for how to deploy.

---

## Deployment notes (optional)

**Backend → Render / Railway**

1. Create a Node service rooted at `backend/`, build command `npm install`,
   start command `npm start`.
2. Set `CORS_ORIGINS` to your frontend URL, e.g. `https://mychat.vercel.app`
   (`PORT` is injected by the platform).
3. Create a managed PostgreSQL database (Render Postgres / Neon / Supabase) and set
   `DB_DRIVER=postgres` plus `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`. The schema is
   created automatically on boot — no migrations.

**Frontend → Vercel / Netlify**

1. Build command `npm run build`, output directory `dist`.
2. Set `VITE_API_URL=https://your-backend.onrender.com` so the client and Socket.io
   connect to the deployed API.

---

## Verification performed

| Check                                     | Result |
| ----------------------------------------- | ------ |
| Backend integration tests (`npm test`)    | 12/12  |
| API + Socket.io E2E (through Vite proxy)  | 14/14  |
| Live Groq agent E2E (mentions, typing)    | 10/10  |
| Headless-browser UI E2E (agents + chat)   | 16/16  |
| Messages stored in PostgreSQL             | ✅     |
| History survives a backend restart        | ✅     |
| History survives a page refresh           | ✅     |
| Production build (`vite build`)           | ✅     |
