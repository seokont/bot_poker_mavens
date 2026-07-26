# Position and hasFolded Tracking Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `GameStateReader.readForDecision()` report the hero's real table position and each opponent's real folded status instead of hardcoded `Position.BTN` / `hasFolded: false`, so `MediumStrategy`'s preflop range selection and short-stack all-in detection operate on correct inputs.

**Architecture:** Extract two pure functions (`resolvePosition`, `resolveFoldedPlayers`) into a new `state-derivation.ts` module — no `Page`/Playwright dependency, fully unit-testable. Wire them into the existing `readForDecision()` method, replacing the two hardcoded fields. Gate the change behind a live-table verification pass before it's trusted in production, since it depends on an unconfirmed DOM-ordering assumption.

**Tech Stack:** TypeScript, ts-node (no test framework — this codebase's `poker-engine` package uses a hand-rolled `assert()` + `runAll()` pattern instead of Jest/Vitest; this plan follows that same convention since `apps/bot-worker` has no test framework configured either).

## Global Constraints

- Do not change `MediumStrategy`'s aggression, fold-frequency caps, or bluff frequency — intentional per `bot.md`, explicitly out of scope (see design spec `docs/superpowers/specs/2026-07-26-position-and-fold-tracking-fix-design.md`).
- Do not change `EasyStrategy` or the `HardStrategy` extension point.
- Do not wire up `equity-estimator.ts` / `opponent-range-estimator.ts` — separate potential follow-up.
- No new DOM selectors for `hasFolded` — derive it from `actionHistory`, which is already read.
- `Position` enum (`SB, BB, UTG, UTG1, MP, HJ, CO, BTN` — `packages/shared-types/src/enums/index.ts:86-95`) must not be modified; the fix maps onto these 8 existing values only.

---

### Task 1: Pure `resolvePosition` and `resolveFoldedPlayers` functions with tests

**Files:**
- Create: `apps/bot-worker/src/game-state-reader/state-derivation.ts`
- Create: `apps/bot-worker/src/game-state-reader/__tests__/state-derivation.spec.ts`
- Create: `apps/bot-worker/src/game-state-reader/__tests__/run.ts`

**Interfaces:**
- Produces: `resolvePosition(seats: { seatIndex: number; isDealer: boolean }[], heroSeatIndex: number): Position` — computes hero's position by walking clockwise from the dealer seat through a table-size-appropriate compression of the 8 `Position` values. Falls back to `Position.BTN` if the dealer can't be found in `seats`, if `heroSeatIndex` isn't in `seats`, or if `seats` is empty (same degraded behavior as today, but now only on genuine read failure instead of always).
- Produces: `resolveFoldedPlayers(actionHistory: { playerName: string; action: string }[]): Set<string>` — returns the set of player names with at least one fold-like action (case-insensitive substring match on `'fold'`, matching the existing `mapHistoryAction()` convention in `game-state-reader.ts:480-489`) anywhere in the given history.
- Consumes: `Position` from `@poker-bot/shared-types` (already a workspace dependency of `apps/bot-worker`).

- [ ] **Step 1: Write the failing test file**

Create `apps/bot-worker/src/game-state-reader/__tests__/state-derivation.spec.ts`:

```typescript
import { Position } from '@poker-bot/shared-types';
import { resolvePosition, resolveFoldedPlayers } from '../state-derivation';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function seats(pairs: Array<[seatIndex: number, isDealer: boolean]>) {
  return pairs.map(([seatIndex, isDealer]) => ({ seatIndex, isDealer }));
}

function testHeadsUp(): void {
  const table = seats([[0, true], [1, false]]);
  assert(resolvePosition(table, 0) === Position.BTN, 'heads-up: dealer seat should be BTN');
  assert(resolvePosition(table, 1) === Position.BB, 'heads-up: non-dealer seat should be BB');
}

function testThreeMax(): void {
  const table = seats([[0, false], [1, true], [2, false]]);
  assert(resolvePosition(table, 1) === Position.BTN, '3-max: dealer should be BTN');
  assert(resolvePosition(table, 2) === Position.SB, '3-max: seat after dealer should be SB');
  assert(resolvePosition(table, 0) === Position.BB, '3-max: seat two after dealer should be BB');
}

function testSixMax(): void {
  // Seats 0..5, dealer at seat 2. Clockwise from dealer: 2=BTN,3=SB,4=BB,5=UTG,0=HJ,1=CO.
  const table = seats([[0, false], [1, false], [2, true], [3, false], [4, false], [5, false]]);
  assert(resolvePosition(table, 2) === Position.BTN, '6-max: dealer seat should be BTN');
  assert(resolvePosition(table, 3) === Position.SB, '6-max: seat+1 from dealer should be SB');
  assert(resolvePosition(table, 4) === Position.BB, '6-max: seat+2 from dealer should be BB');
  assert(resolvePosition(table, 5) === Position.UTG, '6-max: seat+3 from dealer should be UTG');
  assert(resolvePosition(table, 0) === Position.HJ, '6-max: seat+4 from dealer (wrapped) should be HJ');
  assert(resolvePosition(table, 1) === Position.CO, '6-max: seat+5 from dealer (wrapped) should be CO');
}

function testEightMax(): void {
  // Seats 0..7, dealer at seat 0. Clockwise: 0=BTN,1=SB,2=BB,3=UTG,4=UTG1,5=MP,6=HJ,7=CO.
  const table = seats([
    [0, true], [1, false], [2, false], [3, false],
    [4, false], [5, false], [6, false], [7, false],
  ]);
  assert(resolvePosition(table, 4) === Position.UTG1, '8-max: seat+4 from dealer should be UTG1');
  assert(resolvePosition(table, 5) === Position.MP, '8-max: seat+5 from dealer should be MP');
}

function testFallbacksOnUnreadableTable(): void {
  const noDealer = seats([[0, false], [1, false]]);
  assert(resolvePosition(noDealer, 0) === Position.BTN, 'no dealer found: should fall back to BTN');

  const table = seats([[0, true], [1, false]]);
  assert(resolvePosition(table, 99) === Position.BTN, 'hero seat not found: should fall back to BTN');

  assert(resolvePosition([], 0) === Position.BTN, 'empty table: should fall back to BTN');
}

function testResolveFoldedPlayers(): void {
  const history = [
    { playerName: 'Alice', action: 'fold' },
    { playerName: 'Bob', action: 'call 20' },
    { playerName: 'Carol', action: 'Folds' },
    { playerName: 'Bob', action: 'raise 40' },
  ];
  const folded = resolveFoldedPlayers(history);
  assert(folded.has('Alice'), 'Alice folded and should be in the set');
  assert(folded.has('Carol'), 'Carol folded (capitalized action text) and should be in the set');
  assert(!folded.has('Bob'), 'Bob never folded and should not be in the set');
}

function testResolveFoldedPlayersEmptyHistory(): void {
  const folded = resolveFoldedPlayers([]);
  assert(folded.size === 0, 'empty history should produce an empty set');
}

export function runAll(): number {
  const tests: Array<{ name: string; fn: () => void }> = [
    { name: 'resolvePosition: heads-up', fn: testHeadsUp },
    { name: 'resolvePosition: 3-max', fn: testThreeMax },
    { name: 'resolvePosition: 6-max', fn: testSixMax },
    { name: 'resolvePosition: 8-max', fn: testEightMax },
    { name: 'resolvePosition: fallbacks', fn: testFallbacksOnUnreadableTable },
    { name: 'resolveFoldedPlayers: basic', fn: testResolveFoldedPlayers },
    { name: 'resolveFoldedPlayers: empty history', fn: testResolveFoldedPlayersEmptyHistory },
  ];

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAIL  ${name}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed;
}
```

Create `apps/bot-worker/src/game-state-reader/__tests__/run.ts`:

```typescript
import { runAll } from './state-derivation.spec';

const failed = runAll();

process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from repo root): `cd apps/bot-worker && npx ts-node src/game-state-reader/__tests__/run.ts`

Expected: fails to compile / run with a "Cannot find module '../state-derivation'" error, since `state-derivation.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/bot-worker/src/game-state-reader/state-derivation.ts`:

```typescript
import { Position } from '@poker-bot/shared-types';

/**
 * Position compression by table size, indexed by clockwise offset from the
 * dealer (offset 0 = BTN, the dealer's own seat). As the table shrinks from
 * 8-max, positions drop in this order: UTG1, then MP, then UTG, then HJ,
 * then CO, then SB merges into BTN at heads-up - this keeps SB/BB/BTN as
 * anchors at every table size, matching how PreflopRanges.positionShift()
 * treats them as distinct shift tiers.
 */
const TABLE_SIZE_ORDER: Record<number, Position[]> = {
  1: [Position.BTN],
  2: [Position.BTN, Position.BB],
  3: [Position.BTN, Position.SB, Position.BB],
  4: [Position.BTN, Position.SB, Position.BB, Position.CO],
  5: [Position.BTN, Position.SB, Position.BB, Position.HJ, Position.CO],
  6: [Position.BTN, Position.SB, Position.BB, Position.UTG, Position.HJ, Position.CO],
  7: [Position.BTN, Position.SB, Position.BB, Position.UTG, Position.MP, Position.HJ, Position.CO],
  8: [
    Position.BTN, Position.SB, Position.BB, Position.UTG,
    Position.UTG1, Position.MP, Position.HJ, Position.CO,
  ],
};

/**
 * Computes the hero's position by finding their clockwise seat offset from
 * the dealer button among currently-occupied seats. Falls back to BTN (the
 * previous unconditional default) whenever the table can't be read reliably
 * - no dealer found, hero's seat missing from the list, or no seats at all -
 * so a DOM read hiccup degrades to the old behavior instead of throwing.
 */
export function resolvePosition(
  seats: { seatIndex: number; isDealer: boolean }[],
  heroSeatIndex: number,
): Position {
  const occupied = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const n = occupied.length;
  if (n === 0) return Position.BTN;

  const dealerPos = occupied.findIndex((s) => s.isDealer);
  const heroPos = occupied.findIndex((s) => s.seatIndex === heroSeatIndex);
  if (dealerPos === -1 || heroPos === -1) return Position.BTN;

  const offset = (heroPos - dealerPos + n) % n;
  const order = TABLE_SIZE_ORDER[Math.min(n, 8)];
  return order[offset] ?? Position.BTN;
}

/**
 * Derives which players have folded in the current hand from the action
 * log, matching the same case-insensitive 'fold' substring match already
 * used by mapHistoryAction() in game-state-reader.ts for the same raw
 * action strings.
 */
export function resolveFoldedPlayers(
  actionHistory: { playerName: string; action: string }[],
): Set<string> {
  const folded = new Set<string>();
  for (const entry of actionHistory) {
    if (entry.action.toLowerCase().includes('fold')) {
      folded.add(entry.playerName);
    }
  }
  return folded;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/bot-worker && npx ts-node src/game-state-reader/__tests__/run.ts`
Expected: `7 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add apps/bot-worker/src/game-state-reader/state-derivation.ts apps/bot-worker/src/game-state-reader/__tests__/state-derivation.spec.ts apps/bot-worker/src/game-state-reader/__tests__/run.ts
git commit -m "feat: add pure position and fold-tracking resolvers for game state reader"
```

---

### Task 2: Wire the resolvers into `readForDecision()`

**Files:**
- Modify: `apps/bot-worker/src/game-state-reader/game-state-reader.ts:284` (the `players` mapping) and `apps/bot-worker/src/game-state-reader/game-state-reader.ts:274` (the `position` field)

**Interfaces:**
- Consumes: `resolvePosition` and `resolveFoldedPlayers` from `./state-derivation` (Task 1).
- Consumes: `rawPlayers: PlayerState[]` (already destructured at `game-state-reader.ts:219`, each entry has `seatIndex: number` and `isDealer: boolean` — structurally satisfies `resolvePosition`'s `seats` parameter) and `rawHistory: ActionEntry[]` (already destructured at the same line, each entry has `playerName: string` and `action: string` — structurally satisfies `resolveFoldedPlayers`'s parameter) and `heroSeatIndex: number` (already destructured at the same line).

- [ ] **Step 1: Add the import**

In `apps/bot-worker/src/game-state-reader/game-state-reader.ts`, add after the existing `@poker-bot/shared-types` import block (after line 16):

```typescript
import { resolvePosition, resolveFoldedPlayers } from './state-derivation';
```

- [ ] **Step 2: Compute folded players and pass them into the `players` mapping**

Find this block (currently at `game-state-reader.ts:237-249`):

```typescript
    const players: TablePlayerState[] = rawPlayers.map((p) => ({
      playerId: `seat-${p.seatIndex}`,
      playerName: p.name,
      seatNumber: p.seatIndex,
      stack: p.stack,
      currentBet: p.bet,
      isHero: p.isHero,
      isDealer: p.isDealer,
      // Best-effort: without a reliable "folded" indicator we treat a
      // non-active, non-hero seat conservatively as still live.
      hasFolded: false,
      isAllIn: false,
    }));
```

Replace it with:

```typescript
    const foldedPlayerNames = resolveFoldedPlayers(rawHistory);

    const players: TablePlayerState[] = rawPlayers.map((p) => ({
      playerId: `seat-${p.seatIndex}`,
      playerName: p.name,
      seatNumber: p.seatIndex,
      stack: p.stack,
      currentBet: p.bet,
      isHero: p.isHero,
      isDealer: p.isDealer,
      hasFolded: foldedPlayerNames.has(p.name),
      isAllIn: false,
    }));
```

- [ ] **Step 3: Replace the hardcoded `position` field**

Find this line (currently `game-state-reader.ts:274`):

```typescript
      position: Position.BTN,
```

Replace it with:

```typescript
      position: resolvePosition(rawPlayers, heroSeatIndex),
```

`Position.BTN` on this line is the only usage of the `Position` import in the entire file (confirmed by search) — after this edit the import is unused. Remove `Position,` from the `@poker-bot/shared-types` import block at the top of the file (currently `game-state-reader.ts:3-16`), since `tsconfig.base.json` has `noUnusedLocals: true` and will fail the build otherwise.

- [ ] **Step 4: Type-check the package**

Run: `cd apps/bot-worker && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/bot-worker/src/game-state-reader/game-state-reader.ts
git commit -m "fix: derive real position and hasFolded instead of hardcoded BTN/false"
```

---

### Task 3: Live verification on the Poker Mavens demo table (required gate before trusting this in play)

This task has no automated test — it validates an assumption Task 1/2's logic depends on (that `seatIndex`, the DOM order of `.seat` elements, matches real clockwise seating order) against the actual Poker Mavens client, which can only be checked by observing a live/demo table. This follows the same verification pattern used for prior DOM-assumption fixes in this codebase (seat selection: commits `d3cbf72`, `675f62e`).

**Files:**
- Temporarily modify (and revert after verification): `apps/bot-worker/src/game-state-reader/game-state-reader.ts` (`readForDecision()`), to add one diagnostic log line.

**Interfaces:**
- Consumes: the running bot-worker's existing logger (`pino`, already a dependency per `apps/bot-worker/package.json`) and whatever debug-snapshot mechanism the worker already uses for error capture (`WorkerService.captureDebugSnapshot()` / `GameStateReader.debugSnapshot()`, referenced in `worker.service.ts:1159` and `game-state-reader.ts:153` respectively) — reuse these rather than inventing a new logging path.

- [ ] **Step 1: Add a temporary diagnostic log**

`GameStateReader` has no injected logger (confirmed: no `logger`/`Logger` field anywhere in `game-state-reader.ts`), so use `console.log` directly for this temporary diagnostic. In `readForDecision()`, immediately before the final `return { ... }` statement, add:

```typescript
    console.log(
      `[position-check] heroSeat=${heroSeatIndex} dealer=${rawPlayers.find((p) => p.isDealer)?.seatIndex} ` +
      `seats=${rawPlayers.map((p) => `${p.seatIndex}:${p.name}${p.isDealer ? '(D)' : ''}`).join(',')} ` +
      `resolvedPosition=${resolvePosition(rawPlayers, heroSeatIndex)}`,
    );
```

- [ ] **Step 2: Run the bot-worker against the Poker Mavens demo table**

Start the worker per the project's existing dev workflow (`apps/bot-worker`'s `dev` script) pointed at a demo-mode bot/table, and play through at least 3 full orbits (enough hands for the dealer button to visit every seat at the table at least once).

- [ ] **Step 3: Compare logged output against the visible table**

For each hand, compare the `[position-check]` log line against what's actually visible in the Poker Mavens UI at that moment: does `resolvedPosition` match the hero's real position (e.g., does it say `BTN` only on hands where the hero visibly has the dealer button, `SB`/`BB` only on hands where the hero is visibly posting those blinds)? Record any mismatch with the hand's seat layout.

- **If all orbits match:** `seatIndex` ordering is confirmed clockwise; the Task 1/2 implementation is correct as-is. Proceed to Step 4.
- **If mismatches are found:** `seatIndex` does not correspond to physical clockwise order. Do not remove the diagnostic log yet — instead capture the exact mismatching seat layout (which `seatIndex` values map to which physical seats) and treat this as a new finding requiring a follow-up fix (an explicit seat-index-to-clockwise-order mapping table) before Task 1/2 can be trusted. This is out of this plan's scope to fix blindly without seeing the real mismatch pattern.

- [ ] **Step 4: Remove the temporary diagnostic log (only after a successful verification in Step 3)**

Revert the log line added in Step 1.

Run: `cd apps/bot-worker && npx tsc --noEmit` to confirm the revert is clean.

- [ ] **Step 5: Commit the revert (or, if Step 1's log is being kept intentionally as ongoing diagnostics, commit as-is with a clear message)**

```bash
git add apps/bot-worker/src/game-state-reader/game-state-reader.ts
git commit -m "chore: remove temporary position-check diagnostic after live verification"
```

## Self-Review Notes

- **Spec coverage:** Design spec's "Fix 1" → Task 1 + Task 2 Step 2. "Fix 2" → Task 1 + Task 2 Step 3. "Live verification" → Task 3. "Testing" section → Task 1's test file. "Non-goals" are respected (no strategy files touched). "Expectation setting" was communicated to the user directly in conversation, not a code task.
- **Placeholder scan:** No TBD/TODO markers; Task 3 explicitly branches on the two possible verification outcomes instead of assuming success.
- **Type consistency:** `resolvePosition(seats, heroSeatIndex)` and `resolveFoldedPlayers(actionHistory)` signatures are identical between Task 1 (definition + tests) and Task 2 (call sites).
