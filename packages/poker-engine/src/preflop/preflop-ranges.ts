import { Card, CardRank, Position } from '@poker-bot/shared-types';
import { HandStrengthGroup } from '../hand-strength/hand-evaluator';

// Ascending order so a position "shift" can move a hand up (looser, later
// position) or down (tighter, earlier position) by a fixed number of steps.
const GROUP_ORDER: HandStrengthGroup[] = [
  HandStrengthGroup.TRASH,
  HandStrengthGroup.WEAK,
  HandStrengthGroup.SPECULATIVE,
  HandStrengthGroup.MEDIUM,
  HandStrengthGroup.STRONG,
  HandStrengthGroup.PREMIUM,
];

export class PreflopRanges {
  private static RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  /**
   * Position widens/tightens the effective opening range (spec: UTG ~18-23%
   * up to BTN ~45-60%) without needing a full per-position 13x13 chart -
   * shifting the coarse hand-strength group by a fixed number of steps
   * approximates the same direction (a hand playable on the button but not
   * from UTG lands one tier looser there) while reusing the existing
   * classification. `position` is optional so existing call sites that
   * don't have it yet keep working unchanged.
   */
  classifyHand(cards: Card[], position?: Position): HandStrengthGroup {
    const base = this.classifyHandBase(cards);
    const shift = this.positionShift(position);
    if (shift === 0) return base;

    const idx = GROUP_ORDER.indexOf(base);
    const shiftedIdx = Math.max(0, Math.min(GROUP_ORDER.length - 1, idx + shift));
    return GROUP_ORDER[shiftedIdx];
  }

  private positionShift(position?: Position): number {
    switch (position) {
      case Position.BTN:
        return 2;
      case Position.CO:
      case Position.SB:
        return 1;
      case Position.HJ:
      case Position.BB:
        return 0;
      case Position.MP:
      case Position.UTG1:
        return -1;
      case Position.UTG:
        return -1;
      default:
        return 0;
    }
  }

  private classifyHandBase(cards: Card[]): HandStrengthGroup {
    if (cards.length < 2) return HandStrengthGroup.TRASH;
    
    const [c1, c2] = cards;
    const r1 = this.getRankValue(c1.rank);
    const r2 = this.getRankValue(c2.rank);
    const suited = c1.suit === c2.suit;
    const paired = c1.rank === c2.rank;
    const highCard = Math.max(r1, r2);
    const lowCard = Math.min(r1, r2);
    const gap = highCard - lowCard;

    if (paired) {
      if (highCard >= 12) return HandStrengthGroup.PREMIUM;    // QQ+
      if (highCard >= 10) return HandStrengthGroup.STRONG;     // TT-JJ
      if (highCard >= 8) return HandStrengthGroup.MEDIUM;      // 88-99
      return HandStrengthGroup.SPECULATIVE;                    // 22-77
    }

    // AK
    if (highCard === 14 && lowCard === 13) {
      return suited ? HandStrengthGroup.PREMIUM : HandStrengthGroup.STRONG;
    }

    // AQ, AJ, KQ
    if (highCard === 14 && lowCard >= 11) {
      return suited ? HandStrengthGroup.STRONG : HandStrengthGroup.MEDIUM;
    }
    if (highCard === 13 && lowCard >= 11) {
      return suited ? HandStrengthGroup.STRONG : HandStrengthGroup.MEDIUM;
    }

    // Suited connectors and one-gappers
    if (suited && gap <= 2 && highCard >= 10) {
      return HandStrengthGroup.SPECULATIVE;
    }

    // Suited aces
    if (suited && highCard === 14 && lowCard >= 6) {
      return HandStrengthGroup.SPECULATIVE;
    }

    // High cards
    if (highCard >= 12 && lowCard >= 9) {
      return HandStrengthGroup.MEDIUM;
    }

    return HandStrengthGroup.TRASH;
  }

  isInRange(cards: Card[], allowedGroups: HandStrengthGroup[]): boolean {
    const group = this.classifyHand(cards);
    return allowedGroups.includes(group);
  }

  private getRankValue(rank: CardRank): number {
    return PreflopRanges.RANK_ORDER[rank] || 0;
  }
}
