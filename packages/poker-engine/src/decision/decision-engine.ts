import { GameState, BotDecisionResult, StrategyConfig, BotDifficulty, ActionType } from '@poker-bot/shared-types';
import { EasyStrategy } from './easy-strategy';
import { MediumStrategy } from './medium-strategy';

export interface HardStrategyInterface {
  decide(state: GameState, config: StrategyConfig): Promise<BotDecisionResult>;
}

export interface DecisionEngineInterface {
  decide(state: GameState, strategy: StrategyConfig): Promise<BotDecisionResult>;
}

export function getSafeFallback(state: GameState): BotDecisionResult {
  const hasCheck = state.allowedActions.some(a => a.action === 'CHECK');
  if (hasCheck) {
    return {
      action: ActionType.CHECK,
      confidence: 1,
      reason: 'SAFE_FALLBACK_CHECK',
    };
  }
  return {
    action: ActionType.FOLD,
    confidence: 1,
    reason: 'SAFE_FALLBACK_FOLD',
  };
}

export class DecisionEngine implements DecisionEngineInterface {
  private easyStrategy = new EasyStrategy();
  private mediumStrategy = new MediumStrategy();
  private hardStrategy: HardStrategyInterface | null = null;

  setHardStrategy(strategy: HardStrategyInterface) {
    this.hardStrategy = strategy;
  }

  async decide(state: GameState, strategyConfig: StrategyConfig): Promise<BotDecisionResult> {
    try {
      let decision: BotDecisionResult;

      switch (strategyConfig.difficulty) {
        case BotDifficulty.EASY:
          decision = this.easyStrategy.decide(state, strategyConfig);
          break;
        case BotDifficulty.MEDIUM:
          decision = this.mediumStrategy.decide(state, strategyConfig);
          break;
        case BotDifficulty.HARD:
          if (this.hardStrategy) {
            decision = await this.hardStrategy.decide(state, strategyConfig);
          } else {
            decision = this.mediumStrategy.decide(state, strategyConfig);
          }
          break;
        default:
          decision = this.easyStrategy.decide(state, strategyConfig);
      }

      // Folding when checking is free is never correct - it's strictly
      // dominated by checking (same zero cost, but keeps the hand alive).
      // Confirmed live: Groq occasionally does this anyway (e.g. "weak hand
      // out of position" reasoning applied even with toCall=0), which also
      // triggers the site's "you can check here, are you sure you want to
      // fold?" confirmation dialog on every occurrence. Correcting it here
      // applies uniformly regardless of which strategy produced the
      // decision, since it's a hard poker-rules invariant, not a
      // difficulty-specific behavior.
      if (decision.action === ActionType.FOLD && state.allowedActions.some(a => a.action === ActionType.CHECK)) {
        decision = { action: ActionType.CHECK, confidence: decision.confidence, reason: `CORRECTED_FREE_CHECK (was ${decision.reason})` };
      }

      // Validate the decision is allowed
      const isAllowed = state.allowedActions.some(
        a => a.action === decision.action && (!decision.amount || decision.amount >= (a.minAmount || 0) && decision.amount <= (a.maxAmount || Infinity))
      );

      if (!isAllowed) {
        return getSafeFallback(state);
      }

      // Validate amount
      if (decision.amount !== undefined && (decision.amount < 0 || decision.amount > state.heroStack)) {
        return getSafeFallback(state);
      }

      return decision;
    } catch (error) {
      // Previously swallowed silently, which made a genuine strategy bug
      // (an exception mid-decision) indistinguishable from a normal
      // SAFE_FALLBACK_FOLD/CHECK - confirmed live via a premium hand (AK)
      // unexpectedly folding with no way to tell why. Logging here doesn't
      // change behavior (still falls back safely) but makes the actual
      // cause visible instead of invisible.
      console.error('[DecisionEngine] strategy threw, using safe fallback:', error);
      return getSafeFallback(state);
    }
  }
}

export { EasyStrategy, MediumStrategy };
