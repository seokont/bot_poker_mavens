# Poker Mavens Bot Management System

A comprehensive platform for managing, deploying, and monitoring automated poker bots that interact with Poker Mavens servers. The system provides a REST API backend, Playwright-based browser automation workers, a decision engine, and an admin web UI.

## Usage Restrictions

This system is designed for **authorized testing and research purposes only**. By using this software, you agree to:

- Only deploy bots on poker tables where automated play is explicitly permitted by the platform's terms of service
- Not use the system for fraudulent, deceptive, or illegal purposes
- Comply with all applicable laws and regulations regarding automated gameplay
- Accept full responsibility for any actions performed by bots under your control
- Not bypass any bot-detection mechanisms or anti-automation measures

The authors assume no liability for misuse of this system. **Use at your own risk.**

## Requirements

| Dependency | Version                      |
| ---------- | ---------------------------- |
| Node.js    | >= 20.0.0                    |
| pnpm       | >= 8.15.0                    |
| Docker     | 24+ (with Docker Compose v2) |
| MySQL      | 8.0+                         |
| Redis      | 7+ (Alpine)                  |
| Playwright | 1.40+ (Chromium)             |

## Quick Start with Docker Compose

The fastest way to get everything running:

```bash
# 1. Clone and enter the project
git clone <repo-url> poker-bot-platform
cd poker-bot-platform

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your actual Poker Mavens credentials and secrets

# 3. Start all services
docker compose up -d

# 4. Run database migrations
docker compose exec backend npx prisma migrate deploy

# 5. Seed default data
docker compose exec backend npx prisma db seed

# 6. Verify the system is running
curl http://localhost:3000/health
# Expected: { "status": "ok", "timestamp": "..." }
```

Services will be available at:

| Service      | URL                            |
| ------------ | ------------------------------ |
| Admin Web UI | http://localhost:80            |
| Backend API  | http://localhost:3000          |
| Swagger Docs | http://localhost:3000/api/docs |
| MySQL        | localhost:3306                 |
| Redis        | localhost:6379                 |

## Configuration

Copy `.env.example` to `.env` and configure the following:

```env
# ── Application ──────────────────────────────────────────────
NODE_ENV=development                          # runtime environment
BACKEND_PORT=3000                             # API server port
ADMIN_WEB_PORT=5173                           # admin UI dev port

# ── Database ─────────────────────────────────────────────────
DATABASE_URL=mysql://root:password@mysql:3306/poker_bots

# ── Redis (Queue & Cache) ────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── Authentication (JWT) ─────────────────────────────────────
JWT_ACCESS_SECRET=change-me-access-secret-min-32-chars
JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# ── Bot Credential Encryption ────────────────────────────────
BOT_CREDENTIALS_ENCRYPTION_KEY=change-me-32-char-encryption-key!

# ── Poker Mavens Connection ──────────────────────────────────
POKER_MAVENS_URL=https://poker.example.com
POKER_MAVENS_ADMIN_API_URL=https://poker.example.com/api
POKER_MAVENS_ADMIN_API_PASSWORD=

# ── Playwright Browser Automation ────────────────────────────
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=15000

# ── Bot Runtime Configuration ────────────────────────────────
BOT_ACTION_TIMEOUT_MS=5000
BOT_HEARTBEAT_INTERVAL_MS=10000
BOT_RECONNECT_DELAY_MS=5000
BOT_MAX_RECONNECT_ATTEMPTS=10

# ── Decision Engine ──────────────────────────────────────────
DECISION_ENGINE_MODE=internal                 # internal | external
DECISION_ENGINE_URL=http://decision-engine:8000

# ── Worker Limits ────────────────────────────────────────────
MAX_BOTS_PER_WORKER=5

# ── Logging ──────────────────────────────────────────────────
LOG_LEVEL=info

# ── Internal Security ────────────────────────────────────────
INTERNAL_API_KEY=change-me-internal-api-key

# ── Seed Admin ───────────────────────────────────────────────
ADMIN_SEED_EMAIL=admin@poker-bots.local
ADMIN_SEED_PASSWORD=Admin123!
```

**Important**: Change all secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `BOT_CREDENTIALS_ENCRYPTION_KEY`, `INTERNAL_API_KEY`) before deploying to production.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Nginx Reverse Proxy                      │
│           localhost:80 (UI) /api/* (Backend Proxy)           │
└──────┬──────────────────────┬──────────────────────┬─────────┘
       │                      │                      │
┌──────▼──────┐    ┌─────────▼──────────┐  ┌─────────▼──────────┐
│  Admin Web  │    │  Backend (NestJS)   │  │  Bot Worker(s)     │
│  (Vue 3 +   │    │  Port 3000          │  │  (Playwright)      │
│   Vuetify)  │    │  REST API + WS      │  │  Port 3001         │
└─────────────┘    └────┬───┬───┬────────┘  └─────────┬──────────┘
                        │   │   │                      │
               ┌────────┘   │   └────────┐             │
               ▼            ▼            ▼             │
         ┌──────────┐ ┌──────────┐ ┌──────────┐       │
         │  MySQL 8  │ │  Redis   │ │  Redis   │       │
         │ (Prisma)  │ │ (Cache)  │ │ (BullMQ  │       │
         └──────────┘ └──────────┘ │  Queue)  │       │
                                   └──────────┘       │
                        ┌──────────────────────────────┘
                        │
               ┌────────▼─────────┐
               │  Poker Mavens     │
               │  Server (Browser  │
               │   Automation)     │
               └──────────────────┘
```

### Component Roles

- **Admin Web** (Vue 3 + Vuetify): Dashboard for managing bots, tables, strategies, and viewing statistics
- **Backend** (NestJS): REST API, authentication, database access via Prisma, BullMQ job queues, WebSocket events
- **Bot Worker** (Playwright): Headless Chromium browser automation. Each worker handles up to `MAX_BOTS_PER_WORKER` bots
- **MySQL 8**: Persistent storage for bots, sessions, hands, strategies, audit logs
- **Redis**: BullMQ job queues (bot lifecycle, table actions, statistics) and cache
- **Nginx**: Reverse proxy, rate limiting, static file serving for admin UI

## Running Locally

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Infrastructure (Docker)

```bash
docker compose up -d mysql redis
```

### 3. Run Database Migrations

```bash
pnpm prisma:migrate
```

### 4. Seed Default Data

```bash
pnpm prisma:seed
```

### 5. Start Development Servers

```bash
# Start all services in parallel (backend, worker, admin-web)
pnpm dev

# Or start individual services:
pnpm dev:backend    # Backend API only
pnpm dev:worker     # Bot worker only
pnpm dev:web        # Admin UI only
```

## Prisma Migrations

Migrations are managed via Prisma in `apps/backend/prisma/`:

```bash
# Create a new migration
cd apps/backend
npx prisma migrate dev --name <description>

# Apply migrations in production
npx prisma migrate deploy

# Reset database (drops all data)
npx prisma migrate reset

# Generate Prisma client after schema changes
pnpm prisma:generate
```

## Seed Data

Run `pnpm prisma:seed` to populate the database with:

- **1 Admin User**: `admin@poker-bots.local` / `Admin123!` (role: SUPER_ADMIN)
- **2 Strategy Profiles**: EASY (conservative, no bluffing), MEDIUM (position-aware, limited bluffing)
- **3 Bot Templates**: Bot Alpha, Bot Beta, Bot Gamma (OBSERVER mode, EASY strategy)
- **2 Poker Tables**: Test Table 1 (1/2 blinds), Test Table 2 (5/10 blinds)

## Running Tests

```bash
# Unit tests across all packages
pnpm test

# Integration tests
pnpm test:integration

# End-to-end tests (requires mock-poker-ui running)
pnpm test:e2e

# Start the mock Poker Mavens UI for E2E tests
cd mock-poker-ui
node server.js
# Runs on http://localhost:3080
```

## Adding a New Bot

### Via Admin API

```bash
curl -X POST http://localhost:3000/api/v1/bots \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bot Name",
    "login": "bot_login",
    "password": "bot_password",
    "strategyProfileId": "<strategy-id>",
    "defaultBuyIn": 1000,
    "maxTables": 1
  }'
```

### Operating the Bot

```bash
# Start the bot
curl -X POST http://localhost:3000/api/v1/bots/<bot-id>/start \
  -H "Authorization: Bearer <admin-jwt-token>"

# Join a table
curl -X POST http://localhost:3000/api/v1/bots/<bot-id>/join-table \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"tableId": "<table-id>", "buyIn": 1000}'
```

## Configuring Selectors

The Playwright adapter uses CSS selectors defined in `packages/mavens-adapter/src/selectors/default-selectors.ts`. These selectors target Poker Mavens UI elements and can be customized for different Poker Mavens versions or themes.

Key selector categories:

```typescript
interface PokerMavensSelectors {
  login: {
    // Login page elements
    usernameInput;
    passwordInput;
    submitButton;
    loginError;
  };
  lobby: {
    // Lobby table listing
    tableRows;
    tableName;
    openTableButton;
  };
  table: {
    // Active table elements
    seats;
    emptySeat;
    heroSeat;
    pot;
    boardCards;
    heroCards;
    heroStack;
    dealerButton;
    activePlayer;
    playerNames;
    playerStacks;
    actionHistory;
  };
  actions: {
    // Action buttons
    foldButton;
    checkButton;
    callButton;
    betButton;
    raiseButton;
    allInButton;
    amountInput;
    actionTimer;
  };
  buyIn: {
    // Buy-in dialog
    amountInput;
    confirmButton;
    cancelButton;
  };
}
```

When selectors don't match your Poker Mavens theme, create a new selector configuration implementing the `PokerMavensSelectors` interface and update the adapter to use it.

## Operation Modes

Each bot can operate in one of three modes:

### OBSERVER

- Bot logs into Poker Mavens and navigates the lobby
- Reads game state and observes hands without taking actions
- Useful for: data collection, hand history recording, testing connectivity
- Bot never places bets or makes decisions

### ASSISTED

- Bot reads game state and computes decisions via the decision engine
- Decisions are recorded in the database but NOT automatically executed
- An admin must manually approve or override each decision through the API or admin UI
- Useful for: validating decision engine logic, supervised testing, training

### AUTONOMOUS

- Bot reads game state, computes decisions, and executes them automatically
- All decisions are logged with reasoning for audit purposes
- Limits (daily loss, session loss, hands per session) are enforced
- Automatic reconnection on connection loss (up to `BOT_MAX_RECONNECT_ATTEMPTS`)
- Useful for: 24/7 automated play, stress testing, production deployment

## Common Errors and Troubleshooting

| Error                                       | Likely Cause                                | Solution                                                               |
| ------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `ECONNREFUSED mysql:3306`                   | MySQL not started                           | `docker compose up -d mysql`                                           |
| `Invalid credentials`                       | Wrong JWT secrets                           | Check `JWT_ACCESS_SECRET` in `.env`                                    |
| `Bot "x" cannot be started from status "y"` | Bot already running or in error state       | Stop the bot first or check its status                                 |
| `Pre-flight checks failed: Not hero turn`   | Stale turn ID or wrong timing               | The bot will re-check on next polling cycle                            |
| `Duplicate action detected`                 | Action already processed for this hand/turn | The Redis lock prevents double execution                               |
| `Browser disconnected`                      | Playwright browser crash                    | Worker will attempt reconnect up to `BOT_MAX_RECONNECT_ATTEMPTS` times |
| `No available seat`                         | Table is full                               | Select a different table or wait for a seat to open                    |
| `Buy-in amount outside allowed range`       | Amount outside configured limits            | Check bot's `minBuyIn` / `maxBuyIn` and table limits                   |
| `Internal API key mismatch`                 | Worker cannot authenticate with backend     | Verify `INTERNAL_API_KEY` matches between `.env` and worker config     |
| `Resource limit reached`                    | Worker at max bot capacity                  | Increase `MAX_BOTS_PER_WORKER` or add another worker instance          |

For persistent issues:

```bash
# Check worker logs
docker compose logs bot-worker

# Check backend logs
docker compose logs backend

# Verify Redis connectivity
docker compose exec redis redis-cli ping

# Verify database connectivity
docker compose exec mysql mysqladmin ping -h localhost
```

В отдельных терминалах (каждый процесс — долгоживущий, foreground):

1. Backend (порт 3000):

cd apps/backend
npx ts-node -r tsconfig-paths/register src/main.ts 2. Bot-worker (порт 3001):

cd apps/bot-worker
npx ts-node -r tsconfig-paths/register src/main.ts 3. Admin-web (если нужен интерфейс, порт 5173):

cd apps/admin-web
npx vite
#   b o t _ p o k e r _ m a v e n s  
 