export class BetSizer {
  getSuggestedBets(pot: number, street: string, _gameType: string): number[] {
    const percentages = this.getPercentagesForStreet(street);
    return percentages.map(pct => this.roundToIncrement(pot * pct / 100, 1));
  }

  private getPercentagesForStreet(street: string): number[] {
    if (street === 'PREFLOP') return [100]; // Open raise sizes
    if (street === 'FLOP') return [25, 33, 50, 66, 75, 100];
    if (street === 'TURN') return [33, 50, 66, 75, 100];
    if (street === 'RIVER') return [33, 50, 66, 75, 100, 125];
    return [50, 75, 100];
  }

  roundToIncrement(amount: number, increment: number): number {
    return Math.round(amount / increment) * increment;
  }

  validateBet(amount: number, minRaiseTo: number, maxRaiseTo: number, stack: number): boolean {
    if (amount > stack) return false;
    if (amount > 0 && amount < minRaiseTo) return false;
    if (amount > maxRaiseTo) return false;
    return true;
  }
}
