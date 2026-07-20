import { Card, CardRank } from '@poker-bot/shared-types';

export type BoardTexture = 'DRY' | 'WET' | 'PAIRED';

/**
 * Classifies flop/turn/river texture for c-bet/value-bet sizing (spec:
 * smaller on dry boards, bigger on wet ones). PAIRED takes priority since
 * a paired board changes range considerations (full houses/trips become
 * live) regardless of suit/connectivity.
 */
export class BoardTextureAnalyzer {
  private static RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  classify(boardCards: Card[]): BoardTexture {
    if (boardCards.length < 3) return 'DRY';

    const ranks = boardCards.map((c) => this.getRankValue(c.rank)).sort((a, b) => b - a);
    const suits = boardCards.map((c) => c.suit);

    const rankCounts = new Map<number, number>();
    ranks.forEach((r) => rankCounts.set(r, (rankCounts.get(r) || 0) + 1));
    if ([...rankCounts.values()].some((count) => count >= 2)) return 'PAIRED';

    const suitCounts = new Map<string, number>();
    suits.forEach((s) => suitCounts.set(s, (suitCounts.get(s) || 0) + 1));
    const flushDrawPossible = [...suitCounts.values()].some((count) => count >= 2);

    const uniqueRanks = [...new Set(ranks)];
    const spread = uniqueRanks[0] - uniqueRanks[uniqueRanks.length - 1];
    // Three cards within a 4-rank spread (e.g. 9-7-6) always leave a
    // straight-completing gutshot or better live for some two-card holding.
    const connected = uniqueRanks.length >= 3 && spread <= 4;

    return flushDrawPossible || connected ? 'WET' : 'DRY';
  }

  private getRankValue(rank: CardRank): number {
    return BoardTextureAnalyzer.RANK_ORDER[rank] || 0;
  }
}
