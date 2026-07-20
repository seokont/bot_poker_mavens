# Decision Engine

## Overview

The decision engine computes poker actions for bots based on game state, strategy configuration, and difficulty level. It lives in the `@poker-bot/poker-engine` package and is invoked from the bot worker's `DecisionEngineService`.

## Architecture

```
DecisionEngineService (bot worker)
  │
  ├── Mode: internal → @poker-bot/poker-engine
  │     └── DecisionEngine
  │           ├── EasyStrategy
  │           ├── MediumStrategy
  │           └── HardStrategy (extensible, optional)
  │
  └── Mode: external → HTTP POST to DECISION_ENGINE_URL
        └── External service implements the same BotDecisionResult contract
```

## Interface Definition

```typescript
interface DecisionEngineInterface {
  decide(state: GameState, strategy: StrategyConfig): Promise<BotDecisionResult>;
}

interface BotDecisionResult {
  action: ActionType;      // FOLD | CHECK | CALL | BET | RAISE | ALL_IN
  amount?: number;         // Required for BET, RAISE, ALL_IN
  confidence: number;      // 0.0 - 1.0
  reason: string;          // Human-readable explanation
  metadata?: Record<string, unknown>;  // Additional debug info
}

interface StrategyConfig {
  id: string;
  name: string;
  difficulty: BotDifficulty;  // EASY | MEDIUM | HARD
  preflopRanges: Record<string, string>;
  aggression: number;         // 0.0 - 1.0
  bluffFrequency: number;     // 0.0 - 1.0
  cbetFrequency: number;      // 0.0 - 1.0
  betSizes: Record<string, number[]>;
  maxAllInThreshold: number;
  randomization: number;      // 0.0 - 1.0
  enabledGames: GameType[];
  configurationJson: Record<string, unknown>;
}
```

## Decision Flow

```
GameState + StrategyConfig
        │
        ▼
   DecisionEngine.decide()
        │
        ├── EASY → EasyStrategy.decide()
        ├── MEDIUM → MediumStrategy.decide()
        ├── HARD → HardStrategy.decide() || MediumStrategy.decide() (fallback)
        │
        ▼
   BotDecisionResult
        │
        ├── Validate: Is action in allowedActions?
        │     YES → continue
        │     NO  → getSafeFallback()
        │
        ├── Validate: Is amount in valid range?
        │     YES → return decision
        │     NO  → getSafeFallback()
        │
        └── On any exception → getSafeFallback()
```

## EASY Strategy Details

**File**: `packages/poker-engine/src/decision/easy-strategy.ts`

A conservative, tight-passive strategy suitable for beginners. No bluffing, minimal aggression.

### Core Logic

```typescript
class EasyStrategy {
  private handEvaluator: HandEvaluator;
  private potOddsCalc: PotOddsCalculator;
  private preflopRanges: PreflopRanges;

  decide(state: GameState, config: StrategyConfig): BotDecisionResult {
    // Preflop: classify hand by preflop ranges
    // Postflop: hand strength based decisions
  }
}
```

### Preflop Decision Matrix

| Hand Strength Group | Action Priority |
|---|---|
| PREMIUM (AA, KK, QQ, AKs) | Check > Call |
| STRONG (JJ, TT, AQs, AK) | Check > Call (if <= 3BB) |
| MEDIUM (99, 88, AQ, AJs) | Check > Call (if <= 3BB) |
| WEAK (all others) | Check > Call (if <= 1BB) > Fold |

### Postflop Decision Matrix

| Hand Strength | Action Priority |
|---|---|
| > 0.8 (very strong) | Check > Call |
| 0.6 - 0.8 (medium) | Check > Call (if pot odds < 30%) |
| < 0.6 (weak) | Check > Fold |

### Characteristics

- **VPIP**: 15-20% (plays only premium hands)
- **PFR**: 0% (never raises voluntarily)
- **Bluff frequency**: 0%
- **C-bet frequency**: 30% (only continuation bets with strong hands)
- **Aggression factor**: < 1.0 (passive)
- **3-bet**: Never
- **Fold to 3-bet**: Always unless premium

## MEDIUM Strategy Details

**File**: `packages/poker-engine/src/decision/medium-strategy.ts`

An intermediate strategy incorporating hand strength, pot odds, SPR (stack-to-pot ratio), and position awareness.

### Core Logic

```typescript
class MediumStrategy {
  private handEvaluator: HandEvaluator;
  private potOddsCalc: PotOddsCalculator;
  private sprCalc: SprCalculator;
  private betSizer: BetSizer;
  private preflopRanges: PreflopRanges;

  decide(state: GameState, config: StrategyConfig): BotDecisionResult {
    // 1. Check for short-stack all-in opportunity
    if (effectiveStack <= BB * 10 && handStrength > 0.6 && allInAllowed) → ALL_IN

    // 2. Premium hand (strength > 0.85) → value bet/raise
    if (handStrength > 0.85):
      if (hasRaise || hasBet) → BET/RAISE with suggested sizing
      otherwise → CHECK or CALL

    // 3. Medium hand (strength > 0.6) → pot odds decision
    if (handStrength > 0.6):
      CHECK → CALL if pot odds < 35% → FOLD

    // 4. Weak hand / bluff opportunity
    if (hasBet && !hasCheck && random() < bluffFrequency) → CBET bluff

    // 5. Fallback
    CHECK if available, otherwise FOLD
  }
}
```

### Short-Stack All-In Detection

```typescript
if (allowedAllIn && effectiveStack <= state.bigBlind * 10 && handResult.strength > 0.6) {
  return { action: ALL_IN, confidence: 0.7, reason: 'SHORT_STACK_ALL_IN' };
}
```

### Bet Sizing

The `BetSizer` provides street-appropriate bet sizes:

| Street | Bet Sizes (% of pot) |
|---|---|
| PREFLOP | 100% (open raise) |
| FLOP | 25%, 33%, 50%, 66%, 75%, 100% |
| TURN | 33%, 50%, 66%, 75%, 100% |
| RIVER | 33%, 50%, 66%, 75%, 100%, 125% |

For value bets with premium hands, the median size for the street is selected.

### Bluff Logic

```typescript
// Contuation bet bluff on flop when checked to
if (hasBet && !hasCheck && Math.random() < config.bluffFrequency) {
  const cbetSize = state.pot * 0.5;
  return { action: BET, amount: cbetSize, confidence: 0.3, reason: 'MEDIUM_CBET_BLUFF' };
}
```

Bluff frequency defaults to 15% (configurable).

### Characteristics

- **VPIP**: 20-30%
- **PFR**: 10-15%
- **Bluff frequency**: 15% (configurable)
- **C-bet frequency**: 60% (configurable)
- **Aggression factor**: ~2.0
- **3-bet**: Occasional with premium hands
- **Fold to 3-bet**: Based on pot odds and hand strength

## HARD Extension Points

The HARD strategy is designed as an extension point. Currently, if no external HARD strategy is registered, it falls back to the MEDIUM strategy.

```typescript
export interface HardStrategyInterface {
  decide(state: GameState, config: StrategyConfig): Promise<BotDecisionResult>;
}

class DecisionEngine {
  private hardStrategy: HardStrategyInterface | null = null;

  setHardStrategy(strategy: HardStrategyInterface) {
    this.hardStrategy = strategy;
  }
}
```

### Implementing a HARD Strategy

```typescript
import { HardStrategyInterface, GameState, StrategyConfig, BotDecisionResult } from '@poker-bot/poker-engine';

class MyGTOStrategy implements HardStrategyInterface {
  async decide(state: GameState, config: StrategyConfig): Promise<BotDecisionResult> {
    // Advanced logic: range-based, GTO solver, ML model, etc.
    return {
      action: 'RAISE',
      amount: 24,
      confidence: 0.75,
      reason: 'GTO_RANGE_BASED_RAISE',
      metadata: { exploitFactor: 1.2, rangeAdvantage: 0.62 }
    };
  }
}

// Register with the engine
const engine = new DecisionEngine();
engine.setHardStrategy(new MyGTOStrategy());
```

Suggested enhancements for a production HARD strategy:
- **Range-based decision trees**: Full preflop and postflop range matrices
- **GTO approximation**: Solvers or pre-computed solution lookups
- **Opponent modeling**: Track opponent tendencies and adjust
- **Exploit detection**: Identify and exploit predictable patterns
- **Multi-street planning**: Consider future streets in current decisions
- **ML integration**: TensorFlow.js or ONNX runtime for neural network models

## Safe Fallback Logic

When the decision engine encounters any error (timeout, invalid state, exception), it falls back to a safe default:

```typescript
function getSafeFallback(state: GameState): BotDecisionResult {
  // Prefer CHECK if available (preserves position)
  const hasCheck = state.allowedActions.some(a => a.action === 'CHECK');
  if (hasCheck) {
    return {
      action: 'CHECK',
      confidence: 1,
      reason: 'SAFE_FALLBACK_CHECK',
    };
  }
  // Otherwise FOLD (minimizes loss)
  return {
    action: 'FOLD',
    confidence: 1,
    reason: 'SAFE_FALLBACK_FOLD',
  };
}
```

### When Fallback is Triggered

1. Decision engine throws an exception
2. Decision action is not in `allowedActions`
3. Decision amount is negative or exceeds `heroStack`
4. External decision engine returns non-200 status
5. External decision engine times out (`DECISION_ENGINE_TIMEOUT_MS`)
6. Dynamic import of `@poker-bot/poker-engine` fails

### Fallback Hierarchy

```
Bluff suggestion rejected (not allowed) ──► CHECK (if available) ──► FOLD
Value bet rejected (bad sizing) ──► CHECK (if available) ──► FOLD
Engine exception ──► CHECK (if available) ──► FOLD
External timeout ──► CHECK (if available) ──► FOLD
```
