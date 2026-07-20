export type SprCategory = 'LOW' | 'MEDIUM' | 'HIGH';

export class SprCalculator {
  calculateSPR(effectiveStack: number, pot: number): number {
    if (pot <= 0) return 0;
    return effectiveStack / pot;
  }

  getSprCategory(spr: number): SprCategory {
    if (spr <= 2) return 'LOW';
    if (spr <= 6) return 'MEDIUM';
    return 'HIGH';
  }

  getEffectiveStack(heroStack: number, villainStack: number): number {
    return Math.min(heroStack, villainStack);
  }
}
