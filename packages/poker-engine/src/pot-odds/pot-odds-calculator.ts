export class PotOddsCalculator {
  calculatePotOdds(amountToCall: number, pot: number): number {
    if (amountToCall <= 0) return 0;
    if (pot <= 0) return 100;
    return (amountToCall / (pot + amountToCall)) * 100;
  }

  calculateEquityNeeded(amountToCall: number, pot: number): number {
    return this.calculatePotOdds(amountToCall, pot);
  }

  getPotOddsRatio(amountToCall: number, pot: number): string {
    if (amountToCall <= 0) return '0:1';
    const ratio = pot / amountToCall;
    return `${ratio.toFixed(1)}:1`;
  }

  shouldCall(amountToCall: number, pot: number, handEquity: number): boolean {
    const potOdds = this.calculatePotOdds(amountToCall, pot);
    return handEquity > potOdds;
  }

  /**
   * Minimum Defense Frequency: the fraction of the range that must continue
   * against a given bet size to keep the opponent from profitably betting
   * any two cards. Pot here is the pot *before* the bet was added.
   * Returned as a 0-100 percentage to match calculatePotOdds' scale.
   */
  calculateMDF(pot: number, bet: number): number {
    if (pot <= 0 && bet <= 0) return 100;
    return (pot / (pot + bet)) * 100;
  }
}
