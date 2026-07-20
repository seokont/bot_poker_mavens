# Playwright Adapter

## Overview

The Playwright adapter system provides a browser automation layer that allows bot workers to interact with Poker Mavens as if they were human players. It consists of two packages:

1. **`@poker-bot/mavens-adapter`** - Interface definitions and selector configurations
2. **Bot Worker Playwright modules** - Concrete implementations for browser management, state reading, and action execution

## PokerClientAdapter Interface

Defined in `packages/mavens-adapter/src/interfaces/poker-client-adapter.ts`:

```typescript
interface PokerClientAdapter {
  // Lifecycle
  launch(): Promise<void>;
  login(credentials: BotCredentials): Promise<void>;
  logout(): Promise<void>;

  // Table navigation
  getLobbyTables(): Promise<LobbyTable[]>;
  openTable(tableExternalId: string): Promise<void>;
  closeTable(tableExternalId: string): Promise<void>;

  // Seat management
  getAvailableSeats(): Promise<number[]>;
  takeSeat(seatNumber: number): Promise<void>;
  buyIn(amount: number): Promise<void>;
  leaveSeat(): Promise<void>;

  // Table controls
  sitOut(): Promise<void>;
  sitIn(): Promise<void>;

  // Game state
  readGameState(): Promise<GameState>;
  isHeroTurn(): Promise<boolean>;
  getAllowedActions(): Promise<AllowedAction[]>;

  // Poker actions
  fold(): Promise<void>;
  check(): Promise<void>;
  call(): Promise<void>;
  bet(amount: number): Promise<void>;
  raise(amount: number): Promise<void>;
  allIn(): Promise<void>;

  // Cleanup
  close(): Promise<void>;
}
```

## PokerMavensPlaywrightAdapter Implementation Plan

The adapter is implemented across multiple services in the bot worker:

| Service | File | Adapter Method |
|---|---|---|
| PlaywrightManager | `playwright-manager.ts` | `launch()`, `close()` |
| WorkerService | `worker.service.ts` | `loginBot()`, join/leave table, sit in/out |
| GameStateReader | `game-state-reader.ts` | `readGameState()`, `isHeroTurn()`, `getAllowedActions()` |
| ActionExecutorService | `action-executor.service.ts` | `fold()`, `check()`, `call()`, `bet()`, `raise()`, `allIn()` |

### PlaywrightManager

```typescript
class PlaywrightManager {
  // Manages a single Chromium browser instance with per-bot browser contexts
  async launch(): Promise<Browser>;
  async getOrCreateContext(botId: string): Promise<BrowserContext>;
  async createPage(botId: string): Promise<Page>;
  async closeContext(botId: string): Promise<void>;
  async closeAll(): Promise<void>;
  enforceMaxBots(): boolean;
  activeBotsCount(): number;
}
```

Key details:
- Launches Chromium with `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
- Headless mode controlled by `PLAYWRIGHT_HEADLESS` env var
- Each bot gets an isolated `BrowserContext` (separate cookies/localStorage)
- Viewport: 1280x800
- Max bots per worker enforced via `enforceMaxBots()` / `MAX_BOTS_PER_WORKER`

### WorkerService Login Flow

```typescript
private async loginBot(page: Page, botId: string): Promise<void> {
  // 1. Look up credentials from env (BOT_<ID>_USERNAME / PASSWORD)
  // 2. Click login button if visible
  // 3. Fill username/password inputs
  // 4. Submit login form
  // 5. Wait for authentication
}
```

## Selectors Configuration

Defined in `packages/mavens-adapter/src/selectors/default-selectors.ts`:

```typescript
interface PokerMavensSelectors {
  login: {
    usernameInput: string;    // '#username'
    passwordInput: string;    // '#password'
    submitButton: string;     // 'button[type="submit"]'
    loginError: string;       // '.error-message'
  };
  lobby: {
    tableRows: string;        // '.lobby-table-row'
    tableName: string;        // '.table-name'
    openTableButton: string;  // '.open-table-btn'
  };
  table: {
    seats: string;            // '.seat-position'
    emptySeat: string;        // '.seat-position.empty'
    heroSeat: string;         // '.seat-position.hero'
    pot: string;              // '.pot-amount'
    boardCards: string;       // '.board-cards .card'
    heroCards: string;        // '.hero-cards .card'
    heroStack: string;        // '.hero-stack'
    dealerButton: string;     // '.dealer-button'
    activePlayer: string;     // '.player.active-turn'
    playerNames: string;      // '.player-name'
    playerStacks: string;     // '.player-stack'
    actionHistory: string;    // '.action-history .action-entry'
  };
  actions: {
    foldButton: string;       // '.action-btn.fold'
    checkButton: string;      // '.action-btn.check'
    callButton: string;       // '.action-btn.call'
    betButton: string;        // '.action-btn.bet'
    raiseButton: string;      // '.action-btn.raise'
    allInButton: string;      // '.action-btn.all-in'
    amountInput: string;      // '.bet-amount-input'
    actionTimer: string;      // '.action-timer'
  };
  buyIn: {
    amountInput: string;      // '.buy-in-amount'
    confirmButton: string;    // '.buy-in-confirm'
    cancelButton: string;     // '.buy-in-cancel'
  };
}
```

The default selectors target the mock Poker Mavens UI (`mock-poker-ui/index.html`). To adapt to a real Poker Mavens instance:

1. Create a new selector object matching `PokerMavensSelectors` interface
2. Update the selectors to match your Poker Mavens theme/version
3. Inject the new selectors into the adapter or update the defaults

### Selector Resolution Strategy

The `GameStateReader` and `ActionExecutorService` use a fallback strategy for each element, trying multiple selectors in order:

```typescript
// Example: Reading pot size
const potElement = page.locator(
  '[data-testid="pot-size"], .pot-size, .pot-amount'
);
```

The first matching visible element is used. This provides compatibility across different Poker Mavens themes.

## State Reading Approach

### GameStateReader

`apps/bot-worker/src/game-state-reader/game-state-reader.ts`

The reader extracts the following game state from the Poker Mavens page:

```typescript
interface GameState {
  holeCards: string[];        // e.g., ["Ah", "Kd"]
  boardCards: string[];       // e.g., ["Qc", "Jh", "9d"]
  potSize: number;
  heroStack: number;
  players: PlayerState[];     // All players at the table
  street: Street;             // PREFLOP | FLOP | TURN | RIVER | SHOWDOWN | UNKNOWN
  actionHistory: ActionEntry[];
  heroSeatIndex: number;
}
```

### Reading Components

| Component | Selector Strategy | Data Extraction |
|---|---|---|
| Hole Cards | `[data-testid="hero-cards"] .card`, `.hero-cards .card`, `.hole-card` | `data-card` attribute (e.g., "Ah") |
| Board Cards | `[data-testid="board-cards"] .card`, `.board-cards .card`, `.community-card` | `data-card` attribute |
| Pot Size | `[data-testid="pot-size"]`, `.pot-size`, `.pot-amount` | Text content, strip non-numeric chars |
| Hero Stack | `[data-testid="hero-stack"]`, `.hero-stack`, `.my-stack` | Text content, strip non-numeric chars |
| Players | `[data-testid="player"]`, `.player-seat`, `.seat` | Iterate elements, read name/stack/bet/indicators |
| Street | `[data-testid="street"]`, `.street-label`, `.round-label` | Text content, match against street keywords |
| Action History | `[data-testid="action-log"] .action-entry`, `.action-history .action-entry` | Split by ":" to get player:action pairs |
| Hero Turn | `[data-testid="hero-turn"]`, `.hero-turn-indicator`, `.my-turn` | Element visibility check |

### Rationale

- **HTML parsing over API**: Poker Mavens is a browser-based application. The Admin API is separate and may not expose real-time game state.
- **Multiple selectors**: Different Poker Mavens versions/themes use different class structures. The fallback approach maximizes compatibility.
- **Attribute-based cards**: Using `data-card` attributes rather than text content provides reliable card identification regardless of display formatting.

## Action Execution with Preflight Checks

### ActionExecutorService

`apps/bot-worker/src/action-executor/action-executor.service.ts`

Before any action is executed, the service runs seven preflight checks:

```typescript
private async runPreFlightChecks(
  botId, expectedTableId, expectedHandId, expectedTurnId, action, amount, page
): Promise<PreFlightResult> {
  // 1. Page exists check
  if (!page) failures.push('No page available for bot');

  // 2. Correct table check
  const tableCheck = await isCorrectTable(page, expectedTableId);
  if (!tableCheck) failures.push('Incorrect table');

  // 3. Seated check
  const seated = await isSeated(page);
  if (!seated) failures.push('Bot is not seated');

  // 4. In hand check
  const inHand = await isInHand(page);
  if (!inHand) failures.push('Bot is not in a hand');

  // 5. Hero turn check
  const heroTurn = await isHeroTurn(page);
  if (!heroTurn) failures.push('Not hero turn');

  // 6. Hand/Turn ID match check
  const handCheck = await verifyHandId(page, expectedHandId);
  if (!handCheck) failures.push('Hand ID mismatch');

  const turnCheck = await verifyTurnId(page, expectedTurnId);
  if (!turnCheck) failures.push('Turn ID mismatch');

  // 7. Action and amount validation
  const actionAllowed = isActionAllowed(action);
  if (!actionAllowed) failures.push('Action is not allowed');

  if (amount !== undefined) {
    const amountValid = await isAmountInRange(page, action, amount);
    if (!amountValid) failures.push('Amount out of valid range');
  }

  return { passed: failures.length === 0, failures };
}
```

### Action Execution

```typescript
private async executePokerAction(page, action, amount): Promise<boolean> {
  // 1. Fill amount input (for bet/raise)
  if (amount && ['bet', 'raise'].includes(action)) {
    await amountInput.fill(amount.toString());
  }
  // 2. Click action button
  await actionButton.click();
  // 3. Wait for state to advance
  await page.waitForTimeout(500);
  return true;
}
```

### Action Verification

After executing the action, the system verifies by checking if the hand has advanced:

```typescript
private async verifyActionResult(page, expectedHandId, expectedTurnId) {
  // Wait 1 second for state to update
  await page.waitForTimeout(1000);
  // Check if hand ID changed (action advanced the hand)
  const handCheck = await verifyHandId(page, expectedHandId);
  return {
    verified: !handCheck,  // Hand changed = action accepted
    details: { handId: newHandId, turnId: newTurnId }
  };
}
```

### Redis Lock for Duplicate Prevention

A Redis lock (`bot-action-lock:{botId}:{tableId}:{handId}:{turnId}`) prevents duplicate action execution for the same hand/turn:

```typescript
const lockKey = `bot-action-lock:${botId}:${tableId}:${handId}:${turnId}`;
const lockAcquired = await acquireLock(lockKey, 30); // 30 second TTL
if (!lockAcquired) {
  return { success: false, error: 'Duplicate action detected' };
}
```

This is essential because multiple workers could pick up the same job, or the job could be retried after a timeout.

## Mock Poker Mavens UI

For testing without a real Poker Mavens server, the project includes a mock UI at `mock-poker-ui/`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/login` | POST | Authenticate a bot session |
| `/api/lobby/tables` | GET | List available tables |
| `/api/table/:id/seat` | POST | Take a seat at a table |
| `/api/table/:id/leave` | POST | Leave a table |
| `/api/table/:id/state/:session` | GET | Read game state |
| `/api/table/:id/action` | POST | Execute a poker action |
| `/api/control/disconnect/:session` | POST | Toggle connection status |
| `/api/control/stale-turn/:session` | POST | Simulate stale turn |
| `/api/control/stale-hand/:session` | POST | Simulate stale hand |
| `/api/control/set-allowed-actions/:session` | POST | Control available actions |
| `/api/control/trigger-error/:session` | POST | Simulate error conditions |
| `/api/control/advance-street/:session` | POST | Force street transition |
| `/api/control/set-hero-turn/:session/:isTurn` | POST | Control whose turn it is |

The mock UI serves HTML with class names matching the default selectors, making it ideal for integration testing.
