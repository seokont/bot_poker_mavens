# Bot State Machine

## Overview

The bot state machine is a finite state machine (FSM) implemented in `apps/bot-worker/src/state-machine/bot-state-machine.ts`. It manages the lifecycle of each bot through 20 distinct states with validated transitions.

The state machine is used by the `WorkerService` to track bot progress through login, table navigation, hand play, error recovery, and shutdown. Invalid transitions are logged and rejected.

## States

There are 20 states covering every phase of bot operation:

| # | State | Description |
|---|---|---|
| 1 | OFFLINE | Bot is not running. Initial state for all bots. |
| 2 | STARTING | Bot start command received, initializing resources |
| 3 | BROWSER_CREATED | Playwright browser launched successfully |
| 4 | AUTHORIZING | Navigating to Poker Mavens and logging in |
| 5 | IN_LOBBY | Bot is authenticated and in the poker lobby |
| 6 | OPENING_TABLE | Bot navigating to a specific table |
| 7 | WAITING_FOR_SEAT | Table open, looking for an available seat |
| 8 | BUYING_IN | Seat selected, submitting buy-in amount |
| 9 | SEATED | Bot is seated at a table, waiting for hands |
| 10 | WAITING_FOR_HAND | Bot is waiting for the next hand to deal |
| 11 | IN_HAND | Bot is participating in a hand |
| 12 | WAITING_FOR_TURN | Bot's action is pending (hero's turn) |
| 13 | DECIDING | Bot is computing a decision via the decision engine |
| 14 | EXECUTING_ACTION | Bot is clicking the action button in the browser |
| 15 | WAITING_FOR_NEXT_STATE | Action submitted, waiting for game state to advance |
| 16 | SITTING_OUT | Bot is sitting out (voluntarily or forced) |
| 17 | LEAVING_TABLE | Bot is leaving the current table |
| 18 | RECONNECTING | Bot lost connection and is attempting to reconnect |
| 19 | STOPPING | Bot stop command received, cleaning up |
| 20 | ERROR | Bot encountered an unrecoverable error |

## Valid Transitions

The following table shows all valid state transitions. A blank cell means the transition is not allowed.

| From \\ To | OFFLINE | STARTING | BROWSER_CREATED | AUTHORIZING | IN_LOBBY | OPENING_TABLE | WAITING_FOR_SEAT | BUYING_IN | SEATED | WAITING_FOR_HAND | IN_HAND | WAITING_FOR_TURN | DECIDING | EXECUTING_ACTION | WAITING_FOR_NEXT_STATE | SITTING_OUT | LEAVING_TABLE | RECONNECTING | STOPPING | ERROR |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OFFLINE | - | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| STARTING | - | - | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Y |
| BROWSER_CREATED | - | - | - | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Y |
| AUTHORIZING | - | - | - | - | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | Y | Y |
| IN_LOBBY | - | - | - | - | - | Y | - | - | - | - | - | - | - | - | - | - | - | - | Y | Y |
| OPENING_TABLE | - | - | - | - | Y | - | Y | - | - | - | - | - | - | - | - | - | - | - | - | Y |
| WAITING_FOR_SEAT | - | - | - | - | Y | - | - | Y | - | - | - | - | - | - | - | - | - | - | - | Y |
| BUYING_IN | - | - | - | - | Y | - | - | - | Y | - | - | - | - | - | - | - | - | - | - | Y |
| SEATED | - | - | - | - | - | - | - | - | - | Y | - | - | - | - | - | Y | Y | - | Y | Y |
| WAITING_FOR_HAND | - | - | - | - | - | - | - | - | - | - | Y | - | - | - | - | Y | Y | Y | Y | Y |
| IN_HAND | - | - | - | - | - | - | - | - | - | - | - | Y | - | - | - | Y | - | Y | Y | Y |
| WAITING_FOR_TURN | - | - | - | - | - | - | - | - | - | - | - | - | Y | - | - | Y | - | Y | - | Y |
| DECIDING | - | - | - | - | - | - | - | - | - | - | - | - | - | Y | Y | - | - | Y | - | Y |
| EXECUTING_ACTION | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Y | - | - | - | - | Y |
| WAITING_FOR_NEXT_STATE | - | - | - | - | - | - | - | - | Y | Y | Y | Y | - | - | - | - | Y | - | Y | Y |
| SITTING_OUT | - | - | - | - | - | - | - | - | Y | Y | - | - | - | - | - | - | Y | - | Y | Y |
| LEAVING_TABLE | - | - | - | - | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | Y | Y |
| RECONNECTING | - | - | - | - | Y | - | - | - | Y | Y | Y | - | - | - | - | - | - | - | Y | Y |
| STOPPING | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Y |
| ERROR | Y | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Y | Y | - |

## State Groups

### Lifecycle States
- **OFFLINE** -> **STARTING** -> **BROWSER_CREATED** -> **AUTHORIZING** -> **IN_LOBBY**

### Table Navigation
- **IN_LOBBY** -> **OPENING_TABLE** -> **WAITING_FOR_SEAT** -> **BUYING_IN** -> **SEATED**

### Hand Play (Core Loop)
- **SEATED** -> **WAITING_FOR_HAND** -> **IN_HAND** -> **WAITING_FOR_TURN** -> **DECIDING** -> **EXECUTING_ACTION** -> **WAITING_FOR_NEXT_STATE** -> (back to **WAITING_FOR_HAND** or **IN_HAND**)

### Recovery
- Any playing state -> **RECONNECTING** -> (back to **IN_LOBBY**, **SEATED**, or **IN_HAND**)
- **ERROR** -> **STARTING** (retry) or **RECONNECTING** (reconnect) or **STOPPING** (give up)

### Termination
- Any state -> **STOPPING** -> **OFFLINE**

## Guard Conditions

Each state transition is guarded by conditions in the `WorkerService`. These are the checks performed before or after each transition:

| Transition | Guard Condition |
|---|---|
| STARTING -> BROWSER_CREATED | `ResourceManager.canStartNewBot()` - CPU, memory, and bot count must be within limits |
| BROWSER_CREATED -> AUTHORIZING | Playwright browser context must be created successfully |
| AUTHORIZING -> IN_LOBBY | Login form must be submitted and authenticated successfully |
| IN_LOBBY -> OPENING_TABLE | Table must exist in the database and be allowed for bots |
| OPENING_TABLE -> WAITING_FOR_SEAT | Table page must load successfully |
| WAITING_FOR_SEAT -> BUYING_IN | An empty seat must be available |
| BUYING_IN -> SEATED | Buy-in amount must be within allowed range and confirmed |
| WAITING_FOR_HAND -> IN_HAND | Hand ID must be detected on the page |
| IN_HAND -> WAITING_FOR_TURN | Hero turn indicator must be visible |
| WAITING_FOR_TURN -> DECIDING | Game state must be fully readable |
| DECIDING -> EXECUTING_ACTION | Decision must be a valid, allowed action with valid amount |
| EXECUTING_ACTION -> WAITING_FOR_NEXT_STATE | Redis lock must be acquired (prevents duplicate actions) |
| WAITING_FOR_NEXT_STATE -> * | Preflight checks: correct table, seated, hand ID match, turn ID match |
| SEATED -> SITTING_OUT | Sit out button must be visible |
| SITTING_OUT -> SEATED | Sit in button must be visible |
| * -> RECONNECTING | Browser disconnect detected or heartbeat timeout (>BOT_HEARTBEAT_INTERVAL_MS * 3) |
| RECONNECTING -> * | Reconnection service verifies authentication and table seating |
| * -> STOPPING | Stop command received via queue |
| * -> ERROR | Any unhandled exception in bot operation |
| STOPPING -> OFFLINE | All Playwright contexts closed and resources released |
| ERROR -> RECONNECTING | `BOT_MAX_RECONNECT_ATTEMPTS` not yet exhausted |
| ERROR -> STOPPING | `BOT_MAX_RECONNECT_ATTEMPTS` exhausted or fatal error |

## Action States

The state machine tracks three specific states for action sequencing:

```typescript
isWaitingForTurn(botId: string): boolean    // BotState.WAITING_FOR_TURN
isDeciding(botId: string): boolean           // BotState.DECIDING
isExecutingAction(botId: string): boolean    // BotState.EXECUTING_ACTION
isInActionState(botId: string): boolean      // Any of the above three
```

These helper methods are used by the `DecisionEngine` and `ActionExecutor` to verify the bot is in the correct state before proceeding.

## Error Recovery Paths

### Connection Loss

```
[Any Playing State] ──► RECONNECTING ──► Attempt 1: {5s delay}
                           │                    ├─ Success: IN_LOBBY / SEATED / IN_HAND
                           │                    └─ Failure: Attempt 2: {10s delay}
                           │                         ├─ Success: ...
                           │                         └─ ...up to BOT_MAX_RECONNECT_ATTEMPTS
                           │
                           └── All attempts failed ──► ERROR
```

Backoff delays: `[5000, 10000, 20000, 40000, 60000]` milliseconds.

### Browser Crash

```
[Any State] ──► ERROR ──► STARTING (full restart)
                   │
                   └──► STOPPING ──► OFFLINE (manual recovery required)
```

### Action Failure

```
EXECUTING_ACTION ──► (action fails preflight checks)
    │
    ├── Invalid table ──► LEAVING_TABLE ──► IN_LOBBY ──► try OPENING_TABLE again
    ├── Not hero turn ──► WAITING_FOR_TURN (wait and retry)
    ├── Stale hand/turn ──► WAITING_FOR_NEXT_STATE (re-read state)
    ├── Duplicate action (lock exists) ──► WAITING_FOR_NEXT_STATE (skip)
    └── Amount out of range ──► DECIDING (re-decide with corrected amount)
```

### Session Lost (Heartbeat Timeout)

```
[Backend detects no heartbeat for >30s]
    │
    ├── Mark session as LOST
    ├── Set bot status to ERROR
    └── Enqueue RECONNECT_BOT job
```

## State Machine API

```typescript
class BotStateMachine {
  getCurrentState(botId: string): BotState;
  setState(botId: string, state: BotState): boolean;     // Returns false if invalid transition
  canTransitionTo(from: BotState, to: BotState): boolean;
  isWaitingForTurn(botId: string): boolean;
  isDeciding(botId: string): boolean;
  isExecutingAction(botId: string): boolean;
  isInActionState(botId: string): boolean;
  forceSetState(botId: string, state: BotState): void;   // Bypasses validation (recovery use)
  removeBot(botId: string): void;
}
```

## Usage Example

```typescript
const stateMachine = new BotStateMachine();

// Bot starts
stateMachine.setState('bot-1', BotState.STARTING);        // OFFLINE -> STARTING: true
stateMachine.setState('bot-1', BotState.BROWSER_CREATED);  // STARTING -> BROWSER_CREATED: true

// Bot is playing a hand
stateMachine.setState('bot-1', BotState.WAITING_FOR_TURN); // IN_HAND -> WAITING_FOR_TURN: true

// Check if bot can act
stateMachine.isWaitingForTurn('bot-1'); // true

// Invalid transition - logged and rejected
stateMachine.setState('bot-1', BotState.BROWSER_CREATED);  // WAITING_FOR_TURN -> BROWSER_CREATED: false

// Recovery - force set bypasses validation
stateMachine.forceSetState('bot-1', BotState.RECONNECTING);

// Cleanup
stateMachine.removeBot('bot-1');
```
