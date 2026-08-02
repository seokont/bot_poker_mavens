import { GameState, BotDecisionResult, StrategyConfig, ActionType, Card, GameType } from '@poker-bot/shared-types';
import { HardStrategyInterface } from './decision-engine';

const RESPONSE_FORMAT_INSTRUCTIONS = `Respond with ONLY a JSON object, no other text, in this exact shape:
{"action": "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN", "amount": number | null, "reasoning": "short reason"}
"action" must be one of the allowed actions listed. "amount" is the total size to bet/raise TO (not the additional
chips added) and must be within the given min/max for BET/RAISE, or null for FOLD/CHECK/CALL/ALL_IN.`;

// Operator-requested play style: fold very rarely - it should be a last
// resort. Prefer seeing more hands and staying in with weak/marginal
// holdings over folding on reflex, and bluff/semi-bluff often rather than
// only ever calling passively. Only fold to a bet that's close to an
// all-in/overbet-sized shove relative to the pot, or when clearly beaten.
// Never fold when checking is free - that's strictly worse than checking
// regardless of hand strength.
const LOOSE_PLAY_INSTRUCTIONS = `Fold very rarely - it should be a last resort. Continue with almost any two cards
rather than folding reflexively, including weak, speculative, or trash hands. Only fold to a bet that's close to an
all-in or overbet-sized shove relative to the pot, or when unmistakably beaten by visible action. Never fold when
checking is free (amount to call is 0) - checking is always at least as good as folding there.

Call when you have a pair, two pair, three of a kind, a straight, or a flush - do not fold a made hand too easily.
Call more often with top pair or an overpair, and call more in heads-up pots. A full house or better should almost
always raise, re-raise, or go all-in for value.

Bluff and semi-bluff often, not just occasionally: with a flush draw, an open-ended straight draw, or a combination
draw, prefer a semi-bluff raise over a passive call. Even with no pair and no draw, look for opportunities to bet or
raise as a bluff when checking or betting is available, rather than defaulting to check/fold - a player who never
bluffs is easy to play against.

This does not mean call absolutely everything with zero judgment - a hand that's clearly and visibly dominated
(unmistakably beaten action, or a bet so large it's effectively an all-in with nothing to show for it) can still
fold, but that should be the exception, not the rule.`;

const HOLDEM_SYSTEM_PROMPT = `You are an expert No-Limit Hold'em player making a single decision at the table.
${LOOSE_PLAY_INSTRUCTIONS}
${RESPONSE_FORMAT_INSTRUCTIONS}`;

function omahaSystemPrompt(gameType: GameType): string {
  const holeCardCount = gameType === GameType.PLO6 ? 6 : gameType === GameType.PLO5 ? 5 : 4;
  return `You are an expert Pot-Limit Omaha (${holeCardCount}-card) player making a single decision at the table.
Critical Omaha rule that does NOT apply in Hold'em: your final hand must use EXACTLY 2 of your ${holeCardCount} hole
cards combined with EXACTLY 3 of the board's cards - never more, never fewer of either. A hand can look powerful at a
glance (e.g. four cards of one suit, or three-of-a-kind among your hole cards) but be worthless if it can't be built
from that exact 2-hole + 3-board combination - check every candidate 5-card hand under this rule before valuing your
hand. Because every opponent also holds 4+ cards, apparent hand strength runs much higher on average than in
Hold'em (two pair, sets, and flushes are common) - value hands and draws accordingly, and prefer well-coordinated,
"double-suited" or connected starting hands over big pairs alone.
${LOOSE_PLAY_INSTRUCTIONS}
${RESPONSE_FORMAT_INSTRUCTIONS}`;
}

function isOmaha(gameType: GameType): boolean {
  return gameType === GameType.PLO4 || gameType === GameType.PLO5 || gameType === GameType.PLO6;
}

function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function formatCards(cards: Card[]): string {
  return cards.length > 0 ? cards.map(formatCard).join(' ') : '(none)';
}

/**
 * Calls an OpenAI-compatible chat completions API (Groq, OpenRouter, or any
 * other provider using the same request/response shape) to make a poker
 * decision. Plugs into DecisionEngine via setHardStrategy() - only bots
 * assigned a HARD-difficulty strategy profile route here; EASY/MEDIUM bots
 * are unaffected. DecisionEngine.decide() already validates whatever this
 * returns against state.allowedActions/heroStack and falls back to a safe
 * default on any error or invalid response, so a malformed/hallucinated
 * reply can't cause an illegal action to reach the table.
 */
export class LlmHardStrategy implements HardStrategyInterface {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
  ) {}

  async decide(state: GameState, config: StrategyConfig): Promise<BotDecisionResult> {
    const prompt = this.buildPrompt(state, config);
    const systemPrompt = this.buildSystemPrompt(state, config);

    // The live site's turn clock is 30s (confirmed via RingGamesGet:
    // TurnClock=30, TurnWarning=10). An unbounded fetch left this call free
    // to occasionally run long enough (network hiccup, API-side slowness)
    // to eat the whole clock by itself - on top of the think-delay and the
    // amount-fill+click steps that still have to happen after it returns -
    // confirmed live via a bot stuck repeatedly missing its turn on exactly
    // this path, getting auto-sat-out by the site, and needing the
    // auto-sit-in recovery every time. Aborting well inside the clock and
    // falling back to the existing safe-default path (DecisionEngineService
    // already catches and falls back on any error) is far better than
    // occasionally missing the turn entirely.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens: 300,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Groq API returned ${response.status}: ${await response.text().catch(() => '')}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('Groq response had no message content');
    }

    const parsed = JSON.parse(raw) as { action: string; amount: number | null; reasoning?: string };
    return this.toDecisionResult(parsed, state);
  }

  private buildSystemPrompt(state: GameState, config: StrategyConfig): string {
    const base = isOmaha(state.gameType) ? omahaSystemPrompt(state.gameType) : HOLDEM_SYSTEM_PROMPT;
    const custom = config.configurationJson?.customInstructions;
    if (typeof custom === 'string' && custom.trim()) {
      return `${base}\n\nAdditional playing instructions from the operator (follow these unless they'd force an illegal action):\n${custom.trim()}`;
    }
    return base;
  }

  private buildPrompt(state: GameState, config: StrategyConfig): string {
    const opponents = state.players
      .filter((p) => !p.isHero)
      .map((p) => `${p.playerName} (seat ${p.seatNumber}): stack ${p.stack}, bet ${p.currentBet}${p.hasFolded ? ', folded' : ''}${p.isAllIn ? ', all-in' : ''}`)
      .join('; ') || '(none visible)';

    const history = state.actionHistory
      .slice(-8)
      .map((a) => `${a.playerName} ${a.action}${a.amount ? ' ' + a.amount : ''} (${a.street})`)
      .join(', ') || '(none yet this hand)';

    const actions = state.allowedActions
      .map((a) => {
        if (a.action === ActionType.BET || a.action === ActionType.RAISE) {
          return `${a.action} (to ${a.minAmount ?? state.minRaiseTo}-${a.maxAmount ?? state.maxRaiseTo})`;
        }
        return a.action;
      })
      .join(', ');

    return [
      `Game: ${state.gameType} ${state.limitType}, blinds ${state.smallBlind}/${state.bigBlind}${state.ante ? ` ante ${state.ante}` : ''}`,
      `Street: ${state.street}`,
      `Your hole cards: ${formatCards(state.holeCards)}`,
      `Board: ${formatCards(state.boardCards)}`,
      `Your position: ${state.position}, seat ${state.seatNumber} of ${state.playerCount} players (${state.activePlayerCount} still active)`,
      `Your stack: ${state.heroStack}, effective stack: ${state.effectiveStack}`,
      `Pot: ${state.pot}${state.sidePots.length ? ` (side pots: ${state.sidePots.join(', ')})` : ''}`,
      `Amount to call: ${state.amountToCall}`,
      `Opponents: ${opponents}`,
      `Action this hand: ${history}`,
      `Allowed actions: ${actions}`,
      `Strategy profile: ${config.name} (aggression ${config.aggression}, bluff frequency ${config.bluffFrequency})`,
      '',
      'Decide your action now.',
    ].join('\n');
  }

  private toDecisionResult(
    parsed: { action: string; amount: number | null; reasoning?: string },
    state: GameState,
  ): BotDecisionResult {
    let action = ActionType[parsed.action as keyof typeof ActionType];
    if (!action) {
      throw new Error(`Groq returned unrecognized action: ${parsed.action}`);
    }

    let allowed = state.allowedActions.find((a) => a.action === action);
    if (!allowed) {
      // The model doesn't reliably track wording that depends on whether a
      // bet already exists: BET (open a bet, nothing to call) vs RAISE (put
      // more on top of an existing bet), and CHECK (nothing to call) vs
      // CALL (match an existing bet) - confirmed live via two separate
      // folded strong/decent hands, one after Groq said "BET" while only
      // RAISE was legal, another after it said "CHECK" while only
      // FOLD/CALL/RAISE were legal (there was a bet to face). Each pair
      // represents the same underlying intent (raise-sized aggression, or
      // passive continuation) under different table conditions, so remap
      // to whichever of the pair is actually legal before giving up.
      const SIBLING: Partial<Record<ActionType, ActionType>> = {
        [ActionType.BET]: ActionType.RAISE,
        [ActionType.RAISE]: ActionType.BET,
        [ActionType.CHECK]: ActionType.CALL,
        [ActionType.CALL]: ActionType.CHECK,
      };
      const sibling = SIBLING[action];
      const siblingAllowed = sibling ? state.allowedActions.find((a) => a.action === sibling) : undefined;
      if (siblingAllowed) {
        action = sibling as ActionType;
        allowed = siblingAllowed;
      }
    }
    if (!allowed) {
      throw new Error(`Groq returned an action not in allowedActions: ${parsed.action}`);
    }

    let amount: number | undefined;
    if (action === ActionType.BET || action === ActionType.RAISE) {
      const min = allowed.minAmount ?? state.minRaiseTo;
      const max = allowed.maxAmount ?? state.maxRaiseTo;
      amount = Math.min(Math.max(parsed.amount ?? min, min), max);
    }

    return {
      action,
      amount,
      confidence: 0.7,
      reason: `GROQ: ${parsed.reasoning ?? 'no reasoning given'}`.slice(0, 200),
    };
  }
}
