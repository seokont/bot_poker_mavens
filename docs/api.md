# API Documentation

## Base URL

- **Public API**: `/api/v1`
- **Internal API**: `/internal` (worker-to-backend communication)
- **Health**: `/health`, `/health/ready`, `/health/live`
- **Swagger UI**: `/api/docs`

## Authentication

Most endpoints require a JWT Bearer token obtained via login.

### POST /api/v1/auth/login

Authenticate with admin credentials.

**Request:**
```json
{
  "email": "admin@poker-bots.local",
  "password": "Admin123!"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "admin": {
    "id": "clx...",
    "email": "admin@poker-bots.local",
    "name": "Super Admin",
    "role": "SUPER_ADMIN"
  }
}
```

**Errors:**
- `401 Unauthorized`: Invalid credentials

### POST /api/v1/auth/refresh

Refresh an expired access token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Errors:**
- `401 Unauthorized`: Invalid or expired refresh token

### POST /api/v1/auth/logout

Invalidate the current session (requires JWT).

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

### GET /api/v1/auth/me

Get current admin profile (requires JWT).

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "id": "clx...",
  "email": "admin@poker-bots.local",
  "name": "Super Admin",
  "role": "SUPER_ADMIN"
}
```

## Bot Management

All bot endpoints require JWT authentication.

### POST /api/v1/bots

Create a new bot. Roles: SUPER_ADMIN, ADMIN, OPERATOR

**Request:**
```json
{
  "name": "Bot Alpha",
  "login": "bot_alpha",
  "password": "secure_password",
  "strategyProfileId": "clx...",
  "defaultBuyIn": 1000,
  "minBuyIn": 200,
  "maxBuyIn": 5000,
  "dailyLossLimit": -5000,
  "sessionLossLimit": -2000,
  "maxTables": 1
}
```

**Response (201):**
```json
{
  "id": "clx123...",
  "name": "Bot Alpha",
  "login": "bot_alpha",
  "status": "OFFLINE",
  "isEnabled": true,
  "operationMode": "AUTONOMOUS",
  "defaultBuyIn": 1000,
  "strategyProfile": { "id": "...", "name": "EASY", "difficulty": "EASY" },
  "limit": { ... },
  "sessions": []
}
```

**Errors:**
- `409 Conflict`: Bot with this login already exists

### GET /api/v1/bots

Get paginated list of bots. Roles: SUPER_ADMIN, ADMIN, OPERATOR, VIEWER

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| status | string | Filter by status (OFFLINE, PLAYING, etc.) |
| search | string | Search name or login |
| sortBy | string | Sort field (default: createdAt) |
| sortOrder | asc / desc | Sort direction (default: desc) |

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "name": "Bot Alpha",
      "login": "bot_alpha",
      "status": "PLAYING",
      "isEnabled": true,
      "operationMode": "AUTONOMOUS",
      "strategyProfile": { "id": "...", "name": "EASY", "difficulty": "EASY" },
      "sessions": [{ "id": "...", "startedAt": "2024-01-15T...", "workerId": "worker-1234" }]
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

### GET /api/v1/bots/:id

Get a single bot with all relations.

**Response (200):**
```json
{
  "id": "clx...",
  "name": "Bot Alpha",
  "login": "bot_alpha",
  "status": "PLAYING",
  "isEnabled": true,
  "operationMode": "AUTONOMOUS",
  "strategyProfile": { ... },
  "limit": { ... },
  "sessions": [ ... ]
}
```

### PATCH /api/v1/bots/:id

Update bot configuration. Roles: SUPER_ADMIN, ADMIN, OPERATOR

**Request:**
```json
{
  "name": "Bot Alpha Renamed",
  "defaultBuyIn": 2000,
  "isEnabled": true
}
```

**Response (200):** Full bot object with updated fields.

### DELETE /api/v1/bots/:id

Soft delete a bot (sets `isEnabled=false`). Roles: SUPER_ADMIN, ADMIN

**Response (200):** Updated bot object with `isEnabled: false`.

## Bot Commands

All command endpoints require JWT authentication. Roles: SUPER_ADMIN, ADMIN, OPERATOR

### POST /api/v1/bots/:id/start

Enqueue a bot start command.

**Response (200):**
```json
{
  "success": true,
  "message": "Start command enqueued for bot \"clx...\""
}
```

### POST /api/v1/bots/:id/stop

Enqueue a bot stop command.

### POST /api/v1/bots/:id/restart

Enqueue a bot restart command (stop + start).

### POST /api/v1/bots/:id/join-table

Make a bot join a poker table.

**Request:**
```json
{
  "tableId": "clx...",
  "buyIn": 1000,
  "preferredSeat": 5,
  "waitForBigBlind": true
}
```

### POST /api/v1/bots/:id/leave-table

Make a bot leave the current table.

### POST /api/v1/bots/:id/sit-out

Make a bot sit out the next hand.

### POST /api/v1/bots/:id/sit-in

Make a bot sit back in after sitting out.

### POST /api/v1/bots/:id/rebuy

Make a bot rebuy chips at the table.

**Request:**
```json
{
  "amount": 1000
}
```

### Bulk Commands

All bulk commands accept the same body format:

**Request:**
```json
{
  "botIds": ["clx1...", "clx2..."]
}
```

| Endpoint | Description |
|---|---|
| `POST /api/v1/bots/bulk/start` | Start multiple bots |
| `POST /api/v1/bots/bulk/stop` | Stop multiple bots |
| `POST /api/v1/bots/bulk/join-table` | Join multiple bots to the same table |
| `POST /api/v1/bots/bulk/leave-table` | Make multiple bots leave their tables |

**Bulk Join Table additionally accepts:**
```json
{
  "botIds": ["clx1...", "clx2..."],
  "tableId": "clx...",
  "buyIn": 1000,
  "preferredSeat": null,
  "waitForBigBlind": true
}
```

**Response (200):**
```json
{
  "success": true,
  "results": [
    { "botId": "clx1...", "success": true, "message": "..." },
    { "botId": "clx2...", "success": false, "message": "Bot is disabled" }
  ]
}
```

## Table Endpoints

### GET /api/v1/tables

Get paginated list of poker tables.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| page | number | Page number |
| limit | number | Items per page |
| search | string | Search table name or external ID |
| gameType | string | Filter by game type (NLH, PLO4, etc.) |
| isAllowedForBots | boolean | Filter by bot permission |

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "externalTableId": "test-table-001",
      "name": "Test Table 1",
      "gameType": "NLH",
      "limitType": "NL",
      "smallBlind": 1,
      "bigBlind": 2,
      "ante": 0,
      "minBuyIn": 200,
      "maxBuyIn": 5000,
      "maxPlayers": 9,
      "isAllowedForBots": true,
      "botCount": 2
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
}
```

### GET /api/v1/tables/:id

Get a single table with connected bot sessions.

### POST /api/v1/tables/sync

Sync tables from external data (upsert). Roles: ADMIN, SUPER_ADMIN

**Request:**
```json
{
  "tables": [
    {
      "externalTableId": "live-table-001",
      "name": "Cash Game 1/2",
      "gameType": "NLH",
      "limitType": "NL",
      "smallBlind": 1,
      "bigBlind": 2,
      "minBuyIn": 200,
      "maxBuyIn": 5000,
      "maxPlayers": 9,
      "isAllowedForBots": true
    }
  ]
}
```

**Response (200):**
```json
{
  "synced": 1,
  "results": [
    { "externalTableId": "live-table-001", "action": "created" }
  ]
}
```

### PATCH /api/v1/tables/:id

Update table settings. Roles: ADMIN, SUPER_ADMIN

## Strategy Endpoints

### GET /api/v1/strategies

Get paginated list of strategy profiles.

### POST /api/v1/strategies

Create a strategy profile. Roles: ADMIN, SUPER_ADMIN

**Request:**
```json
{
  "name": "Aggressive Bluff",
  "description": "High aggression with frequent bluffing",
  "difficulty": "MEDIUM",
  "configurationJson": {
    "aggression": 0.8,
    "bluffFrequency": 0.3,
    "cbetFrequency": 0.8
  },
  "isActive": true
}
```

### GET /api/v1/strategies/:id

Get a single strategy profile with bot count.

### PATCH /api/v1/strategies/:id

Update a strategy profile. Roles: ADMIN, SUPER_ADMIN

### DELETE /api/v1/strategies/:id

Soft delete (sets `isActive=false`). Roles: ADMIN, SUPER_ADMIN

### POST /api/v1/strategies/:id/clone

Deep clone a strategy with "(Copy)" suffix. Roles: ADMIN, SUPER_ADMIN

## Hand Endpoints

### GET /api/v1/hands

Get paginated list of poker hands with filters.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| page | number | Page number |
| limit | number | Items per page |
| botId | string | Filter by bot |
| tableId | string | Filter by table |
| gameType | string | Filter by game type |
| dateFrom | ISO date | Hand start date lower bound |
| dateTo | ISO date | Hand start date upper bound |
| result | string | Hand result (WON, LOST) |
| sortBy | string | Sort field (default: startedAt) |
| sortOrder | asc / desc | Sort direction |

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "externalHandId": "hand-12345",
      "table": { "id": "...", "name": "Test Table 1" },
      "gameType": "NLH",
      "startedAt": "2024-01-15T10:30:00Z",
      "finishedAt": "2024-01-15T10:31:00Z",
      "pot": 45,
      "rake": 2,
      "botHands": [
        {
          "bot": { "id": "...", "name": "Bot Alpha" },
          "profitLoss": 22.5,
          "result": "WON"
        }
      ],
      "_count": { "actions": 6 }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
```

### GET /api/v1/hands/:id

Get a single hand with table, bot hands, all actions, and all decisions.

### GET /api/v1/hands/:id/actions

Get all actions for a specific hand ordered by sequence.

### GET /api/v1/hands/:id/decisions

Get all bot decisions for a specific hand.

### POST /api/v1/hands

Record a new poker hand.

**Request:**
```json
{
  "externalHandId": "hand-12345",
  "tableId": "clx...",
  "gameType": "NLH",
  "smallBlind": 1,
  "bigBlind": 2,
  "ante": 0,
  "buttonSeat": 3,
  "boardJson": "[\"Ah\",\"Kd\",\"Qc\"]",
  "pot": 0,
  "rawStateJson": "{...}"
}
```

### PATCH /api/v1/hands/:id/finished

Mark a hand as finished with results.

**Request:**
```json
{
  "finishedAt": "2024-01-15T10:31:00Z",
  "pot": 45,
  "rake": 2,
  "boardJson": "[\"Ah\",\"Kd\",\"Qc\",\"Js\",\"Th\"]",
  "rawStateJson": "{...}"
}
```

## Action Endpoints

### GET /api/v1/actions

List all hand actions with filters.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| page | number | Page number |
| limit | number | Items per page |
| botId | string | Filter by bot |
| handId | string | Filter by hand |
| street | string | Filter by street |

## Statistics Endpoints

### GET /api/v1/statistics/dashboard

Get aggregate dashboard statistics.

**Response (200):**
```json
{
  "totalBots": 3,
  "activeBots": 2,
  "playingBots": 1,
  "offlineBots": 1,
  "errorBots": 0,
  "currentTables": 2,
  "handsToday": 47,
  "totalPL": 1234.50,
  "todayPL": 56.20,
  "avgWinRate": 52.3,
  "errorCount": 0
}
```

### GET /api/v1/statistics/bots

Get statistics for all enabled bots.

### GET /api/v1/statistics/bots/:id

Get detailed statistics for a single bot.

**Response (200):**
```json
{
  "botId": "clx...",
  "botName": "Bot Alpha",
  "handsPlayed": 150,
  "profitLoss": 450.00,
  "bbWon": 225.00,
  "bbPer100": 150.00,
  "VPIP": 22.5,
  "PFR": 15.3,
  "threeBet": 5.2,
  "foldToThreeBet": 40.0,
  "cBetFlop": 65.0,
  "cBetTurn": 48.0,
  "wentToShowdown": 28.0,
  "wonAtShowdown": 55.0,
  "aggressionFactor": 2.1,
  "averagePot": 35.50,
  "averageDecisionTime": 850,
  "errorRate": 2.5,
  "reconnectCount": 1
}
```

### GET /api/v1/statistics/tables/:id

Get statistics for a specific table.

### GET /api/v1/statistics/profit-loss

Get profit/loss data grouped by time range.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| dateFrom | ISO date | Start date |
| dateTo | ISO date | End date |
| groupBy | string | day, week, month |

**Response (200):**
```json
[
  { "date": "2024-01-15", "profitLoss": 25.50, "cumulativePL": 425.00 },
  { "date": "2024-01-16", "profitLoss": -12.00, "cumulativePL": 413.00 }
]
```

## Limit Endpoints

### GET /api/v1/bots/:id/limits

Get limits for a specific bot.

**Response (200):**
```json
{
  "id": "clx...",
  "botId": "clx...",
  "maxDailyLoss": -5000,
  "maxSessionLoss": -2000,
  "maxHandsPerSession": 500,
  "maxSessionDurationMinutes": 480,
  "maxBuyIn": 5000,
  "minBalance": 100,
  "autoStopEnabled": true
}
```

### PATCH /api/v1/bots/:id/limits

Update limits for a bot. Roles: SUPER_ADMIN, ADMIN

## Audit Log Endpoints

### GET /api/v1/audit-logs

Get paginated audit logs. Roles: SUPER_ADMIN only

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| page | number | Page number |
| limit | number | Items per page (max 100) |
| adminUserId | string | Filter by admin |
| action | string | Filter by action type |
| entityType | string | Filter by entity type |
| dateFrom | ISO date | Start date |
| dateTo | ISO date | End date |

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "adminUser": { "id": "...", "email": "admin@..." },
      "action": "BOT_CREATED",
      "entityType": "Bot",
      "entityId": "clx...",
      "beforeJson": null,
      "afterJson": "{\"name\":\"Bot Alpha\",...}",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

## Health Endpoints

### GET /health

Basic health check (no dependencies required).

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

### GET /health/ready

Readiness check - verifies database and Redis connectivity.

**Response (200):**
```json
{
  "status": "ok",
  "checks": {
    "database": true,
    "redis": true
  },
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

Response is `ok` only when all checks pass. Returns `degraded` if any dependency is down.

### GET /health/live

Liveness check (Kubernetes readiness probe).

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

## Internal Worker API

All internal endpoints require `x-internal-api-key` header matching `INTERNAL_API_KEY` env var. These endpoints are only accessible from within the Docker network (restricted by Nginx to `172.0.0.0/8`).

### POST /internal/workers/register

Register a bot worker with the backend.

**Headers:** `x-internal-api-key: <key>`

**Request:**
```json
{
  "workerId": "worker-1234",
  "hostname": "poker-bot-worker",
  "pid": 42,
  "maxBots": 5
}
```

### POST /internal/workers/heartbeat

Send a heartbeat for a bot.

**Request:**
```json
{
  "workerId": "worker-1234",
  "botId": "clx...",
  "status": "playing",
  "tableId": "clx...",
  "handId": "clx...",
  "memoryUsage": 150000000,
  "browserConnected": true
}
```

### POST /internal/bots/status

Update bot status from worker.

**Request:**
```json
{
  "botId": "clx...",
  "status": "PLAYING",
  "workerId": "worker-1234",
  "tableId": "clx...",
  "handId": "clx...",
  "errorMessage": null
}
```

### POST /internal/bots/event

Send an asynchronous bot event.

**Request:**
```json
{
  "botId": "clx...",
  "eventType": "hand_started",
  "eventData": { "handId": "clx...", "tableId": "clx..." }
}
```

### POST /internal/bots/game-state

Save game state snapshot (creates a new `BotDecision` record).

**Request:**
```json
{
  "botId": "clx...",
  "tableId": "clx...",
  "handId": "clx...",
  "turnId": "clx...",
  "stateJson": "{ \"pot\": 45, \"street\": \"FLOP\", ... }"
}
```

### POST /internal/bots/action-result

Report the result of an executed action.

**Request:**
```json
{
  "botId": "clx...",
  "tableId": "clx...",
  "handId": "clx...",
  "turnId": "clx...",
  "action": "CALL",
  "amount": 10,
  "success": true,
  "errorMessage": null
}
```

### POST /internal/bot-action

Record an internal bot action (creates `HandAction` record).

**Request:**
```json
{
  "botId": "clx...",
  "tableId": "clx...",
  "handId": "clx...",
  "turnId": "clx...",
  "action": "FOLD",
  "amount": 0
}
```

## WebSocket Events

The backend emits real-time events via Socket.IO at `/admin` namespace.

### Connection

```javascript
const socket = io('http://localhost:3000/admin', {
  auth: { token: 'jwt-access-token' }
});
```

### Subscribing to Events

```javascript
socket.emit('subscribe', { events: ['bot.*', 'limits.*'] });
```

### Event Types

| Event | Payload | Description |
|---|---|---|
| `bot.status.changed` | `{ botId, oldStatus, newStatus }` | Bot status transition |
| `bot.started` | `{ botId }` | Bot started successfully |
| `bot.stopped` | `{ botId }` | Bot stopped |
| `bot.error` | `{ botId, errorCode, errorMessage }` | Bot encountered error |
| `bot.reconnecting` | `{ botId }` | Bot attempting reconnection |
| `bot.table.joined` | `{ botId, tableId }` | Bot joined a table |
| `bot.table.left` | `{ botId, tableId }` | Bot left a table |
| `bot.hand.started` | `{ botId, handId, tableId }` | New hand started |
| `bot.hand.finished` | `{ botId, handId, result, profitLoss }` | Hand completed |
| `bot.turn.started` | `{ botId, handId, turnId }` | Bot's turn |
| `bot.decision.created` | `{ botId, handId, decision }` | Decision made |
| `bot.action.executed` | `{ botId, handId, action, amount }` | Action executed |
| `bot.action.failed` | `{ botId, handId, errorMessage }` | Action failed |
| `limits.triggered` | `{ botId, limitType, currentValue, limitValue }` | Limit reached |
| `worker.heartbeat` | `{ workerId, botId, status }` | Worker heartbeat |

## Error Response Format

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Bot with ID \"clx...\" not found",
    "details": {}
  }
}
```

Common HTTP status codes:

| Status | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid JWT) |
| 403 | Forbidden (insufficient role) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |
