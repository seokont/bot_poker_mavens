import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DecisionEngine, LlmHardStrategy } from '@poker-bot/poker-engine';
import { GameState, StrategyConfig, BotDecisionResult, ActionType } from '@poker-bot/shared-types';

export type { GameState, StrategyConfig, BotDecisionResult };

@Injectable()
export class DecisionEngineService {
  private readonly logger = new Logger(DecisionEngineService.name);
  private readonly mode: 'internal' | 'external';
  private readonly externalUrl: string;
  private readonly timeoutMs: number;
  private readonly engine = new DecisionEngine();

  constructor(configService: ConfigService) {
    this.mode = (configService.get<string>('DECISION_ENGINE_MODE', 'internal') as 'internal' | 'external');
    this.externalUrl = configService.get<string>(
      'DECISION_ENGINE_URL',
      'http://localhost:4000',
    );
    this.timeoutMs = parseInt(
      configService.get<string>('DECISION_ENGINE_TIMEOUT_MS', '5000'),
      10,
    );

    // Bots with a HARD-difficulty strategy profile route their decisions
    // through an LLM (OpenRouter, running a Hermes model by default) instead
    // of the built-in MEDIUM logic - EASY/MEDIUM bots are unaffected.
    // DecisionEngine.decide() validates whatever comes back against
    // allowedActions/heroStack and falls back safely on any error, so a
    // bad/hallucinated response can't put an illegal action on the table.
    const openRouterApiKey = configService.get<string>('OPENROUTER_API_KEY');
    if (openRouterApiKey) {
      const openRouterModel = configService.get<string>(
        'OPENROUTER_MODEL',
        'nousresearch/hermes-3-llama-3.1-70b',
      );
      const openRouterBaseUrl = configService.get<string>(
        'OPENROUTER_BASE_URL',
        'https://openrouter.ai/api/v1',
      );
      this.engine.setHardStrategy(
        new LlmHardStrategy(openRouterApiKey, openRouterModel, openRouterBaseUrl),
      );
      this.logger.log(`OpenRouter HARD strategy enabled (model: ${openRouterModel})`);
    } else {
      this.logger.log('OPENROUTER_API_KEY not set - HARD-difficulty bots will fall back to MEDIUM strategy');
    }
  }

  async decide(
    state: GameState,
    strategyConfig: StrategyConfig,
  ): Promise<BotDecisionResult> {
    try {
      if (this.mode === 'internal') {
        return await this.engine.decide(state, strategyConfig);
      } else {
        return await this.externalDecide(state, strategyConfig);
      }
    } catch (err) {
      console.error('[DecisionEngine] Decision error, using safe fallback:', err);
      return this.getSafeFallback(state);
    }
  }

  private async externalDecide(
    state: GameState,
    strategyConfig: StrategyConfig,
  ): Promise<BotDecisionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.externalUrl}/internal/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, strategyConfig }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`External decision engine returned ${response.status}`);
      }

      const result = (await response.json()) as BotDecisionResult;
      return result;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('[DecisionEngine] External decision timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getSafeFallback(state: GameState): BotDecisionResult {
    const hasCheck = state.allowedActions?.some((a) => a.action === ActionType.CHECK);

    if (hasCheck) {
      return { action: ActionType.CHECK, confidence: 1, reason: 'SAFE_FALLBACK_CHECK' };
    }

    return { action: ActionType.FOLD, confidence: 1, reason: 'SAFE_FALLBACK_FOLD' };
  }
}
