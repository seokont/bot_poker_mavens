import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { ActionType, StrategyConfig, BotOperationMode, BotDecisionResult } from '@poker-bot/shared-types';
import { BotState, BotStateMachine } from '../state-machine/bot-state-machine';
import { GameStateReader, TableStakes } from '../game-state-reader/game-state-reader';
import { DecisionEngineService } from '../decision-engine/decision-engine.service';
import { ActionExecutorService } from '../action-executor/action-executor.service';

const ACTION_TYPE_TO_STRING: Record<ActionType, string> = {
  [ActionType.FOLD]: 'fold',
  [ActionType.CHECK]: 'check',
  [ActionType.CALL]: 'call',
  [ActionType.BET]: 'bet',
  [ActionType.RAISE]: 'raise',
  [ActionType.ALL_IN]: 'allIn',
};

const DEFAULT_STAKES: TableStakes = {
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  gameType: 'NLH',
  limitType: 'NL',
};

interface LoopState {
  botId: string;
  tableId: string;
  page: Page;
  operationMode: string;
  strategyConfig: StrategyConfig;
  stakes: TableStakes;
  defaultBuyIn: number;
  handCounter: number;
  turnCounter: number;
  currentHandId: string | null;
  currentTurnId: string | null;
  handStartStack: number | null;
  lastKnownPot: number | null;
  lastRebuyAttemptAt: number;
  lastSitInAttemptAt: number;
  ticking: boolean;
  paused: boolean;
  tickCount: number;
}

// Auto-rebuy keeps a bot playing continuously off its own account balance
// instead of sitting idle/short-stacked - triggers once the table stack
// drops below half of the bot's configured buy-in. Cooldown avoids spamming
// the buy-in dialog every tick while a previous rebuy is still in flight.
const REBUY_STACK_FRACTION = 0.5;
const REBUY_COOLDOWN_MS = 20_000;
const SIT_IN_COOLDOWN_MS = 10_000;

export interface GameLoopUpdate {
  handId?: string | null;
  turnId?: string | null;
}

@Injectable()
export class GameLoopService implements OnModuleDestroy {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private states = new Map<string, LoopState>();
  private backendUrl: string;
  private internalApiKey: string;
  private pollIntervalMs: number;

  constructor(
    configService: ConfigService,
    private readonly stateMachine: BotStateMachine,
    private readonly gameStateReader: GameStateReader,
    private readonly decisionEngine: DecisionEngineService,
    private readonly actionExecutor: ActionExecutorService,
  ) {
    this.backendUrl = configService.get<string>('BACKEND_URL', 'http://localhost:3000');
    this.internalApiKey = configService.get<string>(
      'INTERNAL_API_KEY',
      'change-me-internal-api-key',
    );
    this.pollIntervalMs = parseInt(
      configService.get<string>('GAME_LOOP_POLL_INTERVAL_MS', '1500'),
      10,
    );
  }

  onModuleDestroy(): void {
    for (const botId of this.timers.keys()) {
      this.stop(botId);
    }
  }

  /**
   * Starts driving a bot's play loop once it has reached SEATED. Fetches the
   * bot's operation mode + strategy config from the backend, then polls the
   * table on an interval, advancing the bot's state machine through
   * WAITING_FOR_HAND -> IN_HAND -> WAITING_FOR_TURN -> DECIDING ->
   * EXECUTING_ACTION -> WAITING_FOR_NEXT_STATE as hands are played.
   */
  async start(
    botId: string,
    tableId: string,
    page: Page,
    onUpdate?: (update: GameLoopUpdate) => void,
    onNeedsRebuy?: (amount: number) => void,
    onSittingOut?: () => void,
  ): Promise<void> {
    this.stop(botId);

    const { operationMode, strategyConfig, stakes, defaultBuyIn } = await this.fetchPlayConfig(botId, tableId);

    const state: LoopState = {
      botId,
      tableId,
      page,
      operationMode,
      strategyConfig,
      stakes,
      defaultBuyIn,
      handCounter: 0,
      turnCounter: 0,
      currentHandId: null,
      currentTurnId: null,
      handStartStack: null,
      lastKnownPot: null,
      lastRebuyAttemptAt: 0,
      lastSitInAttemptAt: 0,
      ticking: false,
      paused: false,
      tickCount: 0,
    };
    this.states.set(botId, state);

    if (this.stateMachine.getCurrentState(botId) === BotState.SEATED) {
      this.stateMachine.setState(botId, BotState.WAITING_FOR_HAND);
    }

    const timer = setInterval(() => {
      this.tick(botId, onUpdate, onNeedsRebuy, onSittingOut).catch((err) => {
        console.error(`[GameLoop] tick error for bot ${botId}:`, err);
      });
    }, this.pollIntervalMs);
    this.timers.set(botId, timer);

    console.log(
      `[GameLoop] started for bot ${botId} on table ${tableId} (mode=${operationMode}, interval=${this.pollIntervalMs}ms)`,
    );
  }

  stop(botId: string): void {
    const timer = this.timers.get(botId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(botId);
    }
    this.states.delete(botId);
  }

  isRunning(botId: string): boolean {
    return this.states.has(botId);
  }

  pause(botId: string): void {
    const state = this.states.get(botId);
    if (state) state.paused = true;
  }

  resume(botId: string): void {
    const state = this.states.get(botId);
    if (state) state.paused = false;
  }

  private async tick(
    botId: string,
    onUpdate?: (update: GameLoopUpdate) => void,
    onNeedsRebuy?: (amount: number) => void,
    onSittingOut?: () => void,
  ): Promise<void> {
    const state = this.states.get(botId);
    if (!state || state.ticking || state.paused) return;
    if (state.page.isClosed()) {
      this.stop(botId);
      return;
    }

    state.ticking = true;
    try {
      const current = this.stateMachine.getCurrentState(botId);
      state.tickCount += 1;

      // Checked unconditionally (not just from WAITING_FOR_HAND) because a
      // sitting-out hero can get stuck in IN_HAND forever: table-wide
      // signals (pot/cards/isHandInProgress) stay true as long as OTHER
      // seated players keep playing, so the loop never reaches the "hand
      // ended" branch to notice hero itself isn't actually in it. Confirmed
      // live: a bot sat marked "יושב בחוץ" indefinitely with only a "מוכן"
      // (Ready) button available, never re-entering play on its own.
      if (onSittingOut) {
        const cooldownElapsed = Date.now() - state.lastSitInAttemptAt > SIT_IN_COOLDOWN_MS;
        if (cooldownElapsed) {
          const sittingOut = await this.gameStateReader.isSittingOut(state.page).catch(() => false);
          if (sittingOut) {
            console.log(`[GameLoop] bot=${botId} detected sitting out - requesting sit-in`);
            state.lastSitInAttemptAt = Date.now();
            onSittingOut();
          }
        }
      }

      switch (current) {
        case BotState.WAITING_FOR_HAND:
        case BotState.WAITING_FOR_NEXT_STATE: {
          const inHand = await this.gameStateReader.isHandInProgress(state.page);

          if (!inHand && state.tickCount % 5 === 0) {
            const snapshot = await this.gameStateReader.debugSnapshot(state.page);
            console.log(`[GameLoop] debug tick=${state.tickCount} bot=${botId} state=${current} inHand=false`, JSON.stringify(snapshot));
          }

          // Between hands is the only safe time to interact with a rebuy
          // dialog - keeps the bot playing continuously off its own account
          // balance instead of going short-stacked/idle. The bot should only
          // ever stop via an explicit balance-exhausted rebuy failure or a
          // manual admin action, never just from running low at the table.
          if (!inHand && onNeedsRebuy) {
            const cooldownElapsed = Date.now() - state.lastRebuyAttemptAt > REBUY_COOLDOWN_MS;
            if (cooldownElapsed) {
              const stack = await this.gameStateReader.readHeroStack(state.page).catch(() => null);
              if (stack !== null && stack < state.defaultBuyIn * REBUY_STACK_FRACTION) {
                console.log(
                  `[GameLoop] bot=${botId} stack=${stack} below rebuy threshold (${state.defaultBuyIn * REBUY_STACK_FRACTION}) - requesting rebuy to ${state.defaultBuyIn}`,
                );
                state.lastRebuyAttemptAt = Date.now();
                onNeedsRebuy(state.defaultBuyIn);
              }
            }
          }

          if (inHand) {
            state.handCounter += 1;
            const realHandId = await this.startHandOnBackend(state);
            state.currentHandId = realHandId ?? `hand-${botId}-${state.handCounter}`;
            state.currentTurnId = null;
            state.handStartStack = await this.gameStateReader.readHeroStack(state.page).catch(() => null);
            state.lastKnownPot = null;
            onUpdate?.({ handId: state.currentHandId, turnId: null });
            this.stateMachine.setState(botId, BotState.IN_HAND);
          } else if (current === BotState.WAITING_FOR_NEXT_STATE) {
            // Our part of the previous hand is done and no new hand has
            // started yet - settle into the idle waiting state.
            this.stateMachine.setState(botId, BotState.WAITING_FOR_HAND);
          }
          break;
        }

        case BotState.IN_HAND: {
          // Awaited (unlike reportLiveState below) so lastKnownPot is
          // guaranteed current before this same tick can detect the hand
          // ending - reportLiveState's full readForDecision is fired
          // without awaiting and can still be in flight when a fast
          // preflop fold ends the hand on this very tick, leaving
          // lastKnownPot stale/null right when finishHandOnBackend needs it.
          const currentPot = await this.gameStateReader.readPotSize(state.page).catch(() => 0);
          if (currentPot > 0) state.lastKnownPot = currentPot;

          this.reportLiveState(state).catch(() => {});
          this.captureDiagnosticSnapshot(state).catch(() => {});

          if (state.operationMode === BotOperationMode.OBSERVER) {
            const stillInHand = await this.gameStateReader.isHandInProgress(state.page);
            if (!stillInHand) {
              state.currentHandId = null;
              onUpdate?.({ handId: null });
              this.stateMachine.forceSetState(botId, BotState.WAITING_FOR_HAND);
              this.reportLiveStateCleared(botId).catch(() => {});
            }
            break;
          }

          const heroTurn = await this.gameStateReader.isHeroTurn(state.page);
          if (heroTurn) {
            this.stateMachine.setState(botId, BotState.WAITING_FOR_TURN);
          } else {
            // A seated, dealt-in hero gets at least one action per hand, so
            // this should always resolve via WAITING_FOR_TURN. This is a
            // defensive fallback for the rare case the hand ends without
            // ever showing a hero-turn indicator (e.g. detection heuristics
            // missed it) so the loop can't get stuck here indefinitely.
            const stillInHand = await this.gameStateReader.isHandInProgress(state.page);
            if (!stillInHand) {
              const finishedHandId = state.currentHandId;
              const startStack = state.handStartStack;
              const finalPot = state.lastKnownPot;
              state.currentHandId = null;
              state.handStartStack = null;
              state.lastKnownPot = null;
              onUpdate?.({ handId: null });
              this.stateMachine.forceSetState(botId, BotState.WAITING_FOR_HAND);
              this.reportLiveStateCleared(botId).catch(() => {});
              if (finishedHandId && startStack !== null) {
                this.finishHandOnBackend(state, finishedHandId, startStack, finalPot).catch(() => {});
              }
            }
          }
          break;
        }

        case BotState.WAITING_FOR_TURN: {
          state.turnCounter += 1;
          state.currentTurnId = `turn-${botId}-${state.turnCounter}`;
          onUpdate?.({ handId: state.currentHandId, turnId: state.currentTurnId });

          this.stateMachine.setState(botId, BotState.DECIDING);
          await this.decideAndAct(state);
          break;
        }

        default:
          // STARTING/AUTHORIZING/OPENING_TABLE/etc are driven by WorkerService
          // itself; SITTING_OUT/RECONNECTING/ERROR/STOPPING are left alone
          // here and handled by their own flows.
          break;
      }
    } finally {
      state.ticking = false;
    }
  }

  private async decideAndAct(state: LoopState): Promise<void> {
    const handId = state.currentHandId ?? `hand-${state.botId}-${state.handCounter}`;
    const turnId = state.currentTurnId ?? `turn-${state.botId}-${state.turnCounter}`;

    const gameState = await this.gameStateReader.readForDecision(
      state.page,
      state.botId,
      state.tableId,
      handId,
      turnId,
      state.stakes,
    );

    const decision = await this.decisionEngine.decide(gameState, state.strategyConfig);

    console.log(
      `[GameLoop] decision bot=${state.botId} street=${gameState.street} ` +
        `hole=${JSON.stringify(gameState.holeCards)} board=${JSON.stringify(gameState.boardCards)} ` +
        `pot=${gameState.pot} toCall=${gameState.amountToCall} ` +
        `allowed=${JSON.stringify(gameState.allowedActions)} ` +
        `=> ${decision.action}${decision.amount ? ' ' + decision.amount : ''} (${decision.reason})`,
    );

    // Persisted before acting in both modes: this is the only place the
    // engine's actual action/amount/reason ever reach bot_decisions (it
    // previously wrote a permanent 'PENDING' row only in ASSISTED mode, so
    // autonomous play - the normal case - left no record of why a hand was
    // folded/called/raised, making live folding complaints unverifiable
    // after the fact).
    await this.persistDecision(state.botId, state.tableId, handId, turnId, gameState, decision);

    if (state.operationMode === BotOperationMode.ASSISTED) {
      // Wait for a human to approve/execute; don't recompute every tick.
      this.stateMachine.setState(state.botId, BotState.WAITING_FOR_NEXT_STATE);
      return;
    }

    // A human doesn't click the instant the situation is on screen, and
    // never with the same latency every time - a flat, always-identical
    // reaction time is itself a bot tell. Pause a randomized, decision-
    // complexity-biased amount before acting (capped well under any real
    // site's action clock, which runs 10s+).
    await this.sleep(this.computeThinkDelayMs(gameState, decision));

    // stop() (e.g. from a concurrent leave-table/stop command) can remove
    // this bot's loop state while we were "thinking" above - widening that
    // window is exactly what the delay just did, so re-check here rather
    // than clicking an action button on a table we've already left.
    if (!this.states.has(state.botId)) {
      console.warn(`[GameLoop] bot ${state.botId} loop stopped during think-delay, skipping stale action`);
      return;
    }

    // The full decide-then-act pipeline (readForDecision + decisionEngine,
    // which for a Groq-backed HARD bot includes a real LLM API round trip,
    // plus the think-delay above) can take several seconds - long enough for
    // the site's own turn timer to expire and move the hand on, especially
    // against other bots acting near-instantly. Clicking a button for a turn
    // that's already gone doesn't fail fast - Playwright waits up to its
    // actionability timeout hoping the (now permanently stale) button
    // becomes clickable, which it never will (confirmed live: repeated
    // 15s "locator.click: Timeout" errors tracing back to exactly this).
    // Re-verify it's still actually hero's turn right before clicking so a
    // stale turn is skipped in milliseconds instead of stalling for 15s.
    const stillHeroTurn = await this.gameStateReader.isHeroTurn(state.page).catch(() => false);
    if (!stillHeroTurn) {
      console.warn(`[GameLoop] bot ${state.botId} turn expired during decide/think delay, skipping stale action`);
      this.stateMachine.setState(state.botId, BotState.WAITING_FOR_NEXT_STATE);
      return;
    }

    this.stateMachine.setState(state.botId, BotState.EXECUTING_ACTION);

    const action = ACTION_TYPE_TO_STRING[decision.action];
    const result = await this.actionExecutor.executeAction(
      state.botId,
      state.tableId,
      handId,
      turnId,
      action,
      decision.amount,
      state.page,
    );

    await this.reportActionResult(
      state.botId,
      state.tableId,
      handId,
      turnId,
      action,
      decision.amount ?? 0,
      result.success,
      result.error,
      gameState.street,
    );

    if (!result.success) {
      console.warn(`[GameLoop] action failed for bot ${state.botId}: ${result.error}`);
    }

    this.stateMachine.setState(state.botId, BotState.WAITING_FOR_NEXT_STATE);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Randomized, decision-complexity-biased "thinking time" before an
   * autonomous action is executed. A real player doesn't act instantly, and
   * never with identical latency every hand - both are bot tells. Kept well
   * under any real site's action clock (typically 10s+).
   */
  private computeThinkDelayMs(
    gameState: { street: string },
    decision: { action: ActionType },
  ): number {
    // Shortened on operator request (faster action turnaround) - still
    // randomized rather than a flat/instant delay, since a perfectly
    // consistent zero-latency response is itself an obvious tell, but the
    // range is now a few hundred ms instead of multiple seconds. This also
    // shrinks the window for the "turn expired before we could click" race
    // (see decideAndAct/executePokerAction), since the full decide-then-act
    // pipeline needs to fit inside the site's real turn clock.
    const base = 150 + Math.random() * 350; // 0.15-0.5s baseline
    const postflopBonus = gameState.street !== 'PREFLOP' ? Math.random() * 100 : 0;
    const isSizingDecision =
      decision.action === ActionType.RAISE ||
      decision.action === ActionType.BET ||
      decision.action === ActionType.ALL_IN;
    const sizingBonus = isSizingDecision ? 100 + Math.random() * 150 : 0;

    return Math.min(base + postflopBonus + sizingBonus, 900);
  }

  private async fetchPlayConfig(
    botId: string,
    tableId: string,
  ): Promise<{ operationMode: string; strategyConfig: StrategyConfig; stakes: TableStakes; defaultBuyIn: number }> {
    try {
      const response = await fetch(
        `${this.backendUrl}/api/v1/internal/bots/${botId}/play-config?tableId=${encodeURIComponent(tableId)}`,
        { headers: { 'X-Internal-Api-Key': this.internalApiKey } },
      );

      if (!response.ok) {
        throw new Error(`play-config returned ${response.status}`);
      }

      const data = (await response.json()) as {
        operationMode: string;
        strategyConfig: StrategyConfig;
        table: TableStakes | null;
        defaultBuyIn?: number;
      };

      return {
        operationMode: data.operationMode,
        strategyConfig: data.strategyConfig,
        stakes: data.table ?? DEFAULT_STAKES,
        defaultBuyIn: data.defaultBuyIn ?? 1000,
      };
    } catch (err) {
      console.warn(
        `[GameLoop] failed to fetch play-config for bot ${botId}, defaulting to OBSERVER:`,
        err,
      );
      return {
        operationMode: BotOperationMode.OBSERVER,
        strategyConfig: {
          id: 'default-easy',
          name: 'EASY',
          difficulty: 'EASY' as StrategyConfig['difficulty'],
          preflopRanges: {},
          aggression: 0.2,
          bluffFrequency: 0,
          cbetFrequency: 0.3,
          betSizes: { flop: [33, 50], turn: [50], river: [50] },
          maxAllInThreshold: 0.8,
          randomization: 0.1,
          enabledGames: ['NLH'] as StrategyConfig['enabledGames'],
          configurationJson: {},
        },
        stakes: DEFAULT_STAKES,
        defaultBuyIn: 1000,
      };
    }
  }

  private async persistDecision(
    botId: string,
    tableId: string,
    handId: string,
    turnId: string,
    gameState: unknown,
    decision: BotDecisionResult,
  ): Promise<void> {
    try {
      await fetch(`${this.backendUrl}/api/v1/internal/bots/game-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          botId,
          tableId,
          handId,
          turnId,
          stateJson: JSON.stringify(gameState),
          decision: ACTION_TYPE_TO_STRING[decision.action],
          amount: decision.amount,
          confidence: decision.confidence,
          reason: decision.reason,
        }),
      });
    } catch (err) {
      console.warn(`[GameLoop] failed to persist decision for bot ${botId}:`, err);
    }
  }

  private async reportLiveState(state: LoopState): Promise<void> {
    try {
      const handId = state.currentHandId ?? `hand-${state.botId}-${state.handCounter}`;
      const gameState = await this.gameStateReader.readForDecision(
        state.page,
        state.botId,
        state.tableId,
        handId,
        state.currentTurnId ?? 'n/a',
        state.stakes,
      );

      if (gameState.pot > 0) {
        state.lastKnownPot = gameState.pot;
      }

      await fetch(`${this.backendUrl}/api/v1/internal/bots/live-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          botId: state.botId,
          tableId: state.tableId,
          handId,
          street: gameState.street,
          holeCards: gameState.holeCards,
          boardCards: gameState.boardCards,
          pot: gameState.pot,
          heroStack: gameState.heroStack,
        }),
      });
    } catch (err) {
      console.warn(`[GameLoop] failed to report live state for bot ${state.botId}:`, err);
    }
  }

  private diagnosticSnapshotCount = new Map<string, number>();

  /**
   * Temporary diagnostic aid: dumps HTML + screenshot on every IN_HAND tick
   * so a real flop/turn/river moment can be captured for offline analysis of
   * readBoardCards()/.totalplate positioning. Capped per bot to avoid disk
   * bloat; remove once board-card detection across all streets is fixed.
   */
  private async captureDiagnosticSnapshot(state: LoopState): Promise<void> {
    const count = this.diagnosticSnapshotCount.get(state.botId) ?? 0;
    if (count >= 400) return;
    this.diagnosticSnapshotCount.set(state.botId, count + 1);

    try {
      const dir = path.join(process.cwd(), 'storage', 'debug', state.botId, 'hand-diag');
      fs.mkdirSync(dir, { recursive: true });
      const label = `tick${state.tickCount}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await state.page.screenshot({ path: path.join(dir, `${timestamp}-${label}.png`) });
      const html = await state.page.content();
      fs.writeFileSync(path.join(dir, `${timestamp}-${label}.html`), html);
    } catch (err) {
      console.warn(`[GameLoop] failed to capture diagnostic snapshot for bot ${state.botId}:`, err);
    }
  }

  private async reportLiveStateCleared(botId: string): Promise<void> {
    try {
      await fetch(`${this.backendUrl}/api/v1/internal/bots/live-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          botId,
          handId: null,
          holeCards: [],
          boardCards: [],
          pot: 0,
        }),
      });
    } catch (err) {
      console.warn(`[GameLoop] failed to clear live state for bot ${botId}:`, err);
    }
  }

  private async reportActionResult(
    botId: string,
    tableId: string,
    handId: string,
    turnId: string,
    action: string,
    amount: number,
    success: boolean,
    errorMessage?: string,
    street?: string,
  ): Promise<void> {
    try {
      await fetch(`${this.backendUrl}/api/v1/internal/bots/action-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          botId,
          tableId,
          handId,
          turnId,
          action,
          amount,
          success,
          errorMessage,
          street,
        }),
      });
    } catch (err) {
      console.warn(`[GameLoop] failed to report action result for bot ${botId}:`, err);
    }
  }

  /**
   * Get-or-create the real backend PokerHand row for a hand that was just
   * detected starting, using the real hand number read off the table
   * (falls back to a per-bot synthetic id if that can't be read, so the
   * loop doesn't stall - just won't converge with the other bot's row).
   */
  private async startHandOnBackend(state: LoopState): Promise<string | null> {
    try {
      const externalHandId =
        (await this.gameStateReader.readHandNumber(state.page).catch(() => null)) ??
        `${state.botId}-${Date.now()}`;

      const response = await fetch(`${this.backendUrl}/api/v1/internal/hands/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          tableId: state.tableId,
          externalHandId,
          smallBlind: state.stakes.smallBlind,
          bigBlind: state.stakes.bigBlind,
          ante: state.stakes.ante,
          gameType: state.stakes.gameType,
        }),
      });

      if (!response.ok) {
        throw new Error(`hands/start returned ${response.status}`);
      }

      const data = (await response.json()) as { id: string };
      return data.id;
    } catch (err) {
      console.warn(`[GameLoop] failed to start hand on backend for bot ${state.botId}:`, err);
      return null;
    }
  }

  /**
   * Records this bot's result (profit/loss) for a hand once it's done
   * participating in it. handId/startStack are passed explicitly rather
   * than read off `state` because this runs fire-and-forget - by the time
   * it resolves, `state` may already have moved on to the next hand.
   */
  private async finishHandOnBackend(
    state: LoopState,
    handId: string,
    startStack: number,
    finalPot: number | null,
  ): Promise<void> {
    try {
      const endStack = await this.gameStateReader.readHeroStack(state.page).catch(() => startStack);
      await fetch(`${this.backendUrl}/api/v1/internal/bots/hand-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          botId: state.botId,
          handId,
          startStack,
          endStack,
          finalPot: finalPot ?? undefined,
        }),
      });
    } catch (err) {
      console.warn(`[GameLoop] failed to record hand result for bot ${state.botId}:`, err);
    }
  }
}
