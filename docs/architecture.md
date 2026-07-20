# Technical Architecture

## Monorepo Structure

```
poker-bot-platform/
├── apps/
│   ├── backend/              # NestJS REST API & WebSocket server
│   │   ├── prisma/           # Database schema, migrations, seed
│   │   └── src/
│   │       ├── main.ts       # Application entry point
│   │       ├── app.module.ts # Root module (imports all feature modules)
│   │       ├── config/       # Named configuration from env vars
│   │       ├── common/
│   │       │   ├── decorators/       # @CurrentUser, @Roles
│   │       │   ├── guards/           # RolesGuard, InternalApiGuard
│   │       │   └── services/         # EncryptionService
│   │       └── modules/
│   │           ├── auth/             # JWT authentication, login/refresh/logout
│   │           ├── bots/             # Bot CRUD
│   │           ├── bot-commands/     # Bot lifecycle commands (start, stop, join-table, etc.)
│   │           ├── bot-sessions/     # Bot session management
│   │           ├── tables/           # Poker table sync & configuration
│   │           ├── strategies/       # Strategy profile CRUD & cloning
│   │           ├── hands/            # Hand recording & retrieval
│   │           ├── actions/          # Hand action recording & queries
│   │           ├── decisions/        # Bot decision recording
│   │           ├── statistics/       # Aggregated statistics & dashboards
│   │           ├── limits/           # Bot loss/session limits
│   │           ├── audit/            # Admin audit logging
│   │           ├── internal/         # Internal worker API (heartbeat, status, game state)
│   │           ├── health/           # Health check endpoints
│   │           ├── events/           # WebSocket gateway (Socket.IO)
│   │           ├── queue/            # BullMQ job queue management
│   │           ├── prisma/           # Prisma database client
│   │           └── redis/            # Redis client (extends ioredis)
│   │
│   ├── bot-worker/           # Playwright-based bot automation worker
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── worker/               # WorkerService - orchestrates all bot operations
│   │       ├── state-machine/        # BotStateMachine - 20-state FSM
│   │       ├── playwright/           # PlaywrightManager - browser lifecycle
│   │       ├── action-executor/      # ActionExecutorService - preflight + execute + verify
│   │       ├── game-state-reader/    # GameStateReader - parse Poker Mavens UI
│   │       ├── decision-engine/      # DecisionEngineService - internal/external mode
│   │       ├── heartbeat/            # HeartbeatService - periodic status reports
│   │       ├── reconnection/         # ReconnectionService - exponential backoff
│   │       ├── resource-manager/     # ResourceManager - CPU/memory/bot limits
│   │       └── error-handler/        # ErrorHandler - screenshots, HTML snapshots, logging
│   │
│   └── admin-web/            # Vue 3 + Vuetify admin dashboard
│       └── src/              # (Vite + Vue Router + Pinia + Chart.js)
│
├── packages/
│   ├── shared-types/         # TypeScript enums, interfaces, DTOs shared across all apps
│   ├── poker-engine/         # Core poker decision engine
│   │   └── src/
│   │       ├── decision/             # DecisionEngine, EasyStrategy, MediumStrategy
│   │       ├── hand-strength/        # HandEvaluator - 7-card evaluation
│   │       ├── pot-odds/             # PotOddsCalculator
│   │       ├── spr/                  # SprCalculator - stack-to-pot ratio
│   │       ├── bet-sizing/           # BetSizer - street-based sizing
│   │       └── preflop/             # PreflopRanges - position-based ranges
│   ├── mavens-adapter/       # Poker Mavens browser adapter interface & selectors
│   └── config/               # Shared configuration utilities
│
├── mock-poker-ui/            # Express-based mock Poker Mavens UI for testing
├── nginx/                    # Nginx reverse proxy configuration
├── docker-compose.yml        # Multi-service Docker Compose
├── Dockerfile.backend
├── Dockerfile.worker         # Based on mcr.microsoft.com/playwright image
├── Dockerfile.web
└── pnpm-workspace.yaml
```

## Backend Modules

### Module Dependency Graph

```
AppModule
├── PrismaModule           (database access - global)
├── RedisModule            (cache & queue backend - global)
├── CommonModule           (EncryptionService - global)
├── AuthModule             (JWT strategy, login/refresh)
├── HealthModule           (/health, /health/ready, /health/live)
├── EventsModule           (Socket.IO WebSocket gateway)
│
├── BotsModule             (CRUD + listing)
├── BotCommandsModule      (start/stop/join-table/sit-out/etc.)
├── BotSessionsModule      (session lifecycle, heartbeat tracking)
├── TablesModule           (sync + CRUD for poker tables)
├── StrategiesModule       (CRUD + clone for strategy profiles)
├── HandsModule            (hand recording + queries)
├── ActionsModule          (action recording + queries)
├── StatisticsModule       (dashboard + per-bot + per-table stats)
├── LimitsModule           (bot loss/duration/hands limits)
├── AuditModule            (admin audit log queries)
├── InternalModule         (worker-facing API)
└── QueueModule            (BullMQ queue abstraction)
```

### API Versioning

All public API routes are prefixed with `/api/v1` (NestJS URI versioning). Internal worker routes are at `/internal/` with no version prefix, protected by `InternalApiGuard`.

## Bot Worker Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Bot Worker Process                       │
│                                                              │
│  ┌─────────────┐     ┌──────────────────┐                    │
│  │  Redis BLPOP │────▶│  WorkerService    │                    │
│  │  (Job Queue) │     │  (Job Processor)  │                    │
│  └─────────────┘     └───────┬──────────┘                    │
│                              │                                │
│           ┌──────────────────┼──────────────────┐             │
│           ▼                  ▼                  ▼             │
│  ┌────────────────┐ ┌──────────────┐ ┌──────────────────┐    │
│  │ BotStateMachine │ │ Playwright    │ │  DecisionEngine  │    │
│  │ (20-state FSM)  │ │ Manager       │ │  (internal/ext)  │    │
│  └────────────────┘ └──────┬───────┘ └──────────────────┘    │
│                            │                                  │
│           ┌────────────────┼──────────────────┐               │
│           ▼                ▼                  ▼               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐      │
│  │ GameState     │ │ Action       │ │  Heartbeat       │      │
│  │ Reader        │ │ Executor     │ │  Service         │      │
│  │ (Parse UI)    │ │(Preflight+)  │ │  (Periodic POST) │      │
│  └──────────────┘ └──────────────┘ └──────────────────┘      │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐      │
│  │ Resource      │ │ Reconnection  │ │  Error Handler   │      │
│  │ Manager       │ │ Service       │ │  (Screenshot +   │      │
│  │ (CPU/Mem/Bots)│ │ (Exponential  │ │   HTML Snapshot) │      │
│  └──────────────┘ │  Backoff)     │ └──────────────────┘      │
│                   └──────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### Job Processing Flow

1. **WorkerService** polls Redis via `BRPOP` on the `bot-commands` queue
2. Jobs are dispatched by `type` to the appropriate handler method
3. Each handler transitions the bot through the state machine
4. The `PlaywrightManager` provides browser contexts per bot
5. After each action, heartbeat reports status to the backend
6. On failure, `ErrorHandler` captures screenshots and notifies the backend

## Data Flow Diagram

```
Request Flow (Start Bot → Join Table → Play Hand)
═══════════════════════════════════════════════════════

Admin UI                    Backend                   Redis Queue          Bot Worker
   │                          │                         │                    │
   │  POST /bots/:id/start    │                         │                    │
   │─────────────────────────▶│                         │                    │
   │                          │  AddJob(START_BOT)      │                    │
   │                          │────────────────────────▶│                    │
   │  Response: enqueued      │                         │                    │
   │◀─────────────────────────│                         │                    │
   │                          │                         │  BRPOP             │
   │                          │                         │◀────────────────────│
   │                          │                         │                    │
   │                          │                         │  Job: startBot     │
   │                          │                         │────────────────────▶│
   │                          │                         │  WorkerService      │
   │                          │                         │  .startBot(id)     │
   │                          │                         │                    │
   │                          │                         │    ├─► Browser      │
   │                          │                         │    │   launch()     │
   │                          │                         │    ├─► Navigate     │
   │                          │                         │    │   to poker URL │
   │                          │                         │    ├─► Login bot    │
   │                          │                         │    └─► Set state    │
   │                          │                         │        = IN_LOBBY   │
   │                          │                         │                    │
   │                          │◀── POST /internal/ ────│─── status report ──│
   │                          │      bots/status        │                    │
   │                          │                         │                    │
   │   Polling / events       │                         │                    │
   │◀─── WebSocket ──────────▶│                         │                    │
   │                          │                         │                    │

Game Decision Flow
══════════════════

   Worker reads UI ──▶ GameStateReader ──▶ Parsed GameState
                                                 │
                                                 ▼
                                        DecisionEngineService
                                            ├─ internal: @poker-bot/poker-engine
                                            │   ├─ EasyStrategy
                                            │   ├─ MediumStrategy
                                            │   └─ HardStrategy (extensible)
                                            │
                                            └─ external: POST to external API
                                                 (timeout: DECISION_ENGINE_TIMEOUT_MS)
                                                 │
                                                 ▼
                                        BotDecisionResult
                                            { action, amount, confidence, reason }
                                                 │
                                                 ▼
                                        ActionExecutorService
                                            ├─ Preflight checks (7 checks)
                                            │   ├─ Page exists
                                            │   ├─ Correct table
                                            │   ├─ Bot is seated
                                            │   ├─ Bot is in hand
                                            │   ├─ Hero turn
                                            │   ├─ Hand/Turn ID match
                                            │   └─ Amount in range
                                            │
                                            ├─ Execute (click button + fill input)
                                            │
                                            └─ Verify (check result state)
                                                 │
                                                 ▼
                                        POST /internal/bots/action-result
```

## Technology Decisions

### Why NestJS?

- **Modular architecture**: Feature modules map directly to business domains
- **Decorator-based routing**: Controllers are self-documenting with Swagger decorators
- **Dependency injection**: Clean separation of concerns, easy testing
- **Guard system**: Reusable auth/role guards that compose naturally
- **WebSocket integration**: Built-in Socket.IO gateway with the same DI container

### Why Playwright?

- **Full browser automation**: Unlike REST APIs, Poker Mavens is a browser-based application
- **Visual verification**: Can take screenshots and capture HTML on errors (critical for debugging)
- **Headless + headed mode**: Switchable via `PLAYWRIGHT_HEADLESS` for debugging
- **Cross-browser**: Chromium is the primary target, but API is browser-agnostic
- **Auto-waiting**: Built-in element visibility/state checks reduce flaky selectors

### Why BullMQ + Redis?

- **Reliable job queues**: Jobs persist in Redis, survive worker crashes
- **Rate limiting**: Built-in retry with exponential backoff
- **Job deduplication**: Job IDs prevent duplicate bot commands
- **Multiple queues**: Separate queues for lifecycle, table, actions, reconnection, statistics
- **Worker concurrency**: Multiple workers can process different queues independently

### Why Prisma + MySQL 8?

- **Type-safe queries**: Generated client ensures compile-time query validation
- **Migration system**: Version-controlled schema migrations
- **JSON fields**: `configurationJson`, `stateJson`, `boardJson` use MySQL JSON columns
- **Relation management**: Nested creates/updates reduce boilerplate
- **Seeding**: Built-in seed system for development data

### Encryption Strategy

- **Bot passwords**: AES-256-GCM with per-password random IV, stored as `iv:authTag:ciphertext`
- **Key derivation**: scrypt with fixed salt derives the 256-bit key from `BOT_CREDENTIALS_ENCRYPTION_KEY`
- **Admin passwords**: bcrypt with cost factor 12 (salted hash, not decryptable)
- **JWT**: HS256 signing using separate access/refresh secrets with configurable TTL

### Queue Architecture

| Queue Name | Purpose | Job Types |
|---|---|---|
| `bot-lifecycle` | Bot start/stop/restart | START_BOT, STOP_BOT, RESTART_BOT |
| `bot-table` | Table operations | JOIN_TABLE, LEAVE_TABLE, SIT_OUT, SIT_IN, REBUY |
| `bot-actions` | Poker action execution | EXECUTE_ACTION |
| `bot-reconnect` | Reconnection attempts | RECONNECT_BOT |
| `bot-events` | Asynchronous event processing | Internal event handling |
| `bot-statistics` | Statistics calculation | CALCULATE_STATISTICS |

### Logging and Monitoring

- **Structured logging**: Pino logger with JSON output, configurable level via `LOG_LEVEL`
- **Error snapshots**: On failure, worker captures screenshot + HTML snapshot + console errors
- **Heartbeats**: Workers send heartbeats every `BOT_HEARTBEAT_INTERVAL_MS` (default 10s)
- **Session tracking**: Lost sessions detected via heartbeat timeout, auto-queued for reconnection
- **Audit trail**: All admin operations logged to `audit_logs` table with before/after state
