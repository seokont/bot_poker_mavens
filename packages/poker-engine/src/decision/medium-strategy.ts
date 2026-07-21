import { GameState, BotDecisionResult, StrategyConfig, ActionType, GameType } from '@poker-bot/shared-types';
import { HandEvaluator, HandStrengthGroup, HandCategory } from '../hand-strength/hand-evaluator';
import { PotOddsCalculator } from '../pot-odds/pot-odds-calculator';
import { BetSizer } from '../bet-sizing/bet-sizer';
import { PreflopRanges } from '../preflop/preflop-ranges';
import { OmahaPreflopRanges } from '../preflop/omaha-preflop-ranges';
import { SprCalculator } from '../spr/spr-calculator';
import { BoardTextureAnalyzer } from '../board-texture/board-texture-analyzer';
import { classifyPairTier, isStrongPairTier, PairTier } from '../hand-strength/pair-classifier';
import { detectDraws } from '../hand-strength/draw-detector';
import { classifyBetSizeTier, BetSizeTier } from '../bet-sizing/bet-size-tier';
import { ActionWeights, pickWeightedAction, capFoldWeight, scaleFoldWeight } from './weighted-action';

function isOmaha(gameType: GameType): boolean {
  return gameType === GameType.PLO4 || gameType === GameType.PLO5 || gameType === GameType.PLO6;
}

type MadeHandTier = 'FLUSH' | 'STRAIGHT' | 'TRIPS' | 'TWO_PAIR' | 'PAIR_STRONG' | 'PAIR_WEAK' | 'STRONG_DRAW' | 'AIR';

/**
 * Operator-requested play style (reverted from a stricter anti-calling-
 * station pass): fold very rarely, play made hands loosely within
 * per-category caps, and bluff/semi-bluff frequently with air and draws
 * rather than only ever calling passively.
 */
export class MediumStrategy {
  private handEvaluator = new HandEvaluator();
  private potOddsCalc = new PotOddsCalculator();
  private betSizer = new BetSizer();
  private preflopRanges = new PreflopRanges();
  private omahaPreflopRanges = new OmahaPreflopRanges();
  private sprCalculator = new SprCalculator();
  private boardTexture = new BoardTextureAnalyzer();

  decide(state: GameState, config: StrategyConfig): BotDecisionResult {
    const allowed = state.allowedActions;
    const hasCheck = allowed.some(a => a.action === ActionType.CHECK);
    const hasFold = allowed.some(a => a.action === ActionType.FOLD);
    const hasCall = allowed.some(a => a.action === ActionType.CALL);
    const hasBet = allowed.some(a => a.action === ActionType.BET);
    const hasRaise = allowed.some(a => a.action === ActionType.RAISE);
    const hasAllIn = allowed.some(a => a.action === ActionType.ALL_IN);

    const potOdds = this.potOddsCalc.calculatePotOdds(state.amountToCall, state.pot);

    // Calculate effective stack considering actual stacks
    const effectiveStack = Math.min(
      state.heroStack,
      ...state.players.filter(p => !p.isHero && !p.hasFolded).map(p => p.stack)
    );
    const spr = this.sprCalculator.calculateSPR(effectiveStack, state.pot);
    const sprCategory = this.sprCalculator.getSprCategory(spr);
    const isShortStacked = sprCategory === 'LOW';
    const omaha = isOmaha(state.gameType);

    // Check-raise setup: hero already checked this street and is now
    // facing a bet (allowedActions offering RAISE rather than an opening
    // BET confirms someone bet after hero's check). Detected from
    // actionHistory rather than tracked state so it works across ticks.
    const heroName = state.players.find(p => p.isHero)?.playerName;
    const checkedThisStreet = heroName
      ? state.actionHistory.some(a => a.street === state.street && a.playerName === heroName && a.action === ActionType.CHECK)
      : false;
    const checkRaiseOpportunity = checkedThisStreet && hasRaise;

    if (state.street === 'PREFLOP') {
      const group = omaha
        ? this.omahaPreflopRanges.classifyHand(state.holeCards)
        : this.preflopRanges.classifyHand(state.holeCards, state.position);
      const raiseSize = () => {
        const suggested = this.betSizer.getSuggestedBets(
          Math.max(state.pot, state.bigBlind * 2),
          state.street,
          state.gameType,
        );
        const target = Math.max(suggested[0] ?? state.bigBlind * 3, state.amountToCall * 3, state.minRaiseTo);
        return Math.min(target, state.maxRaiseTo, state.heroStack);
      };

      if (group === HandStrengthGroup.PREMIUM || group === HandStrengthGroup.STRONG) {
        const cannotCoverMinRaise = state.heroStack < state.minRaiseTo;
        if ((isShortStacked || cannotCoverMinRaise) && hasAllIn) {
          return { action: ActionType.ALL_IN, confidence: 0.85, reason: 'MEDIUM_PREFLOP_SHORT_STACK_SHOVE' };
        }
        if (hasRaise && !cannotCoverMinRaise) {
          return { action: ActionType.RAISE, amount: raiseSize(), confidence: 0.85, reason: `MEDIUM_PREFLOP_${group}_RAISE` };
        }
        if (hasBet && !cannotCoverMinRaise) {
          return { action: ActionType.BET, amount: raiseSize(), confidence: 0.85, reason: `MEDIUM_PREFLOP_${group}_OPEN` };
        }
        if (hasCall) {
          return { action: ActionType.CALL, confidence: 0.8, reason: `MEDIUM_PREFLOP_${group}_CALL` };
        }
        if (hasCheck) {
          return { action: ActionType.CHECK, confidence: 0.8, reason: `MEDIUM_PREFLOP_${group}_CHECK` };
        }
      }

      if (group === HandStrengthGroup.MEDIUM) {
        if (hasCheck) {
          return { action: ActionType.CHECK, confidence: 0.65, reason: 'MEDIUM_PREFLOP_MEDIUM_CHECK' };
        }
        // Operator-requested loosening: the old bigBlind*40 absolute cap
        // blocked a medium-strength hand from calling any bet bigger than
        // 40bb regardless of pot odds - confirmed live, it folded hands
        // with ~44% required equity (well within potOdds<85) purely
        // because the raise/all-in was large in chip terms. Widened to
        // bigBlind*300 so pot odds (the actually correct metric) decide
        // instead of a flat chip-count wall.
        if (hasCall && state.amountToCall <= state.bigBlind * 300 && potOdds < 85) {
          return { action: ActionType.CALL, confidence: 0.6, reason: 'MEDIUM_PREFLOP_MEDIUM_CALL' };
        }
        // Occasionally re-raise/shove with real medium strength instead of
        // only ever calling passively, when there's still room to raise and
        // the price is clearly favorable.
        if (hasRaise && potOdds < 35 && Math.random() < 0.25) {
          return { action: ActionType.RAISE, amount: raiseSize(), confidence: 0.55, reason: 'MEDIUM_PREFLOP_MEDIUM_RERAISE' };
        }
        if (hasAllIn && isShortStacked && potOdds < 60) {
          return { action: ActionType.ALL_IN, confidence: 0.6, reason: 'MEDIUM_PREFLOP_MEDIUM_SHOVE' };
        }
      }

      if (group === HandStrengthGroup.SPECULATIVE) {
        if (hasCheck) {
          return { action: ActionType.CHECK, confidence: 0.6, reason: 'MEDIUM_PREFLOP_SPECULATIVE_CHECK' };
        }
        if (hasCall && state.amountToCall <= state.bigBlind * 40 && potOdds < 85) {
          return { action: ActionType.CALL, confidence: 0.45, reason: 'MEDIUM_PREFLOP_SPECULATIVE_CALL' };
        }
      }

      // WEAK/TRASH, or a marginal group that couldn't act above - still
      // played loose by design rather than folding on reflex.
      if (hasCheck) {
        return { action: ActionType.CHECK, confidence: 0.5, reason: 'MEDIUM_PREFLOP_WEAK_CHECK' };
      }
      if (hasCall && state.amountToCall <= state.bigBlind * 40) {
        return { action: ActionType.CALL, confidence: 0.3, reason: 'MEDIUM_PREFLOP_LOOSE_CALL' };
      }
      if (hasFold) {
        return { action: ActionType.FOLD, confidence: 0.85, reason: 'MEDIUM_PREFLOP_WEAK_FOLD' };
      }
      return { action: ActionType.FOLD, confidence: 1, reason: 'MEDIUM_PREFLOP_FALLBACK_FOLD' };
    }

    const handResult = omaha
      ? this.handEvaluator.evaluateOmahaHand(state.holeCards, state.boardCards)
      : this.handEvaluator.evaluateHand(state.holeCards, state.boardCards);

    const pairTier = classifyPairTier(state.holeCards, state.boardCards);
    const drawInfo = detectDraws(state.holeCards, state.boardCards);
    const hasTopPairOrOverpair = isStrongPairTier(pairTier);
    const betTier = classifyBetSizeTier(state.amountToCall, state.pot);
    const isHeadsUp = state.activePlayerCount <= 2;
    const isMultiway = state.activePlayerCount >= 4;
    const isRiver = state.street === 'RIVER';

    // Check for all-in opportunity (short stack) - two pair or better, or a
    // strong top pair/overpair, is effectively already committed at a low SPR.
    if (hasAllIn && isShortStacked && (handResult.strength > 0.3 || hasTopPairOrOverpair)) {
      return {
        action: ActionType.ALL_IN,
        confidence: 0.7,
        reason: 'MEDIUM_SHORT_STACK_ALL_IN',
      };
    }

    if (handResult.strength > 0.65) {
      // Premium hand - value bet or raise.
      const cannotCoverMinRaise = state.heroStack < state.minRaiseTo;
      if ((hasBet || hasRaise) && !cannotCoverMinRaise) {
        const texture = this.boardTexture.classify(state.boardCards);
        const suggestedBets = this.betSizer.getSuggestedBets(state.pot, state.street, state.gameType);
        const betSize = suggestedBets.length > 0 ? suggestedBets[this.pickBetIndex(suggestedBets, texture, 0.5)] : state.pot;
        const clampedBet = Math.min(Math.max(betSize, state.minRaiseTo), state.maxRaiseTo);

        const action = hasRaise ? ActionType.RAISE : ActionType.BET;
        const reason = checkRaiseOpportunity
          ? `MEDIUM_CHECK_RAISE_${handResult.category}`
          : `MEDIUM_VALUE_BET_${handResult.category}`;
        return { action, amount: clampedBet, confidence: 0.85, reason };
      }
      if (cannotCoverMinRaise && hasAllIn) {
        return { action: ActionType.ALL_IN, confidence: 0.85, reason: 'MEDIUM_VALUE_SHOVE_SHORT' };
      }
      if (hasCheck) return { action: ActionType.CHECK, confidence: 0.8, reason: 'MEDIUM_STRONG_CHECK' };
      if (hasCall) return { action: ActionType.CALL, confidence: 0.9, reason: 'MEDIUM_STRONG_CALL' };
    }

    if (handResult.strength > 0.25 || hasTopPairOrOverpair) {
      // Medium-plus hand (two pair or better, short of full house - also
      // covers three-of-a-kind/straight/most flushes - or top
      // pair/overpair specifically).
      const cannotCoverMinRaise = state.heroStack < state.minRaiseTo;
      const texture = this.boardTexture.classify(state.boardCards);
      if (hasBet && !cannotCoverMinRaise) {
        const suggestedBets = this.betSizer.getSuggestedBets(state.pot, state.street, state.gameType);
        const betSize = suggestedBets.length > 0
          ? suggestedBets[this.pickBetIndex(suggestedBets, texture, 0.2)]
          : state.pot * 0.4;
        const clampedBet = Math.min(Math.max(betSize, state.minRaiseTo), state.maxRaiseTo);
        return { action: ActionType.BET, amount: clampedBet, confidence: 0.65, reason: `MEDIUM_THIN_VALUE_BET_${handResult.category}` };
      }
      if (checkRaiseOpportunity && !cannotCoverMinRaise && Math.random() < 0.55) {
        const suggestedBets = this.betSizer.getSuggestedBets(state.pot, state.street, state.gameType);
        const betSize = suggestedBets.length > 0 ? suggestedBets[this.pickBetIndex(suggestedBets, texture, 0.4)] : state.pot * 0.6;
        const target = Math.max(betSize, state.amountToCall * 2.5, state.minRaiseTo);
        const clampedBet = Math.min(target, state.maxRaiseTo, state.heroStack);
        return { action: ActionType.RAISE, amount: clampedBet, confidence: 0.6, reason: `MEDIUM_CHECK_RAISE_${handResult.category}` };
      }
      if (hasCheck) return { action: ActionType.CHECK, confidence: 0.7, reason: 'MEDIUM_MEDIUM_CHECK' };

      if (hasCall || hasFold) {
        const tier = this.madeHandTierFor(handResult.category, pairTier) ?? 'PAIR_STRONG';
        let weights = MediumStrategy.MADE_HAND_WEIGHTS[tier][betTier];
        if (isHeadsUp) weights = scaleFoldWeight(weights, 0.6);
        if (isRiver) weights = scaleFoldWeight(weights, 0.85);
        if (handResult.category === HandCategory.PAIR && drawInfo.hasStrongDraw) {
          weights = this.blendWithDraw(weights, betTier);
        }
        weights = this.applyFoldCap(weights, tier, betTier);
        const raisePreference = tier === 'PAIR_STRONG' || tier === 'PAIR_WEAK' ? 0.25 : 0.55;
        return this.resolveWeightedDecision(state, weights, `MEDIUM_${tier}`, betTier, raisePreference);
      }
    }

    if (handResult.category === HandCategory.PAIR) {
      // A real (non-top, non-overpair) pair - middle/bottom pair, an
      // underpair, or a "board pairs itself" hand.
      if (hasCheck) return { action: ActionType.CHECK, confidence: 0.6, reason: `MEDIUM_PAIR_${pairTier}_CHECK` };
      if (hasCall || hasFold) {
        let weights = MediumStrategy.MADE_HAND_WEIGHTS.PAIR_WEAK[betTier];
        if (isHeadsUp) weights = scaleFoldWeight(weights, 0.6);
        if (isMultiway) weights = scaleFoldWeight(weights, 1.15);
        if (isRiver) weights = scaleFoldWeight(weights, 0.85);
        if (drawInfo.hasStrongDraw) weights = this.blendWithDraw(weights, betTier);
        weights = this.applyFoldCap(weights, 'PAIR_WEAK', betTier);
        return this.resolveWeightedDecision(state, weights, `MEDIUM_PAIR_${pairTier}`, betTier, 0.2);
      }
    }

    // No pair at all - weak hand or bluff opportunity. c-bet frequently on
    // dry boards (favors the range of whoever bet first) and still often on
    // wet/paired ones where a check-back would otherwise protect the range -
    // bluffing often, not just occasionally, is the operator-requested style.
    const texture = this.boardTexture.classify(state.boardCards);
    const textureBluffMultiplier = texture === 'DRY' ? 1.4 : texture === 'WET' ? 0.6 : 0.8;
    const bluffThreshold = Math.max(config.bluffFrequency || 0.15, 0.35) * textureBluffMultiplier;
    if (hasBet && !hasCheck && Math.random() < bluffThreshold) {
      const cbetSize = state.pot * (texture === 'DRY' ? 0.33 : 0.66);
      return {
        action: ActionType.BET,
        amount: Math.min(Math.max(cbetSize, state.minRaiseTo), state.maxRaiseTo),
        confidence: 0.3,
        reason: 'MEDIUM_CBET_BLUFF',
      };
    }

    if (hasCheck) return { action: ActionType.CHECK, confidence: 0.5, reason: 'MEDIUM_WEAK_CHECK' };

    if (hasCall || hasFold) {
      const tier: MadeHandTier = drawInfo.hasStrongDraw ? 'STRONG_DRAW' : 'AIR';
      let weights = MediumStrategy.MADE_HAND_WEIGHTS[tier][betTier];
      if (isHeadsUp && tier === 'STRONG_DRAW') weights = scaleFoldWeight(weights, 0.6);
      if (isMultiway && tier === 'AIR') weights = scaleFoldWeight(weights, 1.1);
      return this.resolveWeightedDecision(state, weights, `MEDIUM_${tier}`, betTier, tier === 'STRONG_DRAW' ? 0.35 : 0.3);
    }

    return { action: ActionType.FOLD, confidence: 1, reason: 'MEDIUM_FALLBACK_FOLD' };
  }

  private madeHandTierFor(category: HandCategory, pairTier: PairTier): MadeHandTier | null {
    switch (category) {
      case HandCategory.FLUSH:
        return 'FLUSH';
      case HandCategory.STRAIGHT:
        return 'STRAIGHT';
      case HandCategory.THREE_OF_KIND:
        return 'TRIPS';
      case HandCategory.TWO_PAIR:
        return 'TWO_PAIR';
      case HandCategory.PAIR:
        return isStrongPairTier(pairTier) ? 'PAIR_STRONG' : 'PAIR_WEAK';
      default:
        return null;
    }
  }

  private blendWithDraw(weights: ActionWeights, betTier: BetSizeTier): ActionWeights {
    const drawWeights = MediumStrategy.MADE_HAND_WEIGHTS.STRONG_DRAW[betTier];
    return {
      fold: (weights.fold + drawWeights.fold) / 2,
      call: (weights.call + drawWeights.call) / 2,
      raise: (weights.raise + drawWeights.raise) / 2,
    };
  }

  /**
   * Enforces the per-category max fold frequency, except at the OVERBET
   * tier for one-pair hands specifically ("one pair may fold depending on
   * the board" is the explicit overbet carve-out). Two pair and better keep
   * their cap even at an overbet size.
   */
  private applyFoldCap(weights: ActionWeights, tier: MadeHandTier, betTier: BetSizeTier): ActionWeights {
    const isOnePair = tier === 'PAIR_STRONG' || tier === 'PAIR_WEAK';
    if (betTier === 'OVERBET' && isOnePair) return weights;
    const cap = MediumStrategy.MAX_FOLD_BY_TIER[tier];
    return cap !== undefined ? capFoldWeight(weights, cap) : weights;
  }

  /**
   * Turns a fold/call/raise weight distribution into an actual decision,
   * respecting whichever of raise/call/fold are legal right now and sizing
   * any raise via the existing texture-aware bet sizer.
   */
  private resolveWeightedDecision(
    state: GameState,
    weights: ActionWeights,
    reasonPrefix: string,
    betTier: BetSizeTier,
    raiseBasePreference: number,
  ): BotDecisionResult {
    const allowed = state.allowedActions;
    const hasFold = allowed.some(a => a.action === ActionType.FOLD);
    const hasCall = allowed.some(a => a.action === ActionType.CALL);
    const hasRaise = allowed.some(a => a.action === ActionType.RAISE);
    const hasBet = allowed.some(a => a.action === ActionType.BET);
    const hasAllIn = allowed.some(a => a.action === ActionType.ALL_IN);
    const cannotCoverMinRaise = state.heroStack < state.minRaiseTo;

    const pick = pickWeightedAction(weights);

    if (pick === 'raise' && (hasRaise || hasBet) && !cannotCoverMinRaise) {
      const texture = this.boardTexture.classify(state.boardCards);
      const suggestedBets = this.betSizer.getSuggestedBets(state.pot, state.street, state.gameType);
      const betSize = suggestedBets.length > 0
        ? suggestedBets[this.pickBetIndex(suggestedBets, texture, raiseBasePreference)]
        : state.pot * 0.5;
      const target = Math.max(betSize, state.amountToCall > 0 ? state.amountToCall * 2.5 : 0, state.minRaiseTo);
      const clampedAmount = Math.min(target, state.maxRaiseTo, state.heroStack);
      const action = hasRaise ? ActionType.RAISE : ActionType.BET;
      return { action, amount: clampedAmount, confidence: 0.65, reason: `${reasonPrefix}_${betTier}_RAISE` };
    }

    if (pick === 'raise' && cannotCoverMinRaise && hasAllIn) {
      return { action: ActionType.ALL_IN, confidence: 0.65, reason: `${reasonPrefix}_${betTier}_SHOVE_SHORT` };
    }

    if ((pick === 'raise' || pick === 'call') && hasCall) {
      return { action: ActionType.CALL, confidence: 0.6, reason: `${reasonPrefix}_${betTier}_CALL` };
    }

    if (pick === 'fold' && hasFold) {
      return { action: ActionType.FOLD, confidence: 0.55, reason: `${reasonPrefix}_${betTier}_FOLD` };
    }

    if (hasCall) return { action: ActionType.CALL, confidence: 0.5, reason: `${reasonPrefix}_${betTier}_CALL_FALLBACK` };
    if (hasFold) return { action: ActionType.FOLD, confidence: 0.5, reason: `${reasonPrefix}_${betTier}_FOLD_FALLBACK` };
    return { action: ActionType.FOLD, confidence: 0.5, reason: `${reasonPrefix}_${betTier}_NO_LEGAL_ACTION` };
  }

  /**
   * Picks an index into BetSizer's ascending suggested-size list biased by
   * board texture and a base preference (0=smallest available, 1=biggest):
   * dry boards want smaller bets (targets a wide range, cheap to bluff),
   * wet/paired boards want bigger ones (protection, polarized value).
   */
  private pickBetIndex(suggestedBets: number[], texture: 'DRY' | 'WET' | 'PAIRED', basePreference: number): number {
    if (suggestedBets.length === 0) return 0;
    const textureBias = texture === 'DRY' ? -0.25 : texture === 'WET' || texture === 'PAIRED' ? 0.25 : 0;
    const fraction = Math.min(1, Math.max(0, basePreference + textureBias));
    return Math.round(fraction * (suggestedBets.length - 1));
  }

  // Weighted fold/call/raise distributions per made-hand tier and bet-size
  // tier. AIR and STRONG_DRAW carry meaningfully higher raise (bluff/semi-
  // bluff) weight than a "value only" table would, per the operator's
  // "bluff often, don't just call passively" instruction.
  private static MADE_HAND_WEIGHTS: Record<MadeHandTier, Record<BetSizeTier, ActionWeights>> = {
    FLUSH: {
      SMALL: { fold: 0, call: 0.25, raise: 0.75 },
      MEDIUM: { fold: 0.01, call: 0.28, raise: 0.71 },
      LARGE: { fold: 0.015, call: 0.335, raise: 0.65 },
      HUGE: { fold: 0.02, call: 0.48, raise: 0.50 },
      OVERBET: { fold: 0.03, call: 0.57, raise: 0.40 },
    },
    STRAIGHT: {
      SMALL: { fold: 0, call: 0.25, raise: 0.75 },
      MEDIUM: { fold: 0.01, call: 0.28, raise: 0.71 },
      LARGE: { fold: 0.015, call: 0.335, raise: 0.65 },
      HUGE: { fold: 0.02, call: 0.48, raise: 0.50 },
      OVERBET: { fold: 0.03, call: 0.57, raise: 0.40 },
    },
    TRIPS: {
      SMALL: { fold: 0, call: 0.30, raise: 0.70 },
      MEDIUM: { fold: 0.01, call: 0.30, raise: 0.69 },
      LARGE: { fold: 0.02, call: 0.38, raise: 0.60 },
      HUGE: { fold: 0.04, call: 0.46, raise: 0.50 },
      OVERBET: { fold: 0.05, call: 0.55, raise: 0.40 },
    },
    TWO_PAIR: {
      SMALL: { fold: 0, call: 0.45, raise: 0.55 },
      MEDIUM: { fold: 0.02, call: 0.45, raise: 0.53 },
      LARGE: { fold: 0.05, call: 0.55, raise: 0.40 },
      HUGE: { fold: 0.08, call: 0.62, raise: 0.30 },
      OVERBET: { fold: 0.10, call: 0.60, raise: 0.30 },
    },
    PAIR_STRONG: {
      SMALL: { fold: 0, call: 0.75, raise: 0.25 },
      MEDIUM: { fold: 0.03, call: 0.62, raise: 0.35 },
      LARGE: { fold: 0.08, call: 0.72, raise: 0.20 },
      HUGE: { fold: 0.15, call: 0.70, raise: 0.15 },
      OVERBET: { fold: 0.25, call: 0.65, raise: 0.10 },
    },
    PAIR_WEAK: {
      SMALL: { fold: 0, call: 0.80, raise: 0.20 },
      MEDIUM: { fold: 0.08, call: 0.72, raise: 0.20 },
      LARGE: { fold: 0.20, call: 0.65, raise: 0.15 },
      HUGE: { fold: 0.30, call: 0.60, raise: 0.10 },
      OVERBET: { fold: 0.40, call: 0.50, raise: 0.10 },
    },
    STRONG_DRAW: {
      SMALL: { fold: 0.03, call: 0.37, raise: 0.60 },
      MEDIUM: { fold: 0.05, call: 0.35, raise: 0.60 },
      LARGE: { fold: 0.10, call: 0.40, raise: 0.50 },
      HUGE: { fold: 0.20, call: 0.40, raise: 0.40 },
      OVERBET: { fold: 0.30, call: 0.35, raise: 0.35 },
    },
    AIR: {
      SMALL: { fold: 0.35, call: 0.35, raise: 0.30 },
      MEDIUM: { fold: 0.50, call: 0.25, raise: 0.25 },
      LARGE: { fold: 0.65, call: 0.20, raise: 0.15 },
      HUGE: { fold: 0.75, call: 0.15, raise: 0.10 },
      OVERBET: { fold: 0.80, call: 0.12, raise: 0.08 },
    },
  };

  // Suggested maximum fold frequencies against "normal" bets - not applied
  // to STRONG_DRAW/AIR, and not applied at the OVERBET tier for one-pair
  // hands (the explicit overbet carve-out).
  private static MAX_FOLD_BY_TIER: Partial<Record<MadeHandTier, number>> = {
    TWO_PAIR: 0.10,
    TRIPS: 0.05,
    STRAIGHT: 0.03,
    FLUSH: 0.03,
    PAIR_STRONG: 0.30,
    PAIR_WEAK: 0.30,
  };
}
