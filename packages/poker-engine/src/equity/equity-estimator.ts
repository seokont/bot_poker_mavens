import { HandCategory } from '../hand-strength/hand-evaluator';
import { PairTier } from '../hand-strength/pair-classifier';
import { DrawInfo } from '../hand-strength/draw-detector';
import { OpponentRangeWidth } from './opponent-range-estimator';

function clamp(v: number): number {
  return Math.max(1, Math.min(99, v));
}

/**
 * Rough win-probability estimate (0-100) against a single average opponent -
 * not a real all-cards equity calculator, just enough signal to compare
 * against calculateRequiredEquity() and decide whether a marginal continue
 * clears the bar (poker_mavens_bot_behavior_prompt.md's estimateEquity).
 * Baselines are deliberately conservative for weak hands, even against a
 * "WIDE" read, since the whole point of this spec is to stop the bot from
 * finding excuses to call.
 */
export function estimateEquity(
  category: HandCategory,
  pairTier: PairTier,
  drawInfo: DrawInfo,
  opponentRange: OpponentRangeWidth,
): number {
  const rangeBonus = opponentRange === 'WIDE' ? 10 : opponentRange === 'MEDIUM' ? 0 : -10;

  switch (category) {
    case HandCategory.ROYAL_FLUSH:
    case HandCategory.STRAIGHT_FLUSH:
    case HandCategory.FOUR_OF_KIND:
    case HandCategory.FULL_HOUSE:
      return 97;
    case HandCategory.FLUSH:
      return clamp(82 + rangeBonus);
    case HandCategory.STRAIGHT:
      return clamp(78 + rangeBonus);
    case HandCategory.THREE_OF_KIND:
      return clamp(75 + rangeBonus);
    case HandCategory.TWO_PAIR:
      return clamp(68 + rangeBonus);
    case HandCategory.PAIR: {
      const base =
        pairTier === PairTier.OVERPAIR ? 65
        : pairTier === PairTier.TOP_PAIR_STRONG_KICKER ? 58
        : pairTier === PairTier.TOP_PAIR_WEAK_KICKER ? 50
        : pairTier === PairTier.MIDDLE_PAIR ? 38
        : pairTier === PairTier.BOTTOM_PAIR ? 28
        : pairTier === PairTier.UNDERPAIR ? 25
        : 20; // NOT_A_PAIR - the board pairs itself, hero doesn't hold the pairing card
      const drawBonus = drawInfo.hasStrongDraw ? 12 : drawInfo.hasGutshot ? 4 : 0;
      return clamp(base + rangeBonus + drawBonus);
    }
    default: {
      // HIGH_CARD - value comes almost entirely from a live draw.
      let base = 8;
      if (drawInfo.hasFlushDraw) base += 20;
      if (drawInfo.hasOpenEndedStraightDraw) base += 16;
      if (drawInfo.hasGutshot) base += 8;
      if (drawInfo.hasComboDraw) base += 8;
      if (drawInfo.hasTwoOvercards) base += 5;
      return clamp(base + rangeBonus);
    }
  }
}
