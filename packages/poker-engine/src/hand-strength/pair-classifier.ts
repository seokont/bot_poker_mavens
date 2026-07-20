import { Card, CardRank } from '@poker-bot/shared-types';

/**
 * Fine-grained classification of a made pair relative to the board -
 * HandCategory.PAIR alone can't tell an overpair from a bottom pair, but
 * client.md requires treating them very differently (overpair/top pair
 * should almost never fold, a bottom pair is allowed to fold more often).
 */
export enum PairTier {
  OVERPAIR = 'OVERPAIR',
  TOP_PAIR_STRONG_KICKER = 'TOP_PAIR_STRONG_KICKER',
  TOP_PAIR_WEAK_KICKER = 'TOP_PAIR_WEAK_KICKER',
  MIDDLE_PAIR = 'MIDDLE_PAIR',
  BOTTOM_PAIR = 'BOTTOM_PAIR',
  UNDERPAIR = 'UNDERPAIR',
  NOT_A_PAIR = 'NOT_A_PAIR',
}

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function rankValue(rank: CardRank): number {
  return RANK_VALUES[rank] || 0;
}

// A ten-or-better kicker alongside top pair counts as "strong" per client.md's
// overpair/top-pair-strong-kicker/top-pair-weak-kicker distinction.
const STRONG_KICKER_MIN = 10;

export function classifyPairTier(holeCards: Card[], boardCards: Card[]): PairTier {
  if (holeCards.length < 2 || boardCards.length === 0) return PairTier.NOT_A_PAIR;

  const [h1, h2] = holeCards;
  const r1 = rankValue(h1.rank);
  const r2 = rankValue(h2.rank);
  const boardRanks = boardCards.map((c) => rankValue(c.rank));
  const uniqueBoardRanks = [...new Set(boardRanks)].sort((a, b) => b - a);
  const topBoardRank = uniqueBoardRanks[0];
  const bottomBoardRank = uniqueBoardRanks[uniqueBoardRanks.length - 1];

  const isPocketPair = r1 === r2;
  if (isPocketPair) {
    return r1 > topBoardRank ? PairTier.OVERPAIR : PairTier.UNDERPAIR;
  }

  const matchedRank = boardRanks.includes(r1) ? r1 : boardRanks.includes(r2) ? r2 : null;
  if (matchedRank === null) return PairTier.NOT_A_PAIR;
  const kicker = matchedRank === r1 ? r2 : r1;

  if (matchedRank === topBoardRank) {
    return kicker >= STRONG_KICKER_MIN ? PairTier.TOP_PAIR_STRONG_KICKER : PairTier.TOP_PAIR_WEAK_KICKER;
  }
  if (matchedRank === bottomBoardRank && uniqueBoardRanks.length > 1) {
    return PairTier.BOTTOM_PAIR;
  }
  return PairTier.MIDDLE_PAIR;
}

export function isStrongPairTier(tier: PairTier): boolean {
  return (
    tier === PairTier.OVERPAIR ||
    tier === PairTier.TOP_PAIR_STRONG_KICKER ||
    tier === PairTier.TOP_PAIR_WEAK_KICKER
  );
}
