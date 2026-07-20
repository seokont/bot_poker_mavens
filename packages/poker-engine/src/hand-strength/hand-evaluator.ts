import { Card } from '@poker-bot/shared-types';

// Simple 5-card hand evaluator using prime multiplication method
// export enum HandCategory { HIGH_CARD, PAIR, TWO_PAIR, THREE_OF_KIND, STRAIGHT, FLUSH, FULL_HOUSE, FOUR_OF_KIND, STRAIGHT_FLUSH, ROYAL_FLUSH }

export enum HandCategory {
  HIGH_CARD = 'HIGH_CARD',
  PAIR = 'PAIR',
  TWO_PAIR = 'TWO_PAIR',
  THREE_OF_KIND = 'THREE_OF_KIND',
  STRAIGHT = 'STRAIGHT',
  FLUSH = 'FLUSH',
  FULL_HOUSE = 'FULL_HOUSE',
  FOUR_OF_KIND = 'FOUR_OF_KIND',
  STRAIGHT_FLUSH = 'STRAIGHT_FLUSH',
  ROYAL_FLUSH = 'ROYAL_FLUSH',
}

export enum HandStrengthGroup {
  PREMIUM = 'PREMIUM',
  STRONG = 'STRONG',
  MEDIUM = 'MEDIUM',
  SPECULATIVE = 'SPECULATIVE',
  WEAK = 'WEAK',
  TRASH = 'TRASH',
}

export interface HandEvaluationResult {
  category: HandCategory;
  rank: number;        // Higher = better hand (1-7462 for all 5-card hands)
  strength: number;    // Normalized 0-1
  group: HandStrengthGroup;
}

export class HandEvaluator {
  private static RANK_VALUES: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  /**
   * Omaha hand evaluation - unlike hold'em (best 5 of all 7 cards), Omaha
   * has a strict rule: exactly 2 of your (4) hole cards + exactly 3 of the
   * board. Enumerates every valid combination and reuses evaluateFiveCards
   * for scoring, then picks the best (e.g. a hand with 4 cards of one suit
   * doesn't make a flush here unless exactly 2 of those + 3 suited board
   * cards forms one - holding all 4 spades is not a flush in Omaha).
   */
  evaluateOmahaHand(holeCards: Card[], boardCards: Card[]): HandEvaluationResult {
    if (holeCards.length < 4 || boardCards.length < 3) {
      return {
        category: HandCategory.HIGH_CARD,
        rank: 0,
        strength: 0,
        group: HandStrengthGroup.WEAK,
      };
    }

    const holePairs = this.getCombinations(holeCards, 2);
    const boardTriples = this.getCombinations(boardCards, 3);

    let bestResult: HandEvaluationResult | null = null;
    for (const hole2 of holePairs) {
      for (const board3 of boardTriples) {
        const result = this.evaluateFiveCards([...hole2, ...board3]);
        if (!bestResult || result.rank > bestResult.rank) {
          bestResult = result;
        }
      }
    }

    if (!bestResult) {
      return {
        category: HandCategory.HIGH_CARD,
        rank: 0,
        strength: 0,
        group: HandStrengthGroup.WEAK,
      };
    }

    bestResult.group = this.classifyOmahaStrength(bestResult);
    return bestResult;
  }

  /**
   * Coarser than the hold'em classifier on purpose - Omaha's "is this pair
   * mine or the board's" distinction that classifyHandStrength relies on
   * doesn't map cleanly onto a 2-of-4 hole selection, and a bare pair is
   * rarely worth playing for value in Omaha given how often opponents have
   * two pair or better with 4 cards each.
   */
  private classifyOmahaStrength(result: HandEvaluationResult): HandStrengthGroup {
    if (result.category === HandCategory.ROYAL_FLUSH || result.category === HandCategory.STRAIGHT_FLUSH) {
      return HandStrengthGroup.PREMIUM;
    }
    if (result.category === HandCategory.FOUR_OF_KIND || result.category === HandCategory.FULL_HOUSE) {
      return HandStrengthGroup.PREMIUM;
    }
    if (result.category === HandCategory.FLUSH || result.category === HandCategory.STRAIGHT) {
      return HandStrengthGroup.STRONG;
    }
    if (result.category === HandCategory.THREE_OF_KIND || result.category === HandCategory.TWO_PAIR) {
      return HandStrengthGroup.MEDIUM;
    }
    return HandStrengthGroup.WEAK;
  }

  evaluateHand(holeCards: Card[], boardCards: Card[]): HandEvaluationResult {
    const allCards = [...holeCards, ...boardCards];
    
    if (allCards.length < 5) {
      // Not enough cards to evaluate - return weak hand
      return {
        category: HandCategory.HIGH_CARD,
        rank: 0,
        strength: 0,
        group: HandStrengthGroup.WEAK,
      };
    }

    // Try all 5-card combinations from available cards
    const combinations = this.getCombinations(allCards, 5);
    let bestResult: HandEvaluationResult | null = null;

    for (const combo of combinations) {
      const result = this.evaluateFiveCards(combo);
      if (!bestResult || result.rank > bestResult.rank) {
        bestResult = result;
      }
    }

    if (!bestResult) {
      return {
        category: HandCategory.HIGH_CARD,
        rank: 0,
        strength: 0,
        group: HandStrengthGroup.WEAK,
      };
    }

    // Determine hand strength group
    bestResult.group = this.classifyHandStrength(bestResult, holeCards);
    return bestResult;
  }

  private evaluateFiveCards(cards: Card[]): HandEvaluationResult {
    const ranks = cards.map(c => c.rank);
    const suits = cards.map(c => c.suit);
    
    const rankValues = ranks.map(r => HandEvaluator.RANK_VALUES[r]).sort((a, b) => b - a);
    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = this.checkStraight(rankValues);
    
    const rankCounts = new Map<string, number>();
    ranks.forEach(r => rankCounts.set(r, (rankCounts.get(r) || 0) + 1));
    const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);

    let category: HandCategory;
    let rank = 0;

    if (isFlush && isStraight && rankValues[0] === 14) {
      category = HandCategory.ROYAL_FLUSH;
      rank = 10000000;
    } else if (isFlush && isStraight) {
      category = HandCategory.STRAIGHT_FLUSH;
      rank = 9000000 + rankValues[0];
    } else if (counts[0] === 4) {
      category = HandCategory.FOUR_OF_KIND;
      rank = 8000000 + rankValues[0];
    } else if (counts[0] === 3 && counts[1] === 2) {
      category = HandCategory.FULL_HOUSE;
      rank = 7000000 + rankValues[0];
    } else if (isFlush) {
      category = HandCategory.FLUSH;
      rank = 6000000 + rankValues.reduce((a, b) => a * 14 + b, 0);
    } else if (isStraight) {
      category = HandCategory.STRAIGHT;
      rank = 5000000 + rankValues[0];
    } else if (counts[0] === 3) {
      category = HandCategory.THREE_OF_KIND;
      rank = 4000000 + rankValues[0];
    } else if (counts[0] === 2 && counts[1] === 2) {
      category = HandCategory.TWO_PAIR;
      rank = 3000000 + rankValues[0];
    } else if (counts[0] === 2) {
      category = HandCategory.PAIR;
      rank = 2000000 + rankValues[0];
    } else {
      category = HandCategory.HIGH_CARD;
      rank = 1000000 + rankValues.reduce((a, b) => a * 14 + b, 0);
    }

    return {
      category,
      rank,
      strength: rank / 10000000,
      group: HandStrengthGroup.TRASH,
    };
  }

  private checkStraight(values: number[]): boolean {
    const unique = [...new Set(values)].sort((a, b) => b - a);
    if (unique.length < 5) return false;
    
    // Check normal straight
    if (unique[0] - unique[4] === 4) return true;
    
    // Check wheel (A-2-3-4-5)
    return unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2;
  }

  private getCombinations(arr: Card[], k: number): Card[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    
    const [first, ...rest] = arr;
    const withFirst = this.getCombinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = this.getCombinations(rest, k);
    return [...withFirst, ...withoutFirst];
  }

  classifyHandStrength(result: HandEvaluationResult, holeCards: Card[]): HandStrengthGroup {
    if (result.category === HandCategory.ROYAL_FLUSH || result.category === HandCategory.STRAIGHT_FLUSH) {
      return HandStrengthGroup.PREMIUM;
    }
    if (result.category === HandCategory.FOUR_OF_KIND || result.category === HandCategory.FULL_HOUSE) {
      return HandStrengthGroup.PREMIUM;
    }
    if (result.category === HandCategory.FLUSH) {
      return HandStrengthGroup.STRONG;
    }
    if (result.category === HandCategory.STRAIGHT) {
      return HandStrengthGroup.STRONG;
    }
    if (result.category === HandCategory.THREE_OF_KIND) {
      return HandStrengthGroup.MEDIUM;
    }
    if (result.category === HandCategory.TWO_PAIR) {
      return HandStrengthGroup.MEDIUM;
    }
    if (result.category === HandCategory.PAIR) {
      const pairRank = holeCards[0]?.rank === holeCards[1]?.rank;
      const highCard = HandEvaluator.RANK_VALUES[holeCards[0]?.rank || ''] >= 11 ||
                       HandEvaluator.RANK_VALUES[holeCards[1]?.rank || ''] >= 11;
      if (pairRank && highCard) return HandStrengthGroup.STRONG;
      if (pairRank) return HandStrengthGroup.MEDIUM;
      return HandStrengthGroup.WEAK;
    }
    return HandStrengthGroup.WEAK;
  }
}
