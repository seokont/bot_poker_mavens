export type BetSizeTier = 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE' | 'OVERBET';

/**
 * Bet size expressed as a fraction of the pot it was bet INTO (client.md's
 * "opponent's bet size as % of pot" tiers - e.g. "a bet up to 25% of the
 * pot"). Deliberately different from PotOddsCalculator's
 * amountToCall/(pot+amountToCall) equity-style ratio, which answers a
 * different question (what price am I getting) than this one (how
 * aggressively did they size their bet).
 */
export function classifyBetSizeTier(amountToCall: number, pot: number): BetSizeTier {
  const ratio = (amountToCall / Math.max(pot, 1)) * 100;
  if (ratio <= 25) return 'SMALL';
  if (ratio <= 50) return 'MEDIUM';
  if (ratio <= 75) return 'LARGE';
  if (ratio <= 100) return 'HUGE';
  return 'OVERBET';
}
