# Fix Position and hasFolded Tracking in GameStateReader

## Problem

The bot (running MEDIUM strategy against live opponents on a demo/play-money
table) loses consistently. MEDIUM's loose-aggressive identity is intentional
(`bot.md`, confirmed by operator) and out of scope for this change.

Investigation (via graphify + direct reads of `game-state-reader.ts` and
`medium-strategy.ts`) found two data-correctness bugs in
`GameStateReader.readForDecision()` that feed wrong inputs into the strategy,
independent of its aggression tuning:

1. **`position` is hardcoded to `Position.BTN`** (game-state-reader.ts:274).
   `PreflopRanges.positionShift()` gives BTN a +2 shift (widest range) vs. -1
   for UTG — a 3-tier swing in `HandStrengthGroup`. The bot always opens/calls
   preflop as if on the button, regardless of actual seat, which is a
   systematic preflop leak from early position.

2. **`hasFolded` is hardcoded to `false`** for every non-hero player
   (game-state-reader.ts:247), with a comment noting no reliable folded
   indicator was found at the time. This means `activePlayerCount` never
   decreases within a hand, which corrupts:
   - `isHeadsUp` / `isMultiway` detection in `medium-strategy.ts`
   - `effectiveStack` (`Math.min` over all non-hero players' stacks,
     including ones already folded this hand) and the SPR/short-stack-all-in
     check derived from it — can trigger a spurious all-in shove.

Both are pure data bugs, not strategy-philosophy issues, and were confirmed
by reading the source directly (not inferred).

## Fix 1: `hasFolded` from `actionHistory`

`readForDecision()` already reads `actionHistory` (used elsewhere for
check-raise detection via `state.actionHistory.some(...)`, an established
trusted pattern in this codebase). Build a `Set<playerName>` of every player
with a `FOLD` action in the current hand's history, and use it when mapping
`players[].hasFolded` instead of the hardcoded `false`. No new DOM selectors
needed.

Edge case: action history is scoped to the current hand only (a fold from a
previous hand must not carry over) — confirm `readActionHistory` is already
reset/scoped per hand before relying on it here.

## Fix 2: `position` from seat geometry

Add a private method:

```typescript
resolvePosition(players: TablePlayerState[], heroSeatIndex: number): Position
```

Steps:
1. Filter `.seat` DOM results down to actually-occupied seats (empty seats
   currently produce placeholder `Player N` / stack 0 entries — exact filter
   criteria to be confirmed during live verification).
2. Sort by `seatIndex`, locate the dealer (`isDealer`) within that list.
3. Compute hero's clockwise offset from the dealer, modulo occupied-seat
   count.
4. Map `(offset, occupiedSeatCount)` to a `Position` value via a standard
   position-compression table for 2–8 handed play, reusing the existing
   8-value `Position` enum (`SB, BB, UTG, UTG1, MP, HJ, CO, BTN`) — no enum
   changes.

## Live verification (required before merge)

Following this project's established pattern for DOM-assumption fixes (seat
selection: `d3cbf72`, `675f62e`), verify against a live Poker Mavens demo
table:
- `seatIndex` (DOM order of `.seat` elements) matches actual clockwise seating
  order around the table.
- The `.dealer-indicator` / `.dealer-chip` selector (already used for
  `isDealer`) reliably identifies the dealer across multiple hands, including
  when the button moves.

If DOM order does not match physical clockwise order, `resolvePosition` needs
an explicit seat-position mapping instead of a simple modulo offset — decide
this only after the live check.

## Testing

- Unit tests for `resolvePosition` covering 2/3/6/8-max tables with the
  dealer in different seats.
- Unit test for `hasFolded` derivation from a partially-folded
  `actionHistory`.
- Existing `poker-engine.spec.ts` suite continues to cover strategy behavior
  unchanged — only its inputs become correct.

## Non-goals

- No changes to MEDIUM's aggression, fold-frequency caps, or bluff
  frequency — that identity is intentional per `bot.md` and explicitly out of
  scope.
- No changes to EASY or HARD strategies.
- Not wiring up `equity-estimator.ts` / `opponent-range-estimator.ts` (both
  currently unused) — separate potential follow-up, not required here.

## Expectation setting

These fixes remove a systematic EV leak (playing every position as if on the
button, and spurious short-stack shoves from stale stack data). They should
meaningfully improve win rate against an attentive human opponent, but cannot
guarantee winning any individual session — poker outcomes vary with sample
size and opponent skill.
