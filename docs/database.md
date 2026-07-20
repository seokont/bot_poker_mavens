# Database Schema

## Technology

- **Database**: MySQL 8.0
- **ORM**: Prisma 5.x (Prisma Client JS)
- **Migration Tool**: `prisma migrate dev` (development), `prisma migrate deploy` (production)
- **Naming Convention**: Models use PascalCase, table names use `snake_case` via `@@map()`

## Entity-Relationship Diagram

```
admin_users
    │
    └─── audit_logs (adminUserId FK)
    
bots
    ├─── strategy_profiles (strategyProfileId FK)
    ├─── bot_limits (botId FK, 1:1)
    ├─── bot_sessions (botId FK)
    ├─── bot_table_sessions (botId FK)
    ├─── bot_hands (botId FK)
    ├─── bot_decisions (botId FK)
    └─── hand_actions (botId FK)

poker_tables
    ├─── bot_table_sessions (tableId FK)
    └─── poker_hands (tableId FK)

poker_hands
    ├─── bot_hands (handId FK)
    ├─── hand_actions (handId FK)
    └─── bot_decisions (handId FK)

strategy_profiles
    └─── bots (strategyProfileId FK)
```

## Models

### AdminUser (admin_users)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| email | String | UNIQUE, NOT NULL | Admin login email |
| passwordHash | String | NOT NULL | bcrypt hash (cost 12) |
| name | String | NOT NULL | Display name |
| role | String | DEFAULT 'VIEWER' | SUPER_ADMIN, ADMIN, OPERATOR, VIEWER |
| isActive | Boolean | DEFAULT true | Soft disable flag |
| lastLoginAt | DateTime? | NULLABLE | Last successful login timestamp |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | @updatedAt | |

**Relations**: Has many `audit_logs`

### Bot (bots)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| name | String | NOT NULL | Bot display name |
| login | String | UNIQUE, NOT NULL | Poker Mavens login username |
| encryptedPassword | String | NOT NULL | AES-256-GCM encrypted password |
| status | String | DEFAULT 'OFFLINE' | Current bot status enum |
| isEnabled | Boolean | DEFAULT true | Soft delete/enable flag |
| operationMode | String | DEFAULT 'OBSERVER' | OBSERVER, ASSISTED, AUTONOMOUS |
| strategyProfileId | String? | FK -> strategy_profiles.id | Assigned strategy |
| defaultBuyIn | Float | DEFAULT 1000 | Default buy-in amount |
| minBuyIn | Float | DEFAULT 200 | Minimum allowed buy-in |
| maxBuyIn | Float | DEFAULT 5000 | Maximum allowed buy-in |
| dailyLossLimit | Float | DEFAULT -5000 | Stop threshold for daily loss |
| sessionLossLimit | Float | DEFAULT -2000 | Stop threshold per session |
| maxTables | Int | DEFAULT 1 | Max concurrent tables |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | @updatedAt | |

**Indexes**: `login` (UNIQUE), `strategyProfileId` (FK)

### BotSession (bot_sessions)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| botId | String | FK -> bots.id, NOT NULL | Parent bot |
| workerId | String? | NULLABLE | Worker instance identifier |
| browserSessionId | String? | NULLABLE | Playwright browser session ID |
| startedAt | DateTime | DEFAULT now() | Session start time |
| endedAt | DateTime? | NULLABLE | Session end time |
| startBalance | Float? | NULLABLE | Bot balance at session start |
| endBalance | Float? | NULLABLE | Bot balance at session end |
| profitLoss | Float? | NULLABLE | Calculated P&L |
| handsPlayed | Int | DEFAULT 0 | Hands played count |
| status | String | DEFAULT 'ACTIVE' | ACTIVE, ENDED, LOST, ERROR, DISCONNECTED, RECONNECTED |
| lastHeartbeatAt | DateTime? | NULLABLE | Last heartbeat timestamp |
| errorMessage | String? | NULLABLE | Error message if failed |

**Indexes**: `botId`, `(botId, status)`

### PokerTable (poker_tables)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| externalTableId | String | UNIQUE, NOT NULL | Poker Mavens table ID |
| name | String | NOT NULL | Table display name |
| gameType | String | DEFAULT 'NLH' | NLH, PLO4, PLO5, PLO6 |
| limitType | String | DEFAULT 'NL' | NL, PL, FL |
| smallBlind | Float | DEFAULT 1 | Small blind amount |
| bigBlind | Float | DEFAULT 2 | Big blind amount |
| ante | Float | DEFAULT 0 | Ante amount |
| minBuyIn | Float | DEFAULT 200 | Minimum buy-in |
| maxBuyIn | Float | DEFAULT 5000 | Maximum buy-in |
| maxPlayers | Int | DEFAULT 9 | Table capacity |
| isAllowedForBots | Boolean | DEFAULT true | Bot permission flag |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | @updatedAt | |

**Indexes**: `externalTableId` (UNIQUE)

### BotTableSession (bot_table_sessions)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| botId | String | FK -> bots.id, NOT NULL | Bot at table |
| tableId | String | FK -> poker_tables.id, NOT NULL | Table |
| botSessionId | String? | NULLABLE | Link to bot session |
| seatNumber | Int? | NULLABLE | Seat number |
| buyIn | Float? | NULLABLE | Buy-in amount |
| startStack | Float? | NULLABLE | Stack at seat time |
| currentStack | Float? | NULLABLE | Current stack amount |
| profitLoss | Float? | NULLABLE | Session P&L |
| joinedAt | DateTime | DEFAULT now() | Joined table time |
| leftAt | DateTime? | NULLABLE | Left table time |
| status | String | DEFAULT 'ACTIVE' | ACTIVE, ENDED |

**Indexes**: `(botId, tableId)`, `status`

### StrategyProfile (strategy_profiles)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| name | String | UNIQUE, NOT NULL | Strategy name |
| description | String? | NULLABLE | Human-readable description |
| difficulty | String | DEFAULT 'EASY' | EASY, MEDIUM, HARD |
| configurationJson | Json? | NULLABLE | Strategy parameters (JSON) |
| isActive | Boolean | DEFAULT true | Soft delete flag |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | @updatedAt | |

**Indexes**: `name` (UNIQUE)

### PokerHand (poker_hands)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| externalHandId | String? | NULLABLE | Poker Mavens hand ID |
| tableId | String | FK -> poker_tables.id, NOT NULL | Table where hand was played |
| startedAt | DateTime | DEFAULT now() | Hand start time |
| finishedAt | DateTime? | NULLABLE | Hand end time |
| gameType | String | DEFAULT 'NLH' | Game type |
| smallBlind | Float | NOT NULL | SB at time of hand |
| bigBlind | Float | NOT NULL | BB at time of hand |
| ante | Float | DEFAULT 0 | Ante at time of hand |
| buttonSeat | Int? | NULLABLE | Dealer seat number |
| boardJson | String? | NULLABLE | JSON: community cards |
| pot | Float | DEFAULT 0 | Final pot size |
| rake | Float | DEFAULT 0 | Rake taken |
| rawStateJson | String? | NULLABLE | Full game state snapshot |
| createdAt | DateTime | DEFAULT now() | |

**Indexes**: `tableId`, `startedAt`, `(tableId, startedAt)`

### BotHand (bot_hands)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| botId | String | FK -> bots.id, NOT NULL | Bot in hand |
| handId | String | FK -> poker_hands.id, NOT NULL | Hand |
| position | String? | NULLABLE | Position (SB, BB, UTG, etc.) |
| holeCardsEncrypted | String? | NULLABLE | Encrypted hole cards |
| startStack | Float? | NULLABLE | Stack at hand start |
| endStack | Float? | NULLABLE | Stack at hand end |
| profitLoss | Float? | NULLABLE | Hand result P&L |
| result | String? | NULLABLE | WON, LOST, CHOP |
| showdown | Boolean | DEFAULT false | Reached showdown |
| createdAt | DateTime | DEFAULT now() | |

**Indexes**: `(botId, handId)`, `handId`

### HandAction (hand_actions)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| handId | String | FK -> poker_hands.id, NOT NULL | Parent hand |
| botId | String? | FK -> bots.id | Bot who acted |
| externalPlayerId | String? | NULLABLE | External player reference |
| street | String | NOT NULL | PREFLOP, FLOP, TURN, RIVER |
| sequence | Int | NOT NULL | Action order in hand |
| action | String | NOT NULL | FOLD, CHECK, CALL, BET, RAISE, ALL_IN |
| amount | Float | DEFAULT 0 | Action amount |
| potBefore | Float? | NULLABLE | Pot before action |
| potAfter | Float? | NULLABLE | Pot after action |
| stackBefore | Float? | NULLABLE | Actor stack before |
| stackAfter | Float? | NULLABLE | Actor stack after |
| isBotAction | Boolean | DEFAULT false | Bot vs human action |
| createdAt | DateTime | DEFAULT now() | |

**Indexes**: `handId`, `(handId, sequence)`, `botId`

### BotDecision (bot_decisions)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| botId | String | FK -> bots.id, NOT NULL | Decision maker |
| handId | String | FK -> poker_hands.id, NOT NULL | Hand context |
| turnId | String | NOT NULL | Turn identifier (dedup) |
| street | String? | NULLABLE | Street when decision made |
| stateJson | String? | NULLABLE | Game state at decision time |
| allowedActionsJson | String? | NULLABLE | Available actions |
| decision | String | NOT NULL | Chosen action + amount |
| amount | Float? | NULLABLE | Decision amount |
| confidence | Float | DEFAULT 1 | Confidence score 0-1 |
| reason | String? | NULLABLE | Decision reasoning |
| strategyVersion | String? | NULLABLE | Strategy version used |
| processingTimeMs | Int? | NULLABLE | Decision time in ms |
| executed | Boolean | DEFAULT false | Action executed flag |
| executionError | String? | NULLABLE | Error if execution failed |
| createdAt | DateTime | DEFAULT now() | |

**Indexes**: `(botId, handId, turnId)`, `handId`

### BotLimit (bot_limits)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| botId | String | UNIQUE, FK -> bots.id | Bot (1:1) |
| maxDailyLoss | Float | DEFAULT -5000 | Stop threshold (negative) |
| maxSessionLoss | Float | DEFAULT -2000 | Stop threshold (negative) |
| maxHandsPerSession | Int | DEFAULT 500 | Hands limit |
| maxSessionDurationMinutes | Int | DEFAULT 480 | 8 hours default |
| maxBuyIn | Float | DEFAULT 5000 | Max single buy-in |
| minBalance | Float | DEFAULT 100 | Auto-stop at this balance |
| autoStopEnabled | Boolean | DEFAULT true | Auto-stop on limit hit |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | @updatedAt | |

**Indexes**: `botId` (UNIQUE)

### AuditLog (audit_logs)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | String (CUID) | PK | Unique identifier |
| adminUserId | String? | FK -> admin_users.id | Admin who performed action |
| action | String | NOT NULL | Action name (e.g., BOT_CREATED, STRATEGY_UPDATED) |
| entityType | String | NOT NULL | Entity type (e.g., Bot, StrategyProfile) |
| entityId | String | NOT NULL | Affected entity ID |
| beforeJson | String? | NULLABLE | Previous state snapshot |
| afterJson | String? | NULLABLE | New state snapshot |
| ipAddress | String? | NULLABLE | Admin IP address |
| userAgent | String? | NULLABLE | Admin browser user agent |
| createdAt | DateTime | DEFAULT now() | |

**Indexes**: `adminUserId`, `entityType`, `(entityType, entityId)`, `createdAt`

## Key Indexes Summary

| Table | Index | Type | Columns | Purpose |
|---|---|---|---|---|
| bots | `login` | UNIQUE | login | Prevent duplicate bot accounts |
| bot_sessions | `bot_active` | INDEX | (botId, status) | Quick lookup of active sessions |
| bot_decisions | `bot_turn` | INDEX | (botId, handId, turnId) | Deduplicate decisions |
| bot_limits | `bot_id` | UNIQUE | botId | Enforce 1:1 limit per bot |
| poker_tables | `externalTableId` | UNIQUE | externalTableId | Prevent sync duplicates |
| bot_hands | `bot_hand` | INDEX | (botId, handId) | Bot hand history queries |
| hand_actions | `hand_sequence` | INDEX | (handId, sequence) | Action replay ordering |
| audit_logs | `entity` | INDEX | (entityType, entityId) | Audit trail by entity |

## Migration Strategy

### Development

```bash
# Create migration after schema changes
cd apps/backend
npx prisma migrate dev --name <descriptive-name>

# Apply all pending migrations
npx prisma migrate deploy

# Reset database (WARNING: drops all data)
npx prisma migrate reset
```

### Production

1. Schema changes are applied via `prisma migrate deploy` (no `--create-only`)
2. Breaking changes (column drops, renames) should be done in phases:
   - Phase 1: Add new column, dual-write, backfill
   - Phase 2: Migrate reads to new column
   - Phase 3: Drop old column
3. Always back up the database before deploying migrations

### Migration Files Location

`apps/backend/prisma/migrations/` - Each migration is a timestamped directory containing:
- `migration.sql` - SQL statements
- `migration_lock.toml` - Migration engine metadata

## Seed Data

The seed script (`apps/backend/prisma/seed.ts`) creates:

- **1 Admin**: SUPER_ADMIN with configurable credentials via env vars
- **2 Strategy Profiles**: EASY and MEDIUM with full configuration
- **3 Bot Templates**: Alpha, Beta, Gamma with defaults
- **2 Poker Tables**: 1/2 and 5/10 blind levels
- **Bot Limits**: Created for each bot with conservative defaults

Run seeding:
```bash
pnpm prisma:seed
```
