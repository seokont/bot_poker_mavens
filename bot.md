You are a senior poker bot developer, poker mathematics specialist, and experienced No-Limit Texas Hold’em strategy designer.

Create a detailed in-game decision engine for a poker bot connected to Poker Mavens.

Focus specifically on deciding when the bot should:

- fold;
- check;
- call;
- bet;
- raise;
- re-raise;
- check-raise;
- bluff;
- semi-bluff;
- go all-in.

The bot must use only information available to a normal Poker Mavens player:

- its own hole cards;
- public board cards;
- player positions;
- visible stack sizes;
- pot size;
- current bet;
- action history;
- number of active opponents;
- legal actions and legal bet limits provided by Poker Mavens.

The bot must never use:

- opponents’ hidden cards;
- future board cards;
- deck order;
- folded cards;
- server RNG information;
- private information from other bots.

## 1. Main Playing Style

The bot must play a loose-aggressive but controlled strategy.

The key requirement is:

**The bot should fold less often than a standard tight bot.**

However, it must not blindly call every bet.

The bot should:

- participate in more pots;
- defend the big blind more often;
- call more often with draws and medium-strength made hands;
- continue more frequently against small bets;
- avoid overfolding against continuation bets;
- use more semi-bluffs;
- use more check-raises;
- apply pressure with position;
- bluff selectively;
- fold mainly when the expected value of continuing is clearly negative.

The bot should prefer:

- check instead of fold when checking is free;
- call instead of fold when pot odds are favorable;
- call or raise instead of fold against very small bets;
- semi-bluff instead of passive fold with strong draws;
- defend wider ranges from the big blind;
- continue wider in heads-up pots than in multiway pots.

The bot must never fold when check is available.

## 2. Target Statistical Profile

Design the bot around approximately the following target profile for 6-max cash games:

- VPIP: 32–42%;
- PFR: 22–32%;
- 3-bet: 8–13%;
- fold to 3-bet: 42–55%;
- big blind fold to steal: 35–48%;
- fold to flop continuation bet: 35–45%;
- fold to turn continuation bet: 40–52%;
- flop continuation bet: 60–72%;
- turn continuation bet: 42–58%;
- check-raise flop: 8–14%;
- aggression frequency: 42–55%;
- went to showdown: 28–36%.

These values are targets, not strict fixed percentages.

They should change depending on:

- player count;
- stack depth;
- position;
- bet size;
- number of opponents;
- opponent tendencies;
- board texture;
- cash game or tournament context.

For full-ring tables, tighten the ranges slightly.

For heads-up, widen them significantly.

## 3. General Decision Priority

For every action, use the following process:

1. Read the latest Poker Mavens game state.
2. Confirm that it is currently the bot’s turn.
3. Read the list of legal actions.
4. Determine the current street.
5. Calculate the amount required to call.
6. Calculate pot odds.
7. Evaluate the bot’s hand and draws.
8. Estimate opponent ranges.
9. Estimate equity.
10. Consider position and effective stack.
11. Generate legal candidate actions.
12. Remove clearly negative actions.
13. Assign weighted probabilities.
14. Select the final action.
15. Select a legal bet or raise size.
16. Revalidate the current state.
17. Submit the action to Poker Mavens.

Poker Mavens must remain the final authority for legal actions and bet sizes.

## 4. Mandatory Fold-Reduction Rules

Implement the following rules to prevent excessive folding.

### Rule 1: Never fold when check is available

When the call amount is zero:

- never choose fold;
- choose check;
- or choose bet when betting has positive strategic value.

### Rule 2: Continue very widely against tiny bets

Against a bet up to 20% of the pot, continue with:

- any pair;
- most ace-high hands;
- two overcards with backdoor potential;
- gutshots;
- open-ended straight draws;
- flush draws;
- backdoor flush draw plus overcard;
- strong backdoor combinations;
- many hands with useful blockers.

Target fold frequency against bets of 20% pot or smaller:

- heads-up: no more than 10–18%;
- multiway: no more than 20–30%.

### Rule 3: Continue wider against one-third-pot bets

Against a bet of approximately 25–35% pot, continue with:

- all reasonable made hands;
- most pairs;
- strong ace-high hands;
- overcards with backdoor equity;
- gutshots;
- open-ended straight draws;
- flush draws;
- combo draws;
- selected bluff raises.

Target fold frequency:

- heads-up: 20–35%;
- multiway: 35–48%.

### Rule 4: Defend the big blind wider

Against a standard button open of 2–2.5 BB, the big blind should defend approximately 55–70% of hands, depending on rake and stack depth.

Defense can include:

- call;
- 3-bet;
- occasional all-in at short stacks.

The bot should fold the weakest disconnected offsuit hands, but should defend many:

- suited hands;
- connected hands;
- one-gap suited hands;
- broadway hands;
- ace-x hands;
- king-x suited hands;
- queen-x suited hands;
- pocket pairs.

### Rule 5: Use pot odds before folding

Calculate:

```text
Required Equity = Call Amount / Pot After Calling
```

When estimated equity is greater than required equity by a safety margin, do not fold.

Example safety margins:

- strong reliable estimate: 2–4%;
- uncertain estimate: 5–8%;
- multiway pot: 6–10%.

### Rule 6: Prefer continuing with equity

Do not fold strong draws unless:

- the bet is extremely large;
- the draw is dominated;
- there are significant reverse implied odds;
- the bot is drawing nearly dead;
- the opponent’s range is exceptionally strong;
- stack or tournament conditions make continuing clearly unprofitable.

### Rule 7: Do not overfold medium-strength hands

With a medium-strength made hand, consider:

- opponent bet size;
- number of missed draws;
- blocker effects;
- opponent bluff frequency;
- whether the bot is at the top of its range.

Do not automatically fold:

- second pair;
- third pair;
- underpairs;
- weak top pair;
- ace-high bluff catchers;
- bluff-catching pocket pairs.

## 5. Preflop Decision Logic

Create explicit preflop logic for:

- unopened pots;
- limped pots;
- facing one raise;
- facing a raise and callers;
- facing a 3-bet;
- facing a 4-bet;
- facing an all-in;
- blind-versus-blind play;
- heads-up play.

## 6. Opening Ranges

Use loose-aggressive opening ranges.

Approximate 6-max opening frequencies:

- UTG: 18–23%;
- HJ: 22–28%;
- CO: 30–38%;
- BTN: 45–60%;
- SB when folded to: 40–58%.

Example UTG opening category:

- all pocket pairs;
- strong suited aces;
- strong offsuit aces;
- suited broadways;
- strong offsuit broadways;
- selected suited connectors;
- selected suited one-gappers.

Example button opening category:

- all pocket pairs;
- most aces;
- most suited kings;
- many suited queens;
- suited connectors;
- suited one-gappers;
- selected offsuit kings and queens;
- selected connected offsuit hands.

Do not use these frequencies blindly. Adjust for:

- tight or loose players behind;
- aggressive blinds;
- stack depth;
- rake;
- tournament stage;
- ante size.

## 7. Facing Limpers

Against one or more limpers, the bot should not automatically limp behind or fold.

Use:

- isolation raises with strong and medium-strength playable hands;
- over-limps with speculative suited hands and small pairs;
- occasional bluff isolation from late position;
- folds only with hands having poor equity, poor playability, and poor position.

Suggested isolation sizing:

```text
3.5 BB + 1 BB per limper
```

Adjust to table tendencies and legal Poker Mavens limits.

Raise larger out of position.

## 8. Facing a Preflop Raise

When facing one open raise, choose among:

- fold;
- call;
- 3-bet;
- all-in at short stacks.

The bot must call more often than a tight bot, especially:

- in position;
- from the big blind;
- against small raise sizes;
- against wide late-position openings;
- with suited and connected hands;
- with pocket pairs;
- when implied odds are favorable.

### Calling considerations

Call more often with:

- pocket pairs;
- suited aces;
- suited broadways;
- suited connectors;
- suited one-gappers;
- strong offsuit broadways;
- hands dominating the opener’s wide range.

Call less often when:

- severely dominated;
- out of position against a large raise;
- stacks are too shallow for speculative hands;
- players behind are likely to squeeze;
- the hand has poor postflop playability.

## 9. Three-Bet Logic

Use both value 3-bets and bluff 3-bets.

Value 3-bet examples:

- premium pocket pairs;
- strong broadway hands;
- strong suited aces;
- hands clearly ahead of the opener’s continuation range.

Bluff and semi-bluff 3-bet examples:

- suited wheel aces;
- suited kings with blockers;
- selected suited connectors;
- hands with good blocker effects and postflop playability.

Target 3-bet frequency:

- versus early position: 5–9%;
- versus middle position: 7–11%;
- versus cutoff: 9–14%;
- versus button: 11–17%;
- small blind versus button: 12–18%;
- big blind versus button: 9–15%.

Use mixed strategies rather than fixed rules.

## 10. Facing a Three-Bet

The bot should not fold too often to 3-bets.

Continue with:

- premium hands;
- strong broadways;
- pocket pairs with suitable stack depth;
- suited aces;
- suited connectors in position;
- selected blocker hands as 4-bet bluffs.

Fold mainly:

- dominated offsuit hands;
- weak hands with poor playability;
- speculative hands without sufficient implied odds;
- hands facing an excessively large 3-bet.

Target fold-to-3-bet frequency:

- in position: 40–50%;
- out of position: 48–58%.

Use call more often in position.

Use 4-bet more often against opponents with excessive 3-bet frequency.

## 11. Preflop All-In Decisions

When facing an all-in, calculate:

- effective stack;
- pot odds;
- estimated opponent range;
- hand equity;
- dead money;
- players behind;
- tournament risk;
- ICM when applicable.

Do not call all-ins only because the bot is configured to fold less.

Call when:

```text
Estimated Equity > Required Equity + Risk Margin
```

Use a smaller risk margin in cash games and a larger margin in tournaments with significant ICM pressure.

## 12. Flop Hand Classification

Classify the bot’s flop hand into one of the following groups:

1. Nuts or near-nuts.
2. Very strong made hand.
3. Strong top pair or overpair.
4. Medium made hand.
5. Weak made hand or bluff catcher.
6. Strong combo draw.
7. Nut flush draw.
8. Open-ended straight draw.
9. Flush draw.
10. Gutshot.
11. Two overcards.
12. Backdoor equity.
13. Air with useful blockers.
14. Complete air.

The decision must depend on both hand category and board context.

## 13. Flop Betting Logic

When the bot was the preflop aggressor, use continuation bets based on board texture.

### Bet frequently on:

- dry ace-high boards;
- dry king-high boards;
- paired boards;
- disconnected boards favoring the preflop raiser;
- heads-up pots;
- boards where the bot has range advantage.

### Check more often on:

- very connected boards;
- low coordinated boards favoring the caller;
- multiway pots;
- boards with poor range advantage;
- hands with medium showdown value;
- hands benefiting from pot control.

Suggested c-bet sizes:

- 25–33% pot on dry boards;
- 40–60% pot on moderately connected boards;
- 60–80% pot on wet boards when betting for value or protection.

## 14. Flop Response to a Bet

### With very strong hands

Consider:

- call to keep bluffs in;
- raise for value;
- check-raise;
- all-in when stacks and board texture justify it.

### With top pair or overpair

Usually continue against small and medium bets.

Fold only when:

- facing extreme aggression;
- the board strongly favors the opponent;
- the opponent’s range is extremely strong;
- the hand has poor blockers;
- the pot is multiway and action is very strong.

### With second pair or third pair

Against small bets:

- usually call;
- occasionally raise as protection or bluff;
- rarely fold heads-up.

Against medium bets:

- call based on opponent range and board;
- fold more often in multiway pots.

Against large bets:

- continue selectively as a bluff catcher.

### With draws

Strong draws should usually:

- call;
- raise;
- check-raise;
- or go all-in when sufficient fold equity and pot equity exist.

Do not overfold:

- nut flush draws;
- combo draws;
- open-ended straight draws;
- flush draws with overcards;
- pair plus draw;
- two overcards plus a strong draw.

### With gutshots and backdoor hands

Continue more often when:

- the bet is small;
- the bot is in position;
- overcards are live;
- useful blockers exist;
- implied odds are favorable;
- the opponent overuses continuation bets.

## 15. Flop Fold Rules

Fold on the flop mainly when one or more of the following are true:

- the bot has very low equity;
- the hand has poor backdoor potential;
- the bet is large;
- the opponent’s range is strong;
- the pot is multiway;
- the bot is out of position;
- reverse implied odds are high;
- continuing would create an obviously negative-EV situation.

Do not fold complete air automatically against a small continuation bet.

Some air hands should be used as:

- floats;
- bluff raises;
- backdoor continues.

## 16. Turn Logic

On the turn, fully recalculate:

- hand strength;
- board texture;
- new draws;
- completed draws;
- opponent range;
- pot odds;
- implied odds;
- stack-to-pot ratio;
- bluffing opportunities.

### Continue more often when:

- the turn improves the bot;
- the turn creates additional draws;
- the bot gains strong blockers;
- the opponent’s bet is small;
- many natural bluffs remain;
- the opponent over-barrels;
- the bot is near the top of its range.

### Fold more often when:

- draws become dominated;
- the opponent’s range strengthens significantly;
- the bet is large;
- the bot has poor river prospects;
- reverse implied odds are high;
- a multiway opponent shows major strength.

## 17. Turn Semi-Bluff Logic

Raise or check-raise the turn with selected:

- nut flush draws;
- combo draws;
- strong straight draws;
- pair plus draw;
- high-equity draws with blockers;
- draws that block the opponent’s strongest continuing hands.

Semi-bluff more often when:

- fold equity is high;
- the bot can represent strong value;
- the opponent has a capped range;
- the bot has sufficient equity when called.

Do not semi-bluff every draw.

Use weighted probabilities.

## 18. River Logic

On the river, classify the decision as:

- value bet;
- thin value bet;
- check;
- bluff;
- bluff catch;
- fold.

There are no implied odds on the river.

### Value bet when:

- worse hands can realistically call;
- the bot is ahead of the opponent’s calling range;
- the selected sizing targets specific worse hands.

### Bluff when:

- the bot has little or no showdown value;
- the bot blocks strong opponent calls;
- the bot unblocks missed draws;
- the opponent’s range is capped;
- the betting line credibly represents value.

### Bluff catch when:

- the opponent has enough missed draws;
- pot odds require a relatively low winning frequency;
- the bot blocks value combinations;
- the bot unblocks bluffs;
- the opponent bluffs too frequently.

## 19. River Fold-Reduction Rules

The bot should not overfold the river against small bets.

Against a river bet of 20–30% pot, call with many bluff catchers when:

- the opponent has missed draws;
- the bot beats some thin value bets;
- the required equity is low;
- the hand is high enough in the bot’s range.

Example:

If the opponent bets 25 into a pot of 100:

```text
Pot after opponent bet = 125
Call amount = 25
Final pot after calling = 150

Required equity = 25 / 150 = 16.67%
```

The bot should call if it expects to win more than approximately 17%, adjusted for uncertainty.

Do not automatically call large river bets only to reduce folds.

Against overbets, require stronger blockers, better bluff-catching properties, or a more aggressive opponent profile.

## 20. Check-Raise Logic

Use check-raises with:

- strong value hands;
- sets;
- two pair;
- strong overpairs on suitable boards;
- nut draws;
- combo draws;
- selected blocker bluffs.

Target flop check-raise frequency:

- approximately 8–14% overall;
- higher against opponents with excessive continuation-bet frequency;
- lower in multiway pots.

Value and bluff check-raises should use similar sizes when representing the same range.

## 21. Calling Logic

The bot should call when:

- pot odds are favorable;
- the hand has sufficient equity;
- raising would isolate the bot against stronger hands;
- calling keeps bluffs in;
- the bot has position;
- implied odds are favorable;
- the opponent has an aggressive or wide betting range;
- the hand has showdown value;
- the bot wants to protect its checking or calling range.

Do not use a rule such as “call with any pair” without considering:

- board texture;
- bet size;
- number of opponents;
- stack depth;
- action sequence.

## 22. Raising Logic

Raise for value when:

- enough worse hands can call;
- draws can call;
- the board requires protection;
- stacks can be profitably committed.

Raise as a bluff or semi-bluff when:

- fold equity exists;
- the bot has useful blockers;
- the bot has equity when called;
- the bot can credibly represent a strong range;
- the opponent’s range is capped.

Do not raise when it only forces worse hands to fold and stronger hands to continue, unless used as a carefully selected bluff.

## 23. Bet-Sizing Rules

Supported normalized sizes:

- 25% pot;
- 33% pot;
- 40% pot;
- 50% pot;
- 66% pot;
- 75% pot;
- 100% pot;
- 125% pot;
- 150% pot;
- all-in.

Use small sizes when:

- the bot has a range advantage;
- the board is dry;
- the bot wants calls from weak hands;
- the bet targets a wide range;
- bluffing cheaply is effective.

Use large sizes when:

- the board is wet;
- the range is polarized;
- the bot has nut advantage;
- protection is important;
- stack-to-pot ratio favors commitment;
- the opponent’s range contains many strong bluff catchers.

Always clamp the final action to Poker Mavens legal minimum and maximum values.

## 24. Multiway Adjustments

In multiway pots:

- bluff less frequently;
- value bet more honestly;
- fold slightly more often;
- require stronger draws;
- reduce weak floats;
- treat aggression as stronger;
- avoid light bluff catches against several players.

However, do not overfold small bets when the bot has:

- a pair;
- a strong draw;
- good pot odds;
- strong implied odds;
- position.

## 25. Heads-Up Adjustments

In heads-up pots:

- widen all ranges;
- defend more hands;
- call more frequently;
- bluff more frequently;
- value bet thinner;
- use more check-raises;
- defend ace-high and king-high more often;
- avoid folding too many weak pairs;
- apply more pressure from the button.

Heads-up target VPIP may be approximately 65–85%, depending on stack depth and opponent style.

## 26. Stack-to-Pot Ratio

Use:

```text
SPR = Effective Stack / Pot at the beginning of the street
```

Guidelines:

### Low SPR: 0–2

- commit more often with top pair, overpairs, strong draws, and better;
- use more all-ins;
- avoid unnecessary folds with strong made hands.

### Medium SPR: 2–6

- balance value, protection, calls, and semi-bluffs;
- evaluate stack commitment carefully.

### High SPR: above 6

- avoid stacking off too lightly with one-pair hands;
- value position and nut potential;
- continue draws when implied odds justify it.

## 27. Opponent-Based Adjustments

### Against a tight player

- steal more often;
- fold more to large turn and river aggression;
- bluff small pots;
- avoid weak bluff catches against strong lines.

### Against a loose passive player

- value bet wider;
- bluff less;
- isolate limps;
- call fewer large river bets without sufficient strength.

### Against an aggressive player

- call wider;
- trap more often;
- bluff catch more often;
- use check-raises;
- allow the opponent to continue bluffing.

### Against a player who overfolds

- bluff more;
- raise more continuation bets;
- steal blinds more frequently.

### Against a calling station

- bluff much less;
- bet larger for value;
- value bet second pair and top pair more often.

## 28. Weighted Decision System

Do not make every decision deterministic.

Example with top pair against a 33% pot flop bet:

```json
{
  "fold": 0.03,
  "call": 0.72,
  "raise": 0.25
}
```

Example with a nut flush draw:

```json
{
  "fold": 0.02,
  "call": 0.48,
  "raise": 0.5
}
```

Example with a weak gutshot against a small bet:

```json
{
  "fold": 0.35,
  "call": 0.5,
  "raise": 0.15
}
```

Example with complete air against a large multiway bet:

```json
{
  "fold": 0.9,
  "call": 0.02,
  "raise": 0.08
}
```

These are examples only.

The actual probabilities must be dynamically calculated.

## 29. Fold-Frequency Cap

Introduce a contextual fold-frequency cap.

The cap must not force an illegal or clearly losing call. It should prevent systematic overfolding.

Suggested caps:

- facing up to 20% pot heads-up: maximum 18% folds;
- facing up to 33% pot heads-up: maximum 35% folds;
- facing 40–60% pot heads-up: maximum 48% folds;
- facing 75% pot heads-up: maximum 58% folds;
- facing pot-sized bet heads-up: maximum 62% folds;
- facing an overbet: determined by range and blockers;
- multiway: increase allowed fold rate by 10–18 percentage points.

Apply the cap across the bot’s entire range, not individually to every hand.

The engine must identify which hands are best to continue based on:

- equity;
- blockers;
- showdown value;
- draw potential;
- position;
- playability.

## 30. Minimum Defense Frequency

For heads-up situations, estimate minimum defense frequency:

```text
MDF = Pot / (Pot + Bet)
```

Examples:

- 25% pot bet: MDF = 80%;
- 33% pot bet: MDF ≈ 75%;
- 50% pot bet: MDF ≈ 67%;
- 75% pot bet: MDF ≈ 57%;
- 100% pot bet: MDF = 50%.

Do not apply MDF mechanically in every situation.

Adjust for:

- range disadvantage;
- multiway pots;
- future street realization;
- rake;
- opponent under-bluffing;
- tournament conditions.

Use MDF mainly as an anti-overfolding reference.

## 31. All-In Logic

Go all-in when:

- the bot has a very strong made hand;
- a strong draw has sufficient combined equity and fold equity;
- stack-to-pot ratio is low;
- raising smaller would leave an ineffective stack;
- the bot can profitably isolate a weaker range;
- the shove is a profitable preflop push.

Call an all-in only when estimated equity justifies it.

Do not call every all-in merely because the bot should fold less.

## 32. Required Decision Output

For every decision, return a structured result:

```json
{
  "action": "call",
  "amount": 500,
  "confidence": 0.74,
  "handCategory": "second_pair",
  "estimatedEquity": 0.41,
  "requiredEquity": 0.25,
  "potOdds": 0.25,
  "spr": 3.8,
  "reasonCodes": ["SMALL_BET", "SUFFICIENT_EQUITY", "HEADS_UP", "UNDERFOLD_PROTECTION"],
  "alternativeActions": [
    {
      "action": "fold",
      "weight": 0.08
    },
    {
      "action": "call",
      "weight": 0.72
    },
    {
      "action": "raise",
      "weight": 0.2
    }
  ]
}
```

The reason codes are required for debugging and testing.

## 33. Recommended Reason Codes

Include reason codes such as:

- `CHECK_AVAILABLE`;
- `FREE_CARD`;
- `SMALL_BET`;
- `LARGE_BET`;
- `FAVORABLE_POT_ODDS`;
- `INSUFFICIENT_EQUITY`;
- `STRONG_MADE_HAND`;
- `MEDIUM_SHOWDOWN_VALUE`;
- `STRONG_DRAW`;
- `COMBO_DRAW`;
- `USEFUL_BLOCKERS`;
- `POOR_BLOCKERS`;
- `POSITION_ADVANTAGE`;
- `OUT_OF_POSITION`;
- `HEADS_UP`;
- `MULTIWAY`;
- `RANGE_ADVANTAGE`;
- `NUT_ADVANTAGE`;
- `OPPONENT_OVERBLUFFS`;
- `OPPONENT_UNDERBLUFFS`;
- `UNDERFOLD_PROTECTION`;
- `VALUE_RAISE`;
- `SEMI_BLUFF`;
- `BLUFF_CATCH`;
- `REVERSE_IMPLIED_ODDS`;
- `LOW_SPR_COMMITMENT`;
- `TOURNAMENT_ICM_PRESSURE`.

## 34. Pseudocode Requirement

Provide detailed TypeScript-style pseudocode for:

```typescript
function decideAction(state: NormalizedPokerState): BotDecision;
```

The pseudocode must include:

- state validation;
- detection of check availability;
- hand evaluation;
- draw evaluation;
- pot-odds calculation;
- required-equity calculation;
- opponent-range estimation;
- equity estimation;
- board-texture analysis;
- position adjustment;
- multiway adjustment;
- bet-size adjustment;
- anti-overfold adjustment;
- candidate action generation;
- action weighting;
- weighted selection;
- legal amount validation;
- final revalidation.

Also provide separate functions:

```typescript
calculatePotOdds();
calculateRequiredEquity();
calculateMinimumDefenseFrequency();
evaluatePreflopDecision();
evaluateFlopDecision();
evaluateTurnDecision();
evaluateRiverDecision();
applyLooseAggressiveAdjustments();
applyAntiOverfoldProtection();
selectBetSize();
validatePokerMavensAction();
```

## 35. Test Scenarios

Create detailed tests for at least these situations:

1. Check is available — bot never folds.
2. Big blind faces a 2 BB button raise — bot defends widely.
3. Bot has bottom pair against a 20% pot bet.
4. Bot has ace-high against a 25% pot bet.
5. Bot has a gutshot and two overcards against a 33% pot bet.
6. Bot has a flush draw against a 50% pot bet.
7. Bot has second pair against a 75% pot bet.
8. Bot has top pair against a pot-sized bet.
9. Bot has a bluff catcher against a 25% river bet.
10. Bot has a bluff catcher against a river overbet.
11. Bot has complete air in a multiway pot.
12. Bot has a combo draw and low SPR.
13. Bot faces a tight player’s river raise.
14. Bot faces an aggressive player’s triple barrel.
15. Bot plays heads-up from the big blind.
16. Bot faces a 3-bet in position.
17. Bot faces a 3-bet out of position.
18. Bot considers a 4-bet bluff with an ace blocker.
19. Bot faces a preflop all-in.
20. Bot is already all-in and must not send another action.

For each test specify:

- input state;
- estimated range;
- required equity;
- candidate actions;
- expected action weights;
- acceptable final actions;
- actions that must never be selected.

## 36. Final Implementation Requirement

Produce a complete decision-engine specification that can be implemented for Poker Mavens.

The result must include:

1. Preflop ranges by position.
2. Blind-defense ranges.
3. Call, fold, and 3-bet logic.
4. Flop decision matrix.
5. Turn decision matrix.
6. River decision matrix.
7. Bet-size selection rules.
8. Anti-overfold rules.
9. Minimum-defense-frequency logic.
10. Opponent adaptations.
11. Weighted action selection.
12. TypeScript interfaces.
13. TypeScript-style pseudocode.
14. Configuration objects.
15. Test cases.
16. Logging reason codes.
17. Integration points with `PokerMavensAdapter`.

Do not provide only theoretical poker advice.

Create exact algorithms, thresholds, decision matrices, configuration values, DTOs, pseudocode, and tests.

The bot’s main identity must be:

**Loose-aggressive, difficult to push out of a pot, willing to call and defend wider than average, but still mathematically controlled and capable of folding when continuing is clearly unprofitable.**
