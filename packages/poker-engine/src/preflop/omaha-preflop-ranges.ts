import { Card, CardRank } from '@poker-bot/shared-types';
import { HandStrengthGroup } from '../hand-strength/hand-evaluator';

/**
 * Simplified 4-card Omaha starting-hand heuristic. Real Omaha hand strength
 * is dominated by three factors this checks in combination rather than in
 * isolation (a lone big pair or a lone suited pair means much less than
 * either combined with the others):
 *  - pairing (especially a big pair - can flop trips/quads)
 *  - "double suited" (two different flush draws available, not just one)
 *  - connectivity (four ranks close enough together to make a rundown/
 *    straight, e.g. 9-T-J-Q, as opposed to disconnected cards like 2-7-J-K)
 * A hand with all 4 cards the same rank (e.g. AAAA) is intentionally
 * demoted - Omaha only lets you use 2 of your 4 hole cards, so a "quad"
 * hole hand can never use more than a pair of it and wastes its other two
 * card slots entirely.
 */
export class OmahaPreflopRanges {
  private static RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  classifyHand(cards: Card[]): HandStrengthGroup {
    if (cards.length < 4) return HandStrengthGroup.TRASH;

    const ranks = cards.map((c) => this.getRankValue(c.rank)).sort((a, b) => b - a);
    const suits = cards.map((c) => c.suit);

    const suitCounts = new Map<string, number>();
    suits.forEach((s) => suitCounts.set(s, (suitCounts.get(s) || 0) + 1));
    const flushableSuits = [...suitCounts.values()].filter((count) => count >= 2).length;
    const doubleSuited = flushableSuits >= 2;
    const singleSuited = flushableSuits === 1;

    const rankCounts = new Map<number, number>();
    ranks.forEach((r) => rankCounts.set(r, (rankCounts.get(r) || 0) + 1));
    const pairRanks = [...rankCounts.entries()].filter(([, count]) => count >= 2).map(([rank]) => rank);
    const hasQuadRank = [...rankCounts.values()].some((count) => count === 4);
    const topPairRank = pairRanks.length > 0 ? Math.max(...pairRanks) : 0;
    const hasBigPair = topPairRank >= 13; // KK or AA among the hole cards

    const uniqueRanks = [...new Set(ranks)];
    const spread = uniqueRanks.length > 1 ? uniqueRanks[0] - uniqueRanks[uniqueRanks.length - 1] : 0;
    const wellConnected = uniqueRanks.length >= 3 && spread <= 4;

    // All 4 cards the same rank - can only ever use 2 of them, the other
    // 2 hole-card slots are dead weight. Genuinely weak despite "having a pair".
    if (hasQuadRank) return HandStrengthGroup.TRASH;

    if (hasBigPair && doubleSuited) return HandStrengthGroup.PREMIUM;
    if (hasBigPair && (singleSuited || wellConnected)) return HandStrengthGroup.STRONG;
    if (doubleSuited && wellConnected) return HandStrengthGroup.STRONG;
    if (doubleSuited || pairRanks.length > 0) return HandStrengthGroup.MEDIUM;
    if (singleSuited && wellConnected) return HandStrengthGroup.MEDIUM;
    if (singleSuited || wellConnected) return HandStrengthGroup.SPECULATIVE;

    return HandStrengthGroup.WEAK;
  }

  isInRange(cards: Card[], allowedGroups: HandStrengthGroup[]): boolean {
    const group = this.classifyHand(cards);
    return allowedGroups.includes(group);
  }

  private getRankValue(rank: CardRank): number {
    return OmahaPreflopRanges.RANK_ORDER[rank] || 0;
  }
}
