# Full-Stack Real-Time Chat Application

A real-time chat app with a **React (Vite)** frontend and a **Node.js + Express + Socket.io** backend.
Messages are persisted in **Redis** by default (PostgreSQL, SQLite, and JSON file options are also available), delivered instantly over WebSockets, and restored after a refresh.

```
frontend/   React (Vite) chat client  -> http://localhost:5173
backend/    Express REST + Socket.io  -> http://localhost:5000
database/   Redis message and user records
```

---

## Features

**Core**
- Send messages and receive them instantly via Socket.io (no refresh/polling).
- REST APIs to send messages and fetch chat history.
- Previous messages restored after refreshing the app.
- Timestamps on every message (plus day separators: Today / Yesterday / date).
- Graceful connect / reconnect / disconnect handling with a visible connection state.
- Validation and error handling on both REST and Socket layers (structured error payloads).

**Bonus**
- **AI agents powered by Groq** — Nova, Atlas and Sage answer explicit `@mentions` in
  the global room and have separate one-to-one chats.
- Password-based login and registration with signed JWT authentication.
- Persistent light and dark themes, switchable from the chat header.
- New users' global history starts when their account is created; older global messages
  remain available to users who were already registered.
- Typing indicator (throttled client-side, auto-expiring server-side).
- Online / offline user presence list.
- Message status: `sent` → `delivered` → `read` with ✓ / ✓✓ ticks.
- **Redis** persistence by default (`DB_DRIVER=redis`), with PostgreSQL, SQLite, and JSON file options.
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
│   │   ├── repositories/              # storage abstraction (redis | postgres | sqlite | file)
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

Install dependencies and create the backend environment file.

**Windows PowerShell**

```bash
Set-Location backend
npm install
Copy-Item .env.example .env
npm start
```

**macOS / Linux**

```sh
cd backend
npm install
cp .env.example .env
npm start
```

Both commands start the API and Socket.io server on `http://localhost:5000` by default.
For automatic restarts during development, use `npm run dev` instead of `npm start`.

**Redis setup.** Redis is the default database. Start a local Redis server or provision
a Redis service, then set `REDIS_URL` in `backend/.env` (the local default is
`redis://localhost:6379`). Use a managed Redis service with persistence enabled when
chat history must survive server or host failures. To migrate the existing SQLite
messages and users into Redis, configure the Redis URL and run once from `backend/`:

```sh
npm run migrate:redis
```

PostgreSQL remains an optional backend:

```env
DB_DRIVER=postgres
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=****
PGDATABASE=Chat-Application
```

The PostgreSQL `messages` and `users` tables and indexes are created automatically on
first start. Redis records use the configured key prefix. The seeded demo account is
`pilot_user` / `1234`; change the seed credentials for deployments. To use local storage,
set `DB_DRIVER=sqlite` (file at `./data/chat.db`) or `DB_DRIVER=file` (JSON).

API + Socket.io now listen on `http://localhost:5000`.
Check: `curl http://localhost:5000/api/health`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Run the frontend in a separate terminal after starting the backend. Open
`http://localhost:5173`. Vite proxies `/api` and `/socket.io` to the backend; use
`VITE_API_PROXY` if your backend runs on a different URL.

### 3. Everything at once (from the repo root)

Run `npm run install:all` and then `npm run dev` from the repository root to install
dependencies and start both applications together.

### 4. Tests

```bash
npm --prefix backend test   # 12 integration tests (REST, Socket.io, Postgres, agents)
npm test                    # backend tests + frontend production build
```

---

## Environment variables

### Backend (`backend/.env`)

Copying `.env.example` provides local defaults. For the default Redis setup, run a
Redis service and set `REDIS_URL` if it is not `redis://localhost:6379`. AI replies
also require a private `GROQ_API_KEY`; without it, agents display a configuration hint.
Never commit `backend/.env`. For deployment, set a unique `JWT_SECRET` of at least
32 characters and change the demo seed credentials.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` / `HOST` | `5000` / `0.0.0.0` | HTTP and Socket.io listener |
| `CORS_ORIGINS` | `*` | Comma-separated allowed browser origins |
| `DB_DRIVER` | `redis` | `redis`, `postgres`, `sqlite`, or `file` |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL; use `rediss://` for TLS |
| `REDIS_KEY_PREFIX` | `chatapp` | Prefix for Redis chat and user keys |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PG_POOL_MAX` | Local PostgreSQL defaults | Connection settings when using `DB_DRIVER=postgres` |
| `DATABASE_PATH` | `./data/chat.db` | SQLite file when using `DB_DRIVER=sqlite` |
| `JWT_SECRET` | Local development key | JWT signing secret; set a unique 32+ character value in deployment |
| `SEED_USERNAME` / `SEED_PASSWORD` | `pilot_user` / `1234` | Demo account created if it does not exist |
| `GROQ_API_KEY` | _(empty)_ | Optional Groq key required for AI agent replies |
| `GROQ_MODEL` / `GROQ_TEMPERATURE` | `openai/gpt-oss-120b` / `0.7` | AI model and response sampling |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, or `silent` |

### Frontend (`frontend/.env`, optional)

| Variable        | Default          | Description                                                        |
| --------------- | ---------------- | ------------------------------------------------------------------ |
| `VITE_API_URL`  | _(same origin)_  | Backend base URL. Set when the API is hosted elsewhere (prod)       |
| `VITE_API_PROXY` | `http://localhost:5000` | Backend target for the Vite development proxy |

---

## REST API

All responses use the envelope `{ success, data, error? }`.

| Method | Endpoint               | Body / Query                                   | Purpose                          |
| ------ | ---------------------- | ---------------------------------------------- | -------------------------------- |
| `GET`  | `/api/health`          | –                                              | Health check                     |
| `POST` | `/api/auth/register`   | `{ "username": "ada", "password": "..." }`     | Create account and return JWT    |
| `POST` | `/api/auth/login`      | `{ "username": "ada", "password": "..." }`     | Log in and return JWT            |
| `GET`  | `/api/messages`        | `?limit=50&before=<ISO timestamp>`             | Fetch global chat history (newest page) |
| `POST` | `/api/messages`        | `{ "text", "clientId?" }`                      | Send as the authenticated user  |
| `POST` | `/api/messages/read`   | `{ "ids": ["..."], "reader": "ada" }`          | Mark messages as read            |
| `GET`  | `/api/messages/stats`  | –                                              | Stored message count             |
| `GET`  | `/api/users/online`    | –                                              | Currently connected usernames    |

Example:

```bash
curl -X POST http://localhost:5000/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"text":"Hello world"}'
```

---

## Socket.io events

Connect with `io(API_URL)`, then emit `join` — messages are only accepted after joining.

**Client → Server** (all accept an ack callback)

| Event          | Payload                        | Ack                                   |
| -------------- | ------------------------------ | ------------------------------------- |
| `join`         | `{ username }`                 | `{ ok, username, onlineUsers }`       |
| `conversation:join` | `{ agent: "Nova" }` (or `{}` for global) | `{ ok, conversationId, messages }` |
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
| `typing:update`  | `{ users: [...], conversationId }` (auto-cleared after 3 s) |
| `chat:error`     | `{ message, code }` (when no ack callback)     |

Clients join an agent conversation using `conversation:join`; its history is returned
only to that socket. Socket.io clients must pass their JWT in the connection `auth.token`;
the `join` event cannot impersonate a different username. `message:send` uses the
socket's active conversation.

Message shape:

```json
{
  "id": "e6c1…",
  "author": "ada",
  "text": "Hello world",
  "conversationId": "global",
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
| `Sage`  | General knowledge   | concise factual answers                                 |

**How to talk to them**

- `@Nova how do I debounce a function?` → Nova answers (case-insensitive).
- Two mentions in one message are supported, e.g. `@Nova say hi @Sage say hi`.
- After an agent is mentioned, that agent continues answering follow-up messages in the
  global chat; mentioning a different agent switches the active responder.
- Type `@` in the global composer to search online people and AI agents, then select a
  suggestion or use the arrow keys and Enter.
- Tap the **@** button next to an agent in the sidebar to mention it in the global chat.
- In the global chat, agents stay quiet until one is mentioned, then the active agent
  answers each human follow-up until another agent is mentioned.
- Select an agent under **Chats** to open a private one-to-one conversation. Its messages
  and history are scoped to that username and agent, and the selected agent answers each
  message in its chat.
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
   `create/findAll/findByIds/markStatus/count`, so storage is interchangeable. Redis
   is the default; PostgreSQL, SQLite (`DB_DRIVER=sqlite`), and JSON file (`file`)
   implementations use the same contract.
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

- **Global room plus per-user agent chats.** Global messages are shared; each agent chat
  has a separate history and private socket room. In global chat, agents stay quiet until
  one is mentioned; that agent handles follow-ups until another is mentioned (up to two
  distinct agents can be invoked in one message). In a one-to-one agent chat, only its
  selected agent responds. Each persona's system prompt stays server-side.
- **JWT authentication**: registered users have unique case-insensitive usernames and
  salted `scrypt` password hashes. Registration returns a signed JWT; this is real
  password-based authentication, not dummy authentication. The local demo seed uses
  `pilot_user` / `1234`; change those credentials and `JWT_SECRET` for deployment.
- **New-account history boundary.** A user's global history begins at account creation;
  already registered users keep access to their existing global history.
- Message history is returned newest-first in one page (`limit`, default 50, max 200);
  infinite scroll/pagination UI is not implemented.
- Message text is capped at 2000 characters; usernames at 24 characters.
- Deleting or editing messages and user avatars are out of scope.
- The frontend is **React for the web** (chosen over React Native so the app runs and can
  be verified in any browser); the `useChat` hook and `api/socket` modules are UI-agnostic
  and portable to React Native.
- Credentials live in `backend/.env` (gitignored) — never commit them.

---

## Deploying the backend to Render

The repository includes a Render Blueprint in `render.yaml`. It creates a free API
service and a private free Redis-compatible Key Value service in Singapore. In the
[Render Dashboard](https://dashboard.render.com/blueprints), create a new Blueprint
from this GitHub repository and choose the `akshajanil-agent-chat-routing` branch. Enter
a strong, unique `SEED_PASSWORD` when Render prompts for it; Render generates the JWT
secret and wires the API to Redis automatically. The deployed API is available at
`https://ai-powered-chat-app-api.onrender.com`; verify it at `/api/health`. Opening the
API's root URL returns a small JSON status document; it is not the chat web interface.

The free API can sleep when idle, and free Redis is in-memory only: its data can be lost
when Redis restarts. Upgrade the Key Value service to a paid plan with persistence before
using the deployment for data that must be retained. AI agent responses remain disabled
until a newly rotated `GROQ_API_KEY` is added privately in the Render service settings.

**Frontend → Vercel / Netlify**

1. Build command `npm run build`, output directory `dist`.
2. Set `VITE_API_URL=https://your-backend.onrender.com` so the client and Socket.io
   connect to the deployed API.
3. Deploy the frontend separately to get a browser-accessible chat application URL.

---

## Verification performed

| Check                                     | Result |
| ----------------------------------------- | ------ |
| Backend integration tests (`npm --prefix backend test`) | See current test output |
| Redis repository contract (when available) | ✅     |
| History survives a backend restart        | ✅     |
| History survives a page refresh           | ✅     |
| Production build (`vite build`)           | ✅     |
