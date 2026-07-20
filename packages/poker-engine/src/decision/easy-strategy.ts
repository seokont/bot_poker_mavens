import { GameState, BotDecisionResult, StrategyConfig, ActionType, GameType } from '@poker-bot/shared-types';
import { HandEvaluator, HandStrengthGroup, HandCategory } from '../hand-strength/hand-evaluator';
import { PotOddsCalculator } from '../pot-odds/pot-odds-calculator';
import { PreflopRanges } from '../preflop/preflop-ranges';
import { OmahaPreflopRanges } from '../preflop/omaha-preflop-ranges';
import { classifyPairTier, isStrongPairTier } from '../hand-strength/pair-classifier';
import { detectDraws } from '../hand-strength/draw-detector';

function isOmaha(gameType: GameType): boolean {
  return gameType === GameType.PLO4 || gameType === GameType.PLO5 || gameType === GameType.PLO6;
}

/**
 * Operator-requested play style: fold very rarely. Continue with almost any
 * two cards rather than folding reflexively, only giving up against a bet
 * that's a large multiple of the blinds/pot, or genuinely overwhelming.
 */
export class EasyStrategy {
  private handEvaluator = new HandEvaluator();
  private potOddsCalc = new PotOddsCalculator();
  private preflopRanges = new PreflopRanges();
  private omahaPreflopRanges = new OmahaPreflopRanges();

  decide(state: GameState, _config: StrategyConfig): BotDecisionResult {
    const allowedActions = state.allowedActions;
    const hasCheck = allowedActions.some(a => a.action === ActionType.CHECK);
    const hasCall = allowedActions.some(a => a.action === ActionType.CALL);
    const hasFold = allowedActions.some(a => a.action === ActionType.FOLD);
    const omaha = isOmaha(state.gameType);

    // Evaluate hand strength (Omaha has a strict 2-hole + 3-board combination
    // rule - a plain best-5-of-7 hold'em evaluation is simply wrong for it)
    const handResult = omaha
      ? this.handEvaluator.evaluateOmahaHand(state.holeCards, state.boardCards)
      : this.handEvaluator.evaluateHand(state.holeCards, state.boardCards);

    // Preflop decision
    if (state.street === 'PREFLOP') {
      const preflopGroup = omaha
        ? this.omahaPreflopRanges.classifyHand(state.holeCards)
        : this.preflopRanges.classifyHand(state.holeCards);

      if (preflopGroup === HandStrengthGroup.PREMIUM) {
        if (hasCheck) return { action: ActionType.CHECK, confidence: 0.9, reason: 'EASY_PREMIUM_CHECK' };
        if (hasCall) return { action: ActionType.CALL, confidence: 0.8, reason: 'EASY_PREMIUM_CALL' };
      }

      if (preflopGroup === HandStrengthGroup.STRONG || preflopGroup === HandStrengthGroup.MEDIUM) {
        if (hasCheck) return { action: ActionType.CHECK, confidence: 0.7, reason: 'EASY_STRONG_CHECK' };
        if (hasCall && state.amountToCall <= state.bigBlind * 3) {
          return { action: ActionType.CALL, confidence: 0.6, reason: 'EASY_STRONG_CALL' };
        }
      }

      // Weak hands - played extremely loosely by design (operator-requested:
      // fold very rarely): stay in with almost any two cards, only giving up
      // against a bet that's a large multiple of the blinds.
      if (hasCheck) return { action: ActionType.CHECK, confidence: 0.5, reason: 'EASY_WEAK_CHECK' };
      if (hasCall && state.amountToCall <= state.bigBlind * 40) {
        return { action: ActionType.CALL, confidence: 0.3, reason: 'EASY_LOOSE_CALL' };
      }
      if (hasFold) return { action: ActionType.FOLD, confidence: 0.9, reason: 'EASY_WEAK_FOLD' };
    }

    // Postflop - simple hand strength based. HandEvaluator.strength is
    // category-banded in clean 0.1 steps (PAIR=0.2x, TWO_PAIR=0.3x,
    // THREE_OF_KIND=0.4x, STRAIGHT=0.5x, FLUSH=0.6x, FULL_HOUSE=0.7x,
    // FOUR_OF_KIND=0.8x...). Full house+ is premium, two pair+ is medium.
    const pairTier = classifyPairTier(state.holeCards, state.boardCards);
    const hasTopPairOrOverpair = isStrongPairTier(pairTier);
    const drawInfo = detectDraws(state.holeCards, state.boardCards);

    if (handResult.strength > 0.65) {
      // Very strong hand
      if (hasCheck) return { action: ActionType.CHECK, confidence: 0.9, reason: 'EASY_STRONG_HAND_CHECK' };
      if (hasCall) return { action: ActionType.CALL, confidence: 0.8, reason: 'EASY_STRONG_HAND_CALL' };
    }

    if (handResult.strength > 0.25 || hasTopPairOrOverpair) {
      // Two pair or better, or top pair/overpair specifically - call more
      // often with top pair and with an overpair.
      if (hasCheck) return { action: ActionType.CHECK, confidence: 0.7, reason: 'EASY_MEDIUM_HAND_CHECK' };
      const potOdds = this.potOddsCalc.calculatePotOdds(state.amountToCall, state.pot);
      const oddsCeiling = hasTopPairOrOverpair ? 90 : 75;
      if (hasCall && potOdds < oddsCeiling) return { action: ActionType.CALL, confidence: 0.5, reason: 'EASY_MEDIUM_HAND_GOOD_ODDS' };
    }

    if (handResult.category === HandCategory.PAIR) {
      // A real pair that isn't top pair/an overpair (middle/bottom pair, an
      // underpair, or the board pairing itself) - still rarely folds.
      if (hasCheck) return { action: ActionType.CHECK, confidence: 0.65, reason: 'EASY_WEAK_PAIR_CHECK' };
      const potOdds = this.potOddsCalc.calculatePotOdds(state.amountToCall, state.pot);
      const oddsCeiling = drawInfo.hasStrongDraw ? 82 : 68;
      if (hasCall && potOdds < oddsCeiling) return { action: ActionType.CALL, confidence: 0.45, reason: 'EASY_WEAK_PAIR_CALL' };
      if (hasFold) return { action: ActionType.FOLD, confidence: 0.5, reason: 'EASY_WEAK_PAIR_FOLD' };
    }

    // No pair at all - fold very rarely by design: keep seeing cards unless
    // the bet is close to an overbet-sized shove relative to the pot.
    if (hasCheck) return { action: ActionType.CHECK, confidence: 0.6, reason: 'EASY_WEAK_POSTFLOP_CHECK' };
    {
      const potOdds = this.potOddsCalc.calculatePotOdds(state.amountToCall, state.pot);
      const oddsCeiling = drawInfo.hasStrongDraw ? 78 : 55;
      if (hasCall && potOdds < oddsCeiling) return { action: ActionType.CALL, confidence: 0.35, reason: 'EASY_LOOSE_POSTFLOP_CALL' };
    }
    if (hasFold) return { action: ActionType.FOLD, confidence: 0.8, reason: 'EASY_AIR_FOLD' };

    // Fallback
    return { action: ActionType.FOLD, confidence: 1, reason: 'EASY_FALLBACK_FOLD' };
  }
}
