import { GameState, ActionType } from '@poker-bot/shared-types';

export type OpponentRangeWidth = 'WIDE' | 'MEDIUM' | 'TIGHT';

/**
 * Heuristic read on how wide the betting opponent's range likely is, from
 * bet sizing and how much aggression already happened this street. Not a
 * real range model - just enough signal to widen/tighten how loosely the
 * bot continues (poker_mavens_bot_behavior_prompt.md's estimateOpponentRange).
 * A small bet after multiple raises reads very differently than the same
 * size as a single opening bet.
 */
export function estimateOpponentRange(state: GameState, betRatio: number): OpponentRangeWidth {
  const aggressiveActionsThisStreet = state.actionHistory.filter(
    (a) => a.street === state.street && (a.action === ActionType.RAISE || a.action === ActionType.BET),
  ).length;

  if (aggressiveActionsThisStreet >= 2) return 'TIGHT'; // multiple bets/raises - range has narrowed a lot
  if (betRatio <= 0.4) return 'WIDE'; // small bet - could be almost anything, including a lot of air
  if (betRatio <= 0.9) return 'MEDIUM';
  return 'TIGHT'; // big overbet/shove - usually polarized toward strong hands (or a rare bluff)
}
