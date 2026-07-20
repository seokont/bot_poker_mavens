import { Card, CardRank } from '@poker-bot/shared-types';

export interface DrawInfo {
  hasFlushDraw: boolean;
  hasNutFlushDraw: boolean;
  hasOpenEndedStraightDraw: boolean;
  hasGutshot: boolean;
  hasComboDraw: boolean;
  hasTwoOvercards: boolean;
  hasStrongDraw: boolean;
}

const EMPTY_DRAW_INFO: DrawInfo = {
  hasFlushDraw: false,
  hasNutFlushDraw: false,
  hasOpenEndedStraightDraw: false,
  hasGutshot: false,
  hasComboDraw: false,
  hasTwoOvercards: false,
  hasStrongDraw: false,
};

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function rankValue(rank: CardRank): number {
  return RANK_VALUES[rank] || 0;
}

function hasFiveConsecutive(ranks: Set<number>): boolean {
  const values = [...ranks];
  if (ranks.has(14)) values.push(1); // ace also plays low for the wheel
  const sorted = [...new Set(values)].sort((a, b) => a - b);

  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run++;
      if (run >= 5) return true;
    } else if (sorted[i] !== sorted[i - 1]) {
      run = 1;
    }
  }
  return run >= 5;
}

/**
 * Detects the draws client.md wants treated as "strong" (continue/semi-bluff
 * worthy): flush draws, open-ended straight draws, and combinations of the
 * two. Only meaningful with cards still to come - on the river there's
 * nothing left to draw to, so this always returns the empty/false result
 * there (a "draw" that can never complete isn't a draw, it's just air).
 */
export function detectDraws(holeCards: Card[], boardCards: Card[]): DrawInfo {
  if (boardCards.length < 3 || boardCards.length > 4) return EMPTY_DRAW_INFO;

  const allCards = [...holeCards, ...boardCards];

  const suitCounts = new Map<string, number>();
  allCards.forEach((c) => suitCounts.set(c.suit, (suitCounts.get(c.suit) || 0) + 1));
  let flushSuit: string | null = null;
  for (const [suit, count] of suitCounts) {
    // Exactly 4 of a suit is a draw; 5+ is already a made flush and is
    // handled via HandEvaluator's category instead of this module.
    if (count === 4) flushSuit = suit;
  }
  const hasFlushDraw = flushSuit !== null;
  const hasNutFlushDraw = hasFlushDraw && holeCards.some((c) => c.suit === flushSuit && c.rank === CardRank.ACE);

  const currentRanks = new Set(allCards.map((c) => rankValue(c.rank)));
  let completingOuts = 0;
  for (let candidate = 2; candidate <= 14; candidate++) {
    if (currentRanks.has(candidate)) continue;
    const withCandidate = new Set(currentRanks);
    withCandidate.add(candidate);
    if (hasFiveConsecutive(withCandidate)) completingOuts++;
  }
  const hasOpenEndedStraightDraw = completingOuts >= 2;
  const hasGutshot = completingOuts === 1;

  const hasComboDraw = hasFlushDraw && (hasOpenEndedStraightDraw || hasGutshot);

  const boardRanks = boardCards.map((c) => rankValue(c.rank));
  const topBoardRank = Math.max(...boardRanks);
  const hasTwoOvercards =
    holeCards.length === 2 &&
    rankValue(holeCards[0].rank) > topBoardRank &&
    rankValue(holeCards[1].rank) > topBoardRank;

  const hasStrongDraw = hasFlushDraw || hasOpenEndedStraightDraw || hasComboDraw;

  return {
    hasFlushDraw,
    hasNutFlushDraw,
    hasOpenEndedStraightDraw,
    hasGutshot,
    hasComboDraw,
    hasTwoOvercards,
    hasStrongDraw,
  };
}
