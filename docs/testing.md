# Testing Guide

## Test Structure

Tests are organized by package and test type across the monorepo.

```
poker-bot-platform/
├── apps/
│   ├── backend/
│   │   └── tests/             # jest/mocha test files
│   ├── bot-worker/
│   │   └── tests/             # jest/mocha test files
│   └── admin-web/
│       └── __tests__/         # vitest test files
├── packages/
│   ├── poker-engine/
│   │   └── tests/             # Strategy, hand evaluation, bet sizing tests
│   ├── mavens-adapter/
│   │   └── tests/             # Adapter interface tests
│   └── shared-types/
│       └── tests/             # Type/enum validation tests
└── mock-poker-ui/             # Express server for E2E tests
```

## Running Tests

```bash
# Run all tests across all packages
pnpm test

# Run integration tests
pnpm test:integration

# Run end-to-end tests (requires mock-poker-ui)
pnpm test:e2e

# Run tests for a specific package
pnpm --filter @poker-bot/poker-engine test
pnpm --filter @poker-bot/backend test

# Run with coverage
pnpm --filter @poker-bot/poker-engine exec -- jest --coverage
```

## Unit Tests

### Coverage Areas

#### Backend (NestJS)

| Module | Test Focus | Key Scenarios |
|---|---|---|
| AuthModule | JWT token generation, password validation | Login success, login failure, token refresh, expired token |
| BotsService | CRUD operations, status validation | Create bot, duplicate login, soft delete, status transitions |
| BotCommandsService | Enqueue validation, status guards | Start from OFFLINE, start from PLAYING (rejected), stop offline bot |
| BotSessionsService | Session lifecycle, heartbeat timeout | Create session, end session, lost session detection |
| TablesService | Sync upsert, search, filtering | Create table, update table, sync with duplicates |
| StrategiesService | CRUD, clone, configuration | Create strategy, duplicate name, deep clone |
| HandsService | Hand recording, queries, filtering | Create hand, get actions, date range filtering |
| LimitsService | Limit checking, stop conditions | Daily loss exceeded, session duration exceeded, all checks pass |
| AuditService | Log creation, filtered queries | Log creation, filter by action, date range |
| StatisticsService | Aggregate computation, profit/loss | Dashboard stats, per-bot stats, profit/loss grouping |
| EncryptionService | Encrypt/decrypt, IV generation | Encrypt then decrypt matches, wrong key fails, bad format fails |
| InternalApiGuard | API key validation | Valid key passes, missing key rejected, wrong key rejected |
| RolesGuard | Role-based authorization | Admin can create, viewer cannot delete |

#### Bot Worker

| Module | Test Focus | Key Scenarios |
|---|---|---|
| BotStateMachine | State transitions, validation | Valid transitions succeed, invalid transitions fail, forceSet bypasses checks |
| DecisionEngineService | Internal/external mode, fallback | Internal decision, external decision, timeout, fallback on error |
| ResourceManager | Capacity checks, limits | Can start under limit, cannot start at limit, CPU exceeded |
| HeartbeatService | Interval management, payload | Start/stop heartbeat, payload structure |
| ReconnectionService | Retry logic, backoff | First attempt success, all attempts fail, exponential backoff |
| ErrorHandler | Error recording, screenshot | Error recorded, screenshot taken, backend notified |

#### Poker Engine

| Module | Test Focus | Key Scenarios |
|---|---|---|
| DecisionEngine | Strategy dispatch, fallback | EASY decision, MEDIUM decision, invalid action fallback |
| EasyStrategy | Conservative play | Premium hand check, weak hand fold, completes BB |
| MediumStrategy | Pot odds, betting | Value bet with premium hand, short-stack all-in, c-bet bluff |
| HandEvaluator | Hand strength calculation | Pair, two pair, flush, straight, high card |
| PotOddsCalculator | Odds computation | 33% call, 50% call, minimum call |
| SprCalculator | Stack-to-pot ratio | Low SPR, high SPR, effective stack calculation |
| BetSizer | Street-based sizing | Flop percentages, turn percentages, amount validation |
| PreflopRanges | Hand classification | Premium pair, suited connectors, offsuit trash |

## Integration Tests

Integration tests verify the interaction between components without external dependencies.

### Test Setup

```typescript
// Uses NestJS testing utilities with in-memory or test database
beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useClass(MockPrismaService)
    .compile();
  app = module.createNestApplication();
  await app.init();
});
```

### Key Integration Test Areas

1. **Auth Flow**: Login → get token → access protected endpoint → refresh token
2. **Bot Lifecycle**: Create bot → start bot → check status → stop bot
3. **Table Operations**: Sync tables → join table → leave table
4. **Hand Recording**: Start hand → record actions → finish hand → query statistics
5. **Queue Processing**: Enqueue job → verify job added → process job → verify result
6. **WebSocket Events**: Connect → subscribe → trigger event → receive event
7. **Rate Limiting**: Send multiple requests → verify 429 after limit
8. **Audit Trail**: Perform admin action → query audit log → verify entry

## E2E Test Scenarios

E2E tests use the mock Poker Mavens UI (`mock-poker-ui`) and Playwright to test the full system. The mock UI provides API endpoints that simulate Poker Mavens behavior without needing a real server.

### Setup

```bash
# Terminal 1: Start mock UI
cd mock-poker-ui
node server.js
# Mock UI running at http://localhost:3080

# Terminal 2: Run E2E tests
pnpm test:e2e
```

### Complete List of 20 E2E Scenarios

#### Authentication & Setup (3 tests)

1. **TC-AUTH-01: Successful Admin Login**
   - Login with valid credentials
   - Verify JWT token returned
   - Verify admin profile accessible

2. **TC-AUTH-02: Failed Login Handling**
   - Login with invalid credentials
   - Verify 401 response

3. **TC-AUTH-03: Token Refresh Flow**
   - Obtain tokens via login
   - Use refresh token to get new access token
   - Verify old access token expires

#### Bot Management (6 tests)

4. **TC-BOT-01: Create and Configure Bot**
   - Create bot with all parameters
   - Verify bot appears in list
   - Verify default limits created

5. **TC-BOT-02: Bot Start and Status Reporting**
   - Start a bot
   - Verify status transitions: OFFLINE -> STARTING -> IN_LOBBY
   - Verify heartbeat begins

6. **TC-BOT-03: Bot Stop and Cleanup**
   - Stop a running bot
   - Verify status: STOPPING -> OFFLINE
   - Verify browser context closed

7. **TC-BOT-04: Bot Join Table**
   - Start bot (logs into mock UI)
   - Join table with valid buy-in
   - Verify seated status and session created

8. **TC-BOT-05: Bot Leave Table**
   - Join table
   - Leave table
   - Verify back to IN_LOBBY status

9. **TC-BOT-06: Bot Sit Out and Sit In**
   - Seat at table
   - Sit out
   - Sit back in
   - Verify status transitions

#### Game Play (6 tests)

10. **TC-GAME-01: Read Game State While Seated**
    - Join table
    - Read hole cards, board cards, pot, stacks
    - Verify all state fields populated

11. **TC-GAME-02: Fold Action Execution**
    - Set hero's turn via mock control API
    - Execute fold action
    - Verify action recorded, hand advances

12. **TC-GAME-03: Check Action Execution**
    - Set hero's turn when check is available
    - Execute check action
    - Verify pot unchanged

13. **TC-GAME-04: Call Action Execution**
    - Set up scenario where call is required
    - Execute call with correct amount
    - Verify pot increases by call amount

14. **TC-GAME-05: Bet Action Execution**
    - Set hero's turn with bet available
    - Execute bet with amount
    - Verify pot increases

15. **TC-GAME-06: All-In Action Execution**
    - Execute all-in action
    - Verify stack goes to 0
    - Verify pot includes all-in amount

#### Decision Engine (2 tests)

16. **TC-DECISION-01: Internal Decision Making (EASY)**
    - Bot at hero's turn
    - Decision engine returns EASY strategy decision
    - Verify decision recorded in database
    - Verify reasoning field populated

17. **TC-DECISION-02: Fallback on Invalid State**
    - Send invalid game state to decision engine
    - Verify safe fallback (fold or check) returned
    - Verify fallback reason logged

#### Error Recovery (3 tests)

18. **TC-ERROR-01: Browser Disconnect and Reconnect**
    - Simulate browser disconnect via mock control API
    - Verify reconnection service starts
    - Verify exponential backoff
    - Verify successful reconnection

19. **TC-ERROR-02: Stale Turn Detection**
    - Mock hero's turn
    - Simulate stale turn via mock control API
    - Verify preflight check catches mismatch
    - Verify error reported

20. **TC-ERROR-03: Duplicate Action Prevention**
    - Submit same action twice for same hand/turn
    - Verify first succeeds
    - Verify second rejected with duplicate error
    - Verify Redis lock prevents double execution

## Mock UI Usage

The mock Poker Mavens UI (`mock-poker-ui/`) is an Express.js server that simulates:

- **Login**: Any username/password combination works
- **Lobby**: Pre-configured tables (Texas Hold'em, Omaha, Sit & Go)
- **Table**: Seat management, buy-in, action execution
- **Game State**: Generated cards, pot tracking, street progression

### Control Endpoints for Testing

The mock UI provides control endpoints that enable E2E test scenarios:

| Endpoint | Purpose |
|---|---|
| `/api/control/disconnect/:sessionId` | Toggle bot connection on/off |
| `/api/control/stale-turn/:sessionId` | Make the bot's turn ID stale |
| `/api/control/stale-hand/:sessionId` | Make the bot's hand ID stale |
| `/api/control/set-allowed-actions/:sessionId` | Restrict available actions |
| `/api/control/trigger-error/:sessionId` | Simulate error conditions |
| `/api/control/advance-street/:sessionId` | Force street transition (preflop -> flop -> turn -> river) |
| `/api/control/set-hero-turn/:sessionId/:isTurn` | Control whose turn it is (true/false) |

### Test Fixture: Starting the Mock UI

```javascript
// e2e/test-setup.js
const { execSync, spawn } = require('child_process');

module.exports = async () => {
  global.__MOCK_UI__ = spawn('node', ['server.js'], {
    cwd: './mock-poker-ui',
    stdio: 'pipe',
  });
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
};
```
