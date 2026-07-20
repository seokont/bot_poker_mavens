import { Card } from '@poker-bot/shared-types';
import { HandCategory } from './hand-evaluator';
import { detectDraws } from './draw-detector';

export interface MissedDrawInfo {
  hadFlushDraw: boolean;
  hadStraightDraw: boolean;
  /**
   * True when hero had a real flush/straight draw earlier in the hand and
   * the final 5-card hand is still only high card or a bare pair - i.e. the
   * draw never paid off and isn't a live reason to continue on the river.
   * poker_mavens_bot_behavior_prompt.md §2/§9/§13: "a missed flush draw or
   * missed straight draw must be treated as high card / a weak pair ... do
   * not call because the hand previously had a draw."
   */
  isMissedDraw: boolean;
}

const NOT_MISSED: MissedDrawInfo = { hadFlushDraw: false, hadStraightDraw: false, isMissedDraw: false };

/**
 * Reconstructs whether a draw was live before the river card landed, using
 * only the flop+turn (first 4 board cards) - only meaningful once the board
 * is complete (5 cards); on any earlier street there's nothing "missed" yet.
 */
export function detectMissedDraw(holeCards: Card[], boardCards: Card[], finalCategory: HandCategory): MissedDrawInfo {
  if (boardCards.length < 5) return NOT_MISSED;

  const preRiverDraws = detectDraws(holeCards, boardCards.slice(0, 4));
  const hadDraw = preRiverDraws.hasFlushDraw || preRiverDraws.hasOpenEndedStraightDraw || preRiverDraws.hasGutshot;
  const finalHandStillWeak = finalCategory === HandCategory.HIGH_CARD || finalCategory === HandCategory.PAIR;

  return {
    hadFlushDraw: preRiverDraws.hasFlushDraw,
    hadStraightDraw: preRiverDraws.hasOpenEndedStraightDraw || preRiverDraws.hasGutshot,
    isMissedDraw: hadDraw && finalHandStillWeak,
  };
}
