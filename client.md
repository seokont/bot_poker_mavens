You are developing poker bot behavior for a Poker Mavens server.

The current problem is that the bots fold too often, including situations where they already have a made poker hand.

Modify the bot decision logic so that bots play more actively and call significantly more often.

## Main Client Requirement

The client wants the following behavior:

**Bots should call when they have a pair, two pair, three of a kind, straight, or flush.**

The bot must not fold these hands too easily.

The main priority is to reduce unnecessary folds.

## 1. Mandatory Rules

### When Check Is Available

If the bot can check for free:

- never fold;
- choose check;
- optionally bet or raise according to hand strength.

A bot must never fold when no additional chips are required to continue.

### One Pair

If the bot has one pair:

- usually call small bets;
- usually call medium bets;
- call more often in heads-up pots;
- call more often when the opponent may be bluffing;
- call more often with top pair;
- call more often with an overpair;
- rarely fold a pair against a bet of 50% pot or less.

The bot may fold one pair only when:

- the opponent makes a very large bet;
- the board is extremely dangerous;
- several players show strong aggression;
- the bot has a very weak pair;
- continuing is clearly unprofitable.

### Two Pair

If the bot has two pair:

- do not fold against normal bets;
- usually call;
- often raise for value;
- consider all-in when the stack-to-pot ratio is low;
- continue against large bets unless the board clearly allows a stronger combination.

The bot should almost never fold two pair against a single normal bet.

### Three of a Kind

If the bot has three of a kind:

- always continue against small and medium bets;
- usually call or raise;
- frequently raise for value;
- consider all-in when appropriate;
- fold only in exceptional situations where the opponent clearly represents a straight, flush, full house, or stronger hand.

Do not fold three of a kind simply because the opponent bets aggressively.

### Straight

If the bot has a straight:

- always continue against ordinary bets;
- usually call or raise;
- raise for value against weaker hands;
- consider all-in with a strong or nut straight;
- fold only when the board strongly indicates a higher straight, flush, full house, or four of a kind.

A completed straight must be treated as a strong made hand.

### Flush

If the bot has a flush:

- always continue against small, medium, and most large bets;
- call or raise according to flush strength;
- raise more often with a high flush;
- consider all-in with the nut flush;
- fold only when the board is paired and the opponent strongly represents a full house or four of a kind;
- fold a low flush only in exceptional situations with very strong opposing action.

A completed flush must not be treated as only a draw.

## 2. Bet-Size Rules

Use the opponent’s bet size as an important factor.

### Bet up to 25% of the pot

With any pair or stronger:

- never fold;
- call or raise.

### Bet from 26% to 50% of the pot

With any pair or stronger:

- strongly prefer call or raise;
- fold only in exceptional situations.

### Bet from 51% to 75% of the pot

- top pair or overpair: usually call;
- weak pair: call selectively;
- two pair or stronger: almost always continue;
- straight or flush: call or raise.

### Bet from 76% to 100% of the pot

- weak pair: evaluate carefully;
- top pair: call more often than before;
- two pair: usually call;
- three of a kind: usually call or raise;
- straight: usually call or raise;
- flush: usually call or raise.

### Overbet above 100% of the pot

- one pair may fold depending on the board;
- two pair should still continue frequently;
- three of a kind should continue unless the board is extremely dangerous;
- straight and flush should continue unless clearly beaten;
- nut hands should raise or go all-in.

## 3. Required Hand-Strength Priority

Use the following priority:

1. Straight flush
2. Four of a kind
3. Full house
4. Flush
5. Straight
6. Three of a kind
7. Two pair
8. One pair
9. High card

The stronger the combination, the less often the bot is allowed to fold.

Suggested maximum fold frequencies:

- one pair: no more than 30% against normal bets;
- two pair: no more than 10%;
- three of a kind: no more than 5%;
- straight: no more than 3%;
- flush: no more than 3%;
- full house or stronger: approximately 0%, except when folding is mathematically unavoidable.

These percentages apply to normal single-bet situations and should not force obviously incorrect calls against extreme action.

## 4. Pair Classification

The bot must distinguish between:

- overpair;
- top pair with strong kicker;
- top pair with weak kicker;
- middle pair;
- bottom pair;
- pocket pair below the board;
- paired hole card combined with a draw.

Continue more often with:

- overpair;
- top pair;
- pair plus flush draw;
- pair plus straight draw;
- pair with two overcards;
- pair in heads-up pots.

Fold more often only with:

- a very weak bottom pair;
- a weak underpair;
- a dangerous multiway board;
- extremely strong opponent action.

## 5. Draws

The bot should also continue frequently with strong draws.

Call or raise with:

- open-ended straight draw;
- flush draw;
- nut flush draw;
- combination draw;
- pair plus draw;
- two overcards plus flush draw;
- straight draw plus flush draw.

Do not fold strong draws against small or medium bets.

Use semi-bluff raises with strong draws.

## 6. Heads-Up Behavior

In heads-up pots:

- fold less;
- call more;
- defend any pair more aggressively;
- call more often with ace-high;
- call more often with draws;
- treat top pair as a strong hand;
- bluff-catch more often;
- do not allow opponents to win every pot with small bets.

## 7. Multiway Behavior

In multiway pots, the bot may be more cautious, but it must still:

- call small bets with a pair;
- continue with two pair or stronger;
- continue with strong draws;
- avoid folding strong made hands without a clear reason.

A multiway pot alone is not enough reason to fold two pair, three of a kind, straight, or flush.

## 8. River Behavior

On the river:

- call small bets with most pairs;
- call medium bets with top pair or better;
- call with two pair or stronger in most situations;
- do not fold a straight or flush without clear evidence of a stronger hand;
- call more often when missed draws are possible;
- call more often against aggressive players.

The bot must not automatically fold because no additional cards remain.

## 9. Action Selection

Use weighted decisions rather than completely fixed actions.

Example with one pair against a 33% pot bet:

```json
{
  "fold": 0.1,
  "call": 0.75,
  "raise": 0.15
}
```

Example with two pair:

```json
{
  "fold": 0.02,
  "call": 0.48,
  "raise": 0.5
}
```

Example with three of a kind:

```json
{
  "fold": 0.01,
  "call": 0.34,
  "raise": 0.65
}
```

Example with a straight:

```json
{
  "fold": 0.01,
  "call": 0.29,
  "raise": 0.7
}
```

Example with a flush:

```json
{
  "fold": 0.01,
  "call": 0.24,
  "raise": 0.75
}
```

These values are examples. The final weights must also consider:

- board texture;
- bet size;
- number of players;
- effective stack;
- position;
- opponent aggression;
- whether a stronger hand is possible.

## 10. Simple Decision Matrix

Implement at least the following behavior:

| Bot hand               | Small bet     | Medium bet    | Large bet          |
| ---------------------- | ------------- | ------------- | ------------------ |
| No pair, no draw       | Fold or bluff | Usually fold  | Fold               |
| Strong draw            | Call or raise | Call or raise | Evaluate equity    |
| One pair               | Call          | Usually call  | Evaluate carefully |
| Two pair               | Call or raise | Call or raise | Usually call       |
| Three of a kind        | Raise or call | Raise or call | Usually continue   |
| Straight               | Raise or call | Raise or call | Usually continue   |
| Flush                  | Raise or call | Raise or call | Usually continue   |
| Full house or stronger | Raise         | Raise         | Raise or all-in    |

## 11. Poker Mavens Integration

The bot must use only actions currently allowed by Poker Mavens.

Before acting:

1. confirm that it is the bot’s turn;
2. read the current pot;
3. read the call amount;
4. read the minimum and maximum raise;
5. evaluate the bot’s current combination;
6. select call, raise, or fold;
7. revalidate the table state;
8. send the action.

Poker Mavens remains the source of truth for:

- legal actions;
- chip stacks;
- pot size;
- side pots;
- cards;
- winners;
- minimum raises;
- maximum raises.

## 12. Required Decision Function

Create TypeScript-style logic:

```typescript
function decideAction(state: PokerState): BotDecision {
  const hand = evaluateHand(state.heroCards, state.board);
  const betRatio = calculateBetToPotRatio(state);
  const canCheck = state.allowedActions.includes('check');

  if (canCheck) {
    return chooseBetweenCheckBetOrRaise(state, hand);
  }

  if (hand.category === 'straight_flush') {
    return raiseOrAllIn(state);
  }

  if (hand.category === 'four_of_a_kind') {
    return raiseOrAllIn(state);
  }

  if (hand.category === 'full_house') {
    return raiseOrAllIn(state);
  }

  if (hand.category === 'flush') {
    return stronglyPreferCallRaiseOrAllIn(state, betRatio);
  }

  if (hand.category === 'straight') {
    return stronglyPreferCallOrRaise(state, betRatio);
  }

  if (hand.category === 'three_of_a_kind') {
    return stronglyPreferCallOrRaise(state, betRatio);
  }

  if (hand.category === 'two_pair') {
    return preferCallOrRaise(state, betRatio);
  }

  if (hand.category === 'one_pair') {
    return preferCallAgainstSmallAndMediumBets(state, betRatio);
  }

  if (hand.hasStrongDraw) {
    return callOrSemiBluffRaise(state, betRatio);
  }

  return foldCallOrBluffBasedOnContext(state);
}
```

Expand this into production-ready decision logic.

## 13. Required Tests

Add tests confirming that:

1. The bot never folds when check is available.
2. The bot calls a 25% pot bet with one pair.
3. The bot usually calls a 50% pot bet with top pair.
4. The bot does not fold two pair against a normal bet.
5. The bot calls or raises with three of a kind.
6. The bot calls or raises with a straight.
7. The bot calls or raises with a flush.
8. The bot raises or goes all-in with a full house.
9. The bot continues with a strong flush draw.
10. The bot continues with an open-ended straight draw.
11. The bot folds complete air against a large bet.
12. The bot does not blindly call every all-in with one pair.
13. The bot uses only legal Poker Mavens actions.
14. The bot never sends an action after it is already all-in.

## Final Requirement

Modify the bot so that it behaves according to the client’s request:

**The bot must fold less and must usually pay or call when it has a pair, two pair, three of a kind, straight, or flush.**

The bot must especially avoid folding:

- any made hand against a small bet;
- top pair against a normal bet;
- two pair;
- three of a kind;
- straight;
- flush.

Do not turn the bot into a bot that calls absolutely everything. It may still fold when the opponent’s action and the board clearly indicate that the bot is likely beaten.

The final result must prioritize active gameplay, frequent calls, and fewer unnecessary folds.
