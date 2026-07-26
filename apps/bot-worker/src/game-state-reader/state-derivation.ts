import { Position } from '@poker-bot/shared-types';

/**
 * Position compression by table size, indexed by clockwise offset from the
 * dealer (offset 0 = BTN, the dealer's own seat). As the table shrinks from
 * 8-max, positions drop in this order: UTG1, then MP, then UTG, then HJ,
 * then CO, then SB merges into BTN at heads-up - this keeps SB/BB/BTN as
 * anchors at every table size, matching how PreflopRanges.positionShift()
 * treats them as distinct shift tiers.
 */
const TABLE_SIZE_ORDER: Record<number, Position[]> = {
  1: [Position.BTN],
  2: [Position.BTN, Position.BB],
  3: [Position.BTN, Position.SB, Position.BB],
  4: [Position.BTN, Position.SB, Position.BB, Position.CO],
  5: [Position.BTN, Position.SB, Position.BB, Position.HJ, Position.CO],
  6: [Position.BTN, Position.SB, Position.BB, Position.UTG, Position.HJ, Position.CO],
  7: [Position.BTN, Position.SB, Position.BB, Position.UTG, Position.MP, Position.HJ, Position.CO],
  8: [
    Position.BTN, Position.SB, Position.BB, Position.UTG,
    Position.UTG1, Position.MP, Position.HJ, Position.CO,
  ],
};

/**
 * Computes the hero's position by finding their clockwise seat offset from
 * the dealer button among currently-occupied seats. Falls back to BTN (the
 * previous unconditional default) whenever the table can't be read reliably
 * - no dealer found, hero's seat missing from the list, or no seats at all -
 * so a DOM read hiccup degrades to the old behavior instead of throwing.
 */
export function resolvePosition(
  seats: { seatIndex: number; isDealer: boolean }[],
  heroSeatIndex: number,
): Position {
  const occupied = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const n = occupied.length;
  if (n === 0) return Position.BTN;

  const dealerPos = occupied.findIndex((s) => s.isDealer);
  const heroPos = occupied.findIndex((s) => s.seatIndex === heroSeatIndex);
  if (dealerPos === -1 || heroPos === -1) return Position.BTN;

  const offset = (heroPos - dealerPos + n) % n;
  const order = TABLE_SIZE_ORDER[Math.min(n, 8)];
  return order[offset] ?? Position.BTN;
}

/**
 * Derives which players have folded in the current hand from the action
 * log, matching the same case-insensitive 'fold' substring match already
 * used by mapHistoryAction() in game-state-reader.ts for the same raw
 * action strings.
 */
export function resolveFoldedPlayers(
  actionHistory: { playerName: string; action: string }[],
): Set<string> {
  const folded = new Set<string>();
  for (const entry of actionHistory) {
    if (entry.action.toLowerCase().includes('fold')) {
      folded.add(entry.playerName);
    }
  }
  return folded;
}
