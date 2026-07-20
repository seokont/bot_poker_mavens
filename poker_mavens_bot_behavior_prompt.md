# Poker Mavens Bot Behavior Prompt

You are a senior poker bot developer and No-Limit Texas Hold’em strategy specialist.

Modify the existing Poker Mavens bot decision engine.

The client’s feedback is:

> “The bots are terrible. They call everything.”

The current bots behave like calling stations. They call bets and all-ins with weak hands, missed draws, high card, weak bottom pair, and other hands that should normally be folded.

At the same time, the client expects bots to continue reasonably when they have:

- one pair;
- two pair;
- three of a kind;
- straight;
- flush;
- full house or stronger.

The goal is not to make bots fold too much and not to make them call everything.

The required behavior is:

> **Fold weak hands, call reasonable bets with made hands, raise strong hands, and never call large bets or all-ins without sufficient hand strength or equity.**

## 1. Main correction

Remove any simplified logic such as:

```typescript
if (hand.hasPair) {
  return call();
}
```

or:

```typescript
if (callIsAvailable) {
  return call();
}
```

The bot must never call only because the call button is available.

Every call must consider:

- current street;
- hand strength;
- pair strength;
- board texture;
- bet size relative to the pot;
- call amount;
- effective stack;
- number of opponents;
- opponent aggression;
- possible stronger combinations;
- pot odds;
- estimated equity;
- whether the hand is already on the river;
- whether the draw is completed or missed.

## 2. Mandatory basic rules

### When check is available

If the bot can check without adding chips:

- never fold;
- check with weak hands;
- bet or raise only when strategically justified.

### When the bot has no pair and no draw

The bot should usually fold when facing a bet.

Examples:

- high card only;
- weak disconnected cards;
- missed straight draw on the river;
- missed flush draw on the river;
- weak overcards without useful draws;
- complete air.

Possible exceptions:

- a very small bet;
- heads-up pot;
- favorable pot odds;
- useful blockers;
- a planned bluff raise;
- an aggressive opponent with an extremely wide range.

The bot must not call a normal or large bet with complete air.

### Missed draws on the river

On the river, an unfinished draw has no future equity.

A missed flush draw or missed straight draw must be treated as:

- high card;
- a weak pair, if one card paired;
- or another completed made hand actually present.

Do not call because the hand previously had a draw.

## 3. One-pair behavior

The bot must classify one-pair hands correctly:

- overpair;
- top pair with strong kicker;
- top pair with weak kicker;
- middle pair;
- bottom pair;
- underpair;
- pocket pair;
- pair plus draw.

The bot must not treat every pair as equally strong.

### Against a bet up to 25% pot

- overpair: call or raise;
- top pair: usually call, sometimes raise;
- middle pair: usually call heads-up;
- bottom pair: call selectively;
- weak underpair: call only with sufficient pot odds or additional equity.

### Against a bet from 26% to 50% pot

- overpair: usually continue;
- top pair: usually continue;
- middle pair: evaluate board and opponent;
- bottom pair: fold more often;
- weak underpair: usually fold without a draw.

### Against a bet from 51% to 75% pot

- overpair: call selectively or raise;
- strong top pair: call selectively;
- weak top pair: fold more often;
- middle pair: usually fold unless the opponent overbluffs;
- bottom pair: usually fold;
- weak underpair: fold.

### Against a pot-sized bet or overbet

One pair must not automatically call.

Continue only when:

- it is a strong overpair or strong top pair;
- the opponent has enough bluffs;
- the board contains many missed draws;
- pot odds and estimated equity justify the call;
- the hand has useful blockers.

Weak pairs should usually fold against pot-sized bets, overbets, and all-ins.

## 4. Two-pair behavior

With two pair:

- continue against small and medium bets;
- call or raise for value;
- usually continue against one large bet;
- consider all-in when the stack-to-pot ratio is low.

However, two pair is not always the nuts.

The bot must evaluate:

- paired board;
- completed straight;
- completed flush;
- higher two pair;
- sets;
- full houses;
- strong multiway aggression.

Do not fold two pair without a strong reason, but do not automatically call every all-in.

## 5. Three-of-a-kind behavior

With three of a kind:

- call or raise against normal bets;
- raise more frequently for value;
- consider all-in at low stack-to-pot ratios;
- avoid passive calling when many worse hands or draws can pay.

The bot may fold three of a kind only when:

- the board strongly completes a straight or flush;
- the board is paired in a way that allows stronger full houses;
- there is extreme multiway aggression;
- the opponent’s range is exceptionally strong;
- the bot has a weak trip combination with a poor kicker.

Distinguish between:

- a pocket-pair set;
- trips using one hole card and a paired board.

A set is normally stronger and better disguised than weak trips.

## 6. Straight behavior

With a completed straight:

- usually call or raise;
- raise for value against sets, two pair, lower straights, and strong pairs;
- consider all-in with the nut straight;
- evaluate whether a higher straight is possible;
- evaluate whether the board also completes a flush;
- evaluate whether the board is paired.

Do not fold a straight against a normal bet without a clear reason.

Do not automatically call an all-in with a low straight on a four-card straight board or a dangerous flush board.

## 7. Flush behavior

With a completed flush:

- usually call or raise;
- raise more frequently with a high or nut flush;
- call selectively with a low flush on dangerous boards;
- consider all-in with the nut flush.

Evaluate:

- flush rank;
- whether a higher flush is possible;
- whether four cards of one suit are on the board;
- whether the board is paired;
- whether a full house or four of a kind is possible;
- opponent action strength.

Do not treat every flush as unbeatable.

## 8. Full house and stronger

With:

- full house;
- four of a kind;
- straight flush;

the bot should strongly prefer:

- value raise;
- re-raise;
- all-in when legal and profitable.

Slow play is allowed only when it has a clear strategic purpose.

## 9. Draw behavior

Before the river, classify draws as:

- nut flush draw;
- flush draw;
- open-ended straight draw;
- gutshot;
- double gutshot;
- combo draw;
- pair plus draw;
- overcards plus draw;
- weak backdoor draw.

### Strong draws

With a strong draw:

- call small and medium bets when pot odds justify it;
- use semi-bluff raises;
- consider all-in with a combo draw when equity and fold equity are sufficient.

### Weak draws

With only a weak gutshot or backdoor draw:

- call only against small bets and favorable conditions;
- fold against large bets;
- do not call all-ins without sufficient equity.

### River rule

On the river, all missed draws lose their draw value.

A missed draw must not be used as a reason to call.

## 10. Bet-size-based decision rules

Calculate:

```text
betRatio = callAmount / potBeforeCall
```

Use approximate categories:

```typescript
if (betRatio <= 0.25) {
  betSizeCategory = "small";
} else if (betRatio <= 0.50) {
  betSizeCategory = "medium";
} else if (betRatio <= 0.75) {
  betSizeCategory = "large";
} else if (betRatio <= 1.00) {
  betSizeCategory = "pot";
} else {
  betSizeCategory = "overbet";
}
```

General rules:

| Bot hand | Small bet | Medium bet | Large bet | Pot/overbet |
|---|---|---|---|---|
| High card, no draw | Mostly fold | Fold | Fold | Fold |
| Weak draw | Selective call | Mostly fold | Fold | Fold |
| Strong draw | Call or raise | Call or raise | Equity-based | Equity-based |
| Weak pair | Selective call | Often fold | Fold | Fold |
| Top pair | Usually call | Call selectively | Carefully evaluate | Strong justification required |
| Overpair | Call or raise | Usually continue | Selective continue | Range-based decision |
| Two pair | Call or raise | Call or raise | Usually continue | Evaluate board danger |
| Three of a kind | Raise or call | Raise or call | Usually continue | Evaluate stronger combinations |
| Straight | Raise or call | Raise or call | Usually continue | Evaluate higher straight/flush |
| Flush | Raise or call | Raise or call | Usually continue | Evaluate higher flush/full house |
| Full house+ | Raise | Raise | Raise/all-in | Raise/all-in |

## 11. Pot odds

Calculate the required equity correctly:

```text
Required Equity = Call Amount / Final Pot After Calling
```

Example:

```text
Pot before opponent bet: 100
Opponent bet: 50
Pot before bot call: 150
Bot call amount: 50
Final pot after calling: 200

Required equity = 50 / 200 = 25%
```

Call only when:

```text
Estimated Equity >= Required Equity + Safety Margin
```

Suggested safety margin:

- heads-up: 3–5%;
- uncertain opponent range: 5–8%;
- multiway pot: 7–12%;
- large river bet: 6–12%.

Do not use pot odds as an excuse to call with a hand that is almost certainly drawing dead.

## 12. All-in restrictions

The current bots must stop calling all-ins with weak hands.

### Never call or make all-in automatically with:

- high card;
- missed draw;
- weak bottom pair;
- weak underpair;
- weak middle pair;
- small pair on a very dangerous board;
- low-equity gutshot;
- backdoor draw;
- hand that is clearly dominated.

### All-in may be considered with:

- strong overpair at low SPR;
- strong top pair at very low SPR;
- two pair;
- set;
- strong trips;
- straight;
- flush;
- full house or stronger;
- strong combo draw on flop or turn;
- profitable preflop push/fold range.

Before calling an all-in, calculate:

- required equity;
- estimated opponent range;
- actual hand equity;
- board danger;
- number of active opponents;
- tournament or cash-game context.

A lower fold frequency must never force an unprofitable all-in call.

## 13. River-specific logic

River decisions must be stricter because there are no future cards.

On the river:

- fold high card against a meaningful bet;
- fold missed draws;
- fold weak bottom pair against large bets;
- call small bets with reasonable bluff catchers;
- call medium bets with top pair only when the opponent has enough bluffs;
- continue with two pair or stronger in most normal situations;
- do not call all-ins with weak pairs only because a pair exists.

The bot must identify natural missed draws in the opponent’s range before making a bluff-catching call.

## 14. Screenshot test scenario

Add a mandatory regression test based on this situation:

```text
Board: 8♦ T♥ 5♣ Q♦ 4♣
River is complete.
```

### Bot hand: J♥ 4♥

Actual hand:

- one weak pair of fours;
- bottom pair;
- no remaining draw;
- vulnerable to almost every queen, ten, eight, five, stronger pair, two pair, straight, set, or stronger hand.

Expected behavior:

- check if checking is available;
- call only a very small bet under favorable conditions;
- fold against a medium or large bet;
- fold against an all-in in normal circumstances;
- do not raise all-in.

### Bot hand: 7♦ 9♥

Actual hand:

- no pair;
- missed straight draw;
- only high card on the completed river.

Expected behavior:

- check if checking is available;
- fold against any meaningful bet;
- fold against an all-in;
- never call or raise all-in;
- do not treat the previous straight draw as current equity.

This exact situation must be covered by automated tests.

## 15. Weighted actions

Use weighted actions, but apply strict hand-strength constraints.

Example: weak bottom pair against a 75% pot river bet:

```json
{
  "fold": 0.90,
  "call": 0.10,
  "raise": 0.00
}
```

Example: high card and missed draw against an all-in:

```json
{
  "fold": 1.00,
  "call": 0.00,
  "raise": 0.00
}
```

Example: top pair against a 33% pot flop bet:

```json
{
  "fold": 0.05,
  "call": 0.75,
  "raise": 0.20
}
```

Example: two pair against a 50% pot bet:

```json
{
  "fold": 0.02,
  "call": 0.43,
  "raise": 0.55
}
```

Example: nut flush draw on the flop:

```json
{
  "fold": 0.05,
  "call": 0.45,
  "raise": 0.50
}
```

Do not allow randomness to select an obviously incorrect call.

## 16. Decision priority

Use this order:

1. Confirm that it is the bot’s turn.
2. Read legal Poker Mavens actions.
3. Detect whether check is available.
4. Identify the current street.
5. Evaluate the actual completed combination.
6. Evaluate active draws only on flop or turn.
7. Detect missed draws on the river.
8. Classify pair strength.
9. Analyze board danger.
10. Calculate bet-to-pot ratio.
11. Calculate pot odds.
12. Estimate opponent range.
13. Estimate equity.
14. Generate candidate actions.
15. Remove strategically invalid actions.
16. Apply weighted selection.
17. Validate the selected action against Poker Mavens.
18. Submit the action.

## 17. Required TypeScript-style pseudocode

Implement or rewrite:

```typescript
function decideAction(state: PokerState): BotDecision {
  validateState(state);

  const legalActions = state.allowedActions;
  const canCheck = legalActions.some(action => action.type === "check");

  const hand = evaluateMadeHand(state.heroCards, state.board);
  const draws = evaluateDraws(
    state.heroCards,
    state.board,
    state.street,
  );

  const board = analyzeBoardTexture(state.board);
  const pairStrength = classifyPairStrength(
    state.heroCards,
    state.board,
    hand,
  );

  const betRatio = calculateBetRatio(state);
  const requiredEquity = calculateRequiredEquity(state);
  const opponentRange = estimateOpponentRange(state);
  const estimatedEquity = estimateEquity(
    state,
    hand,
    opponentRange,
  );

  if (canCheck) {
    return chooseCheckBetOrRaise({
      state,
      hand,
      draws,
      board,
    });
  }

  if (state.street === "river" && draws.isMissedDraw && !hand.hasMadeHand) {
    return foldDecision("MISSED_DRAW_ON_RIVER");
  }

  if (state.street === "river" && hand.category === "high_card") {
    return decideRiverHighCard({
      state,
      betRatio,
      opponentRange,
    });
  }

  const candidates = createCandidateActions({
    state,
    hand,
    draws,
    board,
    pairStrength,
    betRatio,
    requiredEquity,
    estimatedEquity,
  });

  const filteredCandidates = removeClearlyInvalidStrategicActions(
    candidates,
    {
      state,
      hand,
      draws,
      board,
      pairStrength,
      betRatio,
      requiredEquity,
      estimatedEquity,
    },
  );

  const decision = selectWeightedAction(filteredCandidates);

  return validatePokerMavensAction(state, decision);
}
```

Create separate functions:

```typescript
classifyPairStrength()
evaluateMadeHand()
evaluateDraws()
detectMissedDraw()
analyzeBoardTexture()
calculateBetRatio()
calculateRequiredEquity()
estimateOpponentRange()
estimateEquity()
shouldCall()
shouldRaiseForValue()
shouldSemiBluff()
shouldFoldWeakPair()
shouldCallAllIn()
removeClearlyInvalidStrategicActions()
validatePokerMavensAction()
```

## 18. Required tests

Add tests confirming:

1. The bot never folds when check is available.
2. The bot does not call every available bet.
3. The bot folds high card against a normal river bet.
4. The bot folds a missed river draw.
5. The bot folds a weak bottom pair against a large river bet.
6. The bot folds a weak pair against an all-in.
7. The bot usually calls a small bet with top pair.
8. The bot continues with two pair against normal bets.
9. The bot calls or raises with three of a kind.
10. The bot calls or raises with a straight.
11. The bot calls or raises with a flush.
12. The bot detects when a low flush may be beaten.
13. The bot detects when a straight may be beaten by a flush.
14. The bot does not treat all pairs equally.
15. The bot does not treat missed draws as active draws.
16. The bot does not shove with complete air.
17. The bot does not call all-in with complete air.
18. The bot uses pot odds and estimated equity.
19. The bot uses only legal Poker Mavens actions.
20. The screenshot regression scenario produces folds against large bets and all-ins.

## Final client requirement

Correct the bots so that:

- they do not call everything;
- they fold hands with no pair and no real draw;
- they fold missed draws on the river;
- they fold weak pairs against large bets and all-ins;
- they call reasonable bets with good pairs;
- they continue with two pair, three of a kind, straight, flush, and stronger hands;
- they raise strong hands for value;
- they use all-in only with sufficient strength, equity, or fold equity;
- they evaluate the board and bet size before every call.

The required bot identity is:

> **A balanced recreational poker player who continues with legitimate made hands and strong draws, but does not behave like a calling station and does not pay every bet or all-in.**
