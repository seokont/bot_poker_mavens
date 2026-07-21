import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import { BotState, BotStateMachine } from '../state-machine/bot-state-machine';
import { PlaywrightManager } from '../playwright/playwright-manager';
import { ActionExecutorService } from '../action-executor/action-executor.service';
import { HeartbeatService } from '../heartbeat/heartbeat.service';
import { ResourceManager } from '../resource-manager/resource-manager';
import { ErrorHandler } from '../error-handler/error-handler';
import { GameLoopService } from '../game-loop/game-loop.service';

export interface BotContext {
  botId: string;
  page: Page | null;
  tableId: string | null;
  handId: string | null;
  turnId: string | null;
  status: string;
  lastActionAt: string | null;
}

interface JobData {
  type: string;
  botId: string;
  login?: string;
  password?: string;
  tableId?: string;
  buyIn?: number;
  amount?: number;
  handId?: string;
  turnId?: string;
  action?: string;
}

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private backendUrl: string;
  private internalApiKey: string;
  private workerId: string;
  private botContexts: Map<string, BotContext> = new Map();
  private isProcessing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly stateMachine: BotStateMachine,
    private readonly playwrightManager: PlaywrightManager,
    private readonly actionExecutor: ActionExecutorService,
    private readonly heartbeatService: HeartbeatService,
    private readonly resourceManager: ResourceManager,
    private readonly errorHandler: ErrorHandler,
    private readonly gameLoopService: GameLoopService,
  ) {
    this.backendUrl = configService.get<string>('BACKEND_URL', 'http://localhost:3000');
    this.internalApiKey = configService.get<string>('INTERNAL_API_KEY', 'change-me-internal-api-key');
    this.workerId = configService.get<string>('WORKER_ID', `worker-${process.pid}`);

    this.redis = new Redis({
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: parseInt(configService.get<string>('REDIS_PORT', '6379'), 10),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.registerWithBackend();
    this.startJobProcessing();
    console.log(`[WorkerService] Worker ${this.workerId} initialized`);
  }

  async onModuleDestroy(): Promise<void> {
    this.isProcessing = false;
    await this.playwrightManager.closeAll();
    this.redis.disconnect();
  }

  async startBot(botId: string, login?: string, password?: string): Promise<boolean> {
    try {
      if (!this.resourceManager.canStartNewBot()) {
        console.warn(`[Worker] Cannot start bot ${botId}: resource limit reached`);
        return false;
      }

      this.stateMachine.setState(botId, BotState.STARTING);
      this.resourceManager.incrementBotCount();

      await this.playwrightManager.launchForBot(botId);

      this.stateMachine.setState(botId, BotState.BROWSER_CREATED);

      const page = await this.playwrightManager.createPage(botId);

      const botContext: BotContext = {
        botId,
        page,
        tableId: null,
        handId: null,
        turnId: null,
        status: 'starting',
        lastActionAt: null,
      };
      this.botContexts.set(botId, botContext);

      this.stateMachine.setState(botId, BotState.AUTHORIZING);

      const pokerUrl = this.configService.get<string>(
        'POKER_SITE_URL',
        'http://localhost:8080',
      ).replace(/\/+$/, ''); // remove trailing slash
      console.log(`[Worker] startBot: navigating to ${pokerUrl}`);
    await page.goto(pokerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`[Worker] startBot: page loaded, title: ${await page.title()}`);
    page.setDefaultTimeout(15000);

      await this.loginBot(page, botId, login, password);

      this.stateMachine.setState(botId, BotState.IN_LOBBY);
      botContext.status = 'in_lobby';

      this.heartbeatService.startHeartbeat(botId, 'in_lobby', () => ({
        tableId: botContext.tableId ?? undefined,
        handId: botContext.handId ?? undefined,
        lastActionAt: botContext.lastActionAt ?? undefined,
        browserConnected: true,
      }));

      await this.reportStatus(botId, 'IN_LOBBY');

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.errorHandler.handleError(botId, error);
      this.stateMachine.setState(botId, BotState.ERROR);
      this.resourceManager.decrementBotCount();
      await this.reportStatus(botId, 'ERROR', { errorMessage: error.message });
      return false;
    }
  }

  async stopBot(botId: string): Promise<boolean> {
    try {
      this.stateMachine.setState(botId, BotState.STOPPING);

      this.gameLoopService.stop(botId);
      this.heartbeatService.stopHeartbeat(botId);

      await this.playwrightManager.closeContext(botId);
      this.botContexts.delete(botId);
      this.stateMachine.forceSetState(botId, BotState.OFFLINE);
      this.resourceManager.decrementBotCount();

      await this.reportStatus(botId, 'OFFLINE');

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.errorHandler.handleError(botId, error);
      this.stateMachine.forceSetState(botId, BotState.OFFLINE);
      this.resourceManager.decrementBotCount();
      return false;
    }
  }

  async joinTable(
    botId: string,
    tableId: string,
    buyIn?: number,
    login?: string,
    password?: string,
  ): Promise<boolean> {
    let context = this.botContexts.get(botId);

    // Auto-start bot if not running
    if (!context?.page) {
      console.log(`[Worker] joinTable: bot not running, auto-starting bot "${botId}"`);
      const started = await this.startBot(botId, login, password);
      if (!started) {
        console.error(`[Worker] joinTable: failed to auto-start bot "${botId}"`);
        return false;
      }
      context = this.botContexts.get(botId);
      if (!context?.page) return false;
    }

    // A previous operation (this one or an unrelated stale job for the same
    // bot) may have left the state machine in ERROR while the browser itself
    // is still perfectly usable. Recover here rather than let every
    // subsequent setState() in this method silently fail and leave the loop
    // dispatching against a stuck ERROR state.
    if (this.stateMachine.getCurrentState(botId) === BotState.ERROR) {
      console.warn(
        `[Worker] joinTable: bot "${botId}" was in ERROR state, recovering to IN_LOBBY before proceeding`,
      );
      this.stateMachine.forceSetState(botId, BotState.IN_LOBBY);
    }

    try {
      this.stateMachine.setState(botId, BotState.OPENING_TABLE);

      const page = context.page;
      console.log(`[Worker] joinTable: getting direct link for bot "${botId}" -> table "${tableId}"`);

      // 1. Get direct table link from backend (internal API)
      const response = await fetch(`${this.backendUrl}/api/v1/internal/bots/direct-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({ botId, tableName: tableId }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to get direct link: ${response.status} ${errText}`);
      }

      const linkData = await response.json() as { url: string; params: Record<string, string> };
      const directUrl: string = linkData.url;

      console.log(`[Worker] joinTable: direct link obtained, navigating to: ${directUrl}`);

      // 2. Navigate directly to the table via the link (auto-login with SessionKey)
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      console.log(`[Worker] joinTable: navigated to table "${tableId}"`);

      // 3. Click on an empty seat (sp_seat) to sit down
      this.stateMachine.setState(botId, BotState.WAITING_FOR_SEAT);
      console.log(`[Worker] joinTable: looking for empty seat`);

      // Wait a bit for the table UI to fully render with animations
      await page.waitForTimeout(3000);
      await this.dismissNoticeDialogs(page);

      // Try to find and click any visible empty seat
      const emptySeatClicked = await this.clickEmptySeat(page);

      if (emptySeatClicked) {
        console.log(`[Worker] joinTable: clicked empty seat`);
        // Wait for buy-in dialog to appear
        await page.waitForTimeout(3000);
        await this.captureDebugSnapshot(page, botId, 'after-seat-click');
      } else {
        console.log(`[Worker] joinTable: no empty seat found, may already be seated`);
      }

      // 4. Handle buy-in if the dialog appears
      this.stateMachine.setState(botId, BotState.BUYING_IN);

      if (buyIn) {
        await this.performBuyIn(page, buyIn);
        await this.captureDebugSnapshot(page, botId, 'after-buyin');
      }

      // 5. Click ready/sit-in button after seating
      console.log(`[Worker] joinTable: looking for ready/sit-in button`);
      await page.waitForTimeout(2000);
      await this.dismissFullScreenPrompt(page);
      const readyResult1 = await this.clickReadyButton(page);
      await this.captureDebugSnapshot(page, botId, 'after-ready-1');

      // 6. Wait a bit and try ready button again (some dialogs close slowly)
      await page.waitForTimeout(2000);
      await this.dismissFullScreenPrompt(page);
      const readyResult2 = await this.clickReadyButton(page);
      await this.captureDebugSnapshot(page, botId, 'after-ready-2');

      // If every attempt only found a "join waiting list" option (never a
      // real ready/sit-in button), the table had no free seat and the bot
      // is queued, not seated - reporting SEATED here would be a lie the
      // rest of the system (and the admin UI) would trust.
      if (readyResult1 === 'waitlist' && readyResult2 === 'waitlist') {
        console.warn(
          `[Worker] joinTable: no free seat at "${tableId}" - bot "${botId}" only joined the waiting list`,
        );
        this.stateMachine.setState(botId, BotState.ERROR);
        await this.reportStatus(botId, 'ERROR', {
          errorMessage: 'No free seat available - joined waiting list only',
        });
        return false;
      }

      await this.dismissNoticeDialogs(page);

      // Final ground-truth check: even when every click along the way
      // "succeeded" (buy-in confirmed, no waitlist detected), the buy-in
      // can still be silently rejected by the site (e.g. an invalid/empty
      // amount) and leave the bot with no real seat - confirmed live, where
      // the bot's own browser showed only the other player seated. Our own
      // login is in the direct-link URL (`LoginName=...`); a real seat
      // means a visible `.seatplate .sp_name` matching it.
      const ownLoginMatch = page.url().match(/LoginName=([^&]+)/i);
      const ownLogin = ownLoginMatch ? decodeURIComponent(ownLoginMatch[1]) : login;

      if (ownLogin) {
        // The site briefly swaps the seatplate's name text for a status
        // message ("waiting for big blind") when a bot joins mid-hand -
        // confirmed live via a debug screenshot where "Oran101" was
        // genuinely seated (name + stack visible moments earlier) but the
        // name text read "ממתינה לבליינד הגדול" at the instant of a single
        // sample. A one-shot check can land inside that window and wrongly
        // conclude the seat wasn't taken, so retry a few times before
        // giving up - the name reappears once the status clears.
        let actuallySeated: boolean | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          actuallySeated = await page.evaluate((name: string) => {
            const doc = (globalThis as any).document;
            const nameEls = doc.querySelectorAll('.sp_name');
            for (const el of nameEls) {
              if (el.offsetParent !== null && (el.textContent || '').trim() === name) {
                return true;
              }
            }
            return false;
          }, ownLogin).catch(() => null);

          if (actuallySeated) break;
          if (attempt < 2) await page.waitForTimeout(1500);
        }

        if (actuallySeated === false) {
          console.warn(
            `[Worker] joinTable: buy-in/ready sequence completed but "${ownLogin}" is not visible in any seatplate - the seat was not actually taken`,
          );
          this.stateMachine.setState(botId, BotState.ERROR);
          await this.reportStatus(botId, 'ERROR', {
            errorMessage: 'Buy-in did not result in a visible seat',
          });
          return false;
        }
      }

      console.log(`[Worker] joinTable: successfully seated at table "${tableId}"`);
      this.stateMachine.setState(botId, BotState.SEATED);
      context.tableId = tableId;
      context.status = 'seated';
      context.lastActionAt = new Date().toISOString();

      this.heartbeatService.startHeartbeat(botId, 'seated', () => ({
        tableId,
        handId: context.handId ?? undefined,
        lastActionAt: context.lastActionAt ?? undefined,
        browserConnected: true,
      }));

      await this.reportStatus(botId, 'SEATED', { tableId });

      await this.gameLoopService.start(
        botId,
        tableId,
        page,
        (update) => {
          if (update.handId !== undefined) context.handId = update.handId;
          if (update.turnId !== undefined) context.turnId = update.turnId;
          context.lastActionAt = new Date().toISOString();
        },
        (amount) => {
          console.log(`[Worker] auto-rebuy triggered for bot "${botId}" (target ${amount})`);
          this.rebuy(botId, amount).catch((err) => {
            console.error(`[Worker] auto-rebuy failed for bot "${botId}":`, err);
          });
        },
        () => {
          console.log(`[Worker] auto-sit-in triggered for bot "${botId}"`);
          this.clickReadyButton(page).catch((err) => {
            console.error(`[Worker] auto-sit-in failed for bot "${botId}":`, err);
          });
        },
      );

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.errorHandler.handleError(botId, error, context.page);
      this.stateMachine.setState(botId, BotState.ERROR);
      await this.reportStatus(botId, 'ERROR', { errorMessage: error.message });
      return false;
    }
  }

  async leaveTable(botId: string): Promise<boolean> {
    const context = this.botContexts.get(botId);
    if (!context?.page) return false;

    try {
      this.stateMachine.setState(botId, BotState.LEAVING_TABLE);
      this.gameLoopService.stop(botId);

      // Confirmed via a live HTML capture on iqpoker88.com: leaving the
      // table is a two-step flow, not a single visible "Leave Table"
      // button. The table window's icon tray has a `.iconLeave` icon
      // (top-right, next to chat/settings) that opens a small dialog
      // titled after the table name with three options - `.tl_seat`
      // (leave seat / stand up), `.tl_table` (leave table entirely),
      // `.tl_trny` (leave tournament) - plus `.cancelbtn`. The previous
      // text-based selector guesses ("עזוב שולחן" etc.) never matched
      // anything on this skin.
      const leaveIcon = await this.firstVisible(context.page, '.iconLeave');

      if (leaveIcon) {
        await leaveIcon.click();
        await context.page.waitForTimeout(500);

        const leaveTableButton = await this.firstVisible(context.page, '.tl_table button');
        if (leaveTableButton) {
          await leaveTableButton.click();
          console.log(`[Worker] leaveTable: clicked .tl_table (leave table)`);
        } else {
          console.log(`[Worker] leaveTable: .iconLeave dialog opened but .tl_table not found`);
        }
      } else {
        // Fallback for skins where the confirmed icon doesn't apply.
        const leaveButton = context.page.locator(
          'button:has-text("עזוב שולחן"), button:has-text("קום"), button:has-text("Leave Table"), button:has-text("Stand Up")',
        );
        if (await leaveButton.isVisible().catch(() => false)) {
          await leaveButton.click();
        } else {
          console.log(`[Worker] leaveTable: no leave control found (.iconLeave or fallback text)`);
        }
      }

      await context.page.waitForTimeout(1000);

      // Ground-truth check, mirroring joinTable(): confirm our own name is
      // no longer shown in any seatplate before reporting success, instead
      // of assuming the click sequence worked.
      const ownLoginMatch = context.page.url().match(/LoginName=([^&]+)/i);
      const ownLogin = ownLoginMatch ? decodeURIComponent(ownLoginMatch[1]) : null;

      if (ownLogin) {
        const stillSeated = await context.page.evaluate((name: string) => {
          const doc = (globalThis as any).document;
          const nameEls = doc.querySelectorAll('.sp_name');
          for (const el of nameEls) {
            if (el.offsetParent !== null && (el.textContent || '').trim() === name) {
              return true;
            }
          }
          return false;
        }, ownLogin).catch(() => null);

        if (stillSeated === true) {
          console.warn(
            `[Worker] leaveTable: "${ownLogin}" is still visible in a seatplate after the leave sequence - retrying once`,
          );
          // One retry: the dialog may have been slow to open, or the first
          // click landed before it rendered.
          const retryIcon = await this.firstVisible(context.page, '.iconLeave');
          if (retryIcon) {
            await retryIcon.click();
            await context.page.waitForTimeout(500);
            const retryButton = await this.firstVisible(context.page, '.tl_table button');
            if (retryButton) {
              await retryButton.click();
              await context.page.waitForTimeout(1000);
            }
          }
        }
      }

      context.tableId = null;
      context.handId = null;
      context.turnId = null;
      context.status = 'in_lobby';

      this.stateMachine.setState(botId, BotState.IN_LOBBY);

      this.heartbeatService.startHeartbeat(botId, 'in_lobby', () => ({
        tableId: undefined,
        handId: undefined,
        lastActionAt: context.lastActionAt ?? undefined,
        browserConnected: true,
      }));

      await this.reportStatus(botId, 'IN_LOBBY');

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.errorHandler.handleError(botId, error, context.page);
      return false;
    }
  }

  async sitOut(botId: string): Promise<boolean> {
    const context = this.botContexts.get(botId);
    if (!context?.page) return false;

    try {
      this.stateMachine.setState(botId, BotState.SITTING_OUT);
      this.gameLoopService.pause(botId);

      const sitOutButton = context.page.locator(
        'button:has-text("דילוג על יד"), button:has-text("Sit Out"), button:has-text("Sit Out Next Hand")',
      );
      if (await sitOutButton.isVisible().catch(() => false)) {
        await sitOutButton.click();
      }

      context.status = 'sitting_out';
      await this.reportStatus(botId, 'SITTING_OUT');

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.errorHandler.handleError(botId, error, context.page);
      return false;
    }
  }

  async sitIn(botId: string): Promise<boolean> {
    const context = this.botContexts.get(botId);
    if (!context?.page) return false;

    try {
      const sitInButton = context.page.locator(
        'button:has-text("חזור למשחק"), button:has-text("Sit In"), button:has-text("Back to Game")',
      );
      if (await sitInButton.isVisible().catch(() => false)) {
        await sitInButton.click();
      }

      context.status = 'seated';
      this.stateMachine.setState(botId, BotState.SEATED);
      this.stateMachine.setState(botId, BotState.WAITING_FOR_HAND);
      this.gameLoopService.resume(botId);
      await this.reportStatus(botId, 'SEATED', { tableId: context.tableId ?? undefined });

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.errorHandler.handleError(botId, error, context.page);
      return false;
    }
  }

  async rebuy(botId: string, amount: number): Promise<boolean> {
    const context = this.botContexts.get(botId);
    if (!context?.page) return false;

    try {
      const rebuyButton = context.page.locator(
        'button:has-text("קנה צ\'יפים"), button:has-text("Rebuy"), button:has-text("Add Chips")',
      );
      if (await rebuyButton.isVisible().catch(() => false)) {
        await rebuyButton.click();
      }

      await this.performBuyIn(context.page, amount);
      context.lastActionAt = new Date().toISOString();

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.errorHandler.handleError(botId, error, context.page);
      return false;
    }
  }

  private async loginBot(page: Page, botId: string, login?: string, password?: string): Promise<void> {
    let username = login || '';
    let pass = password || '';

    if (!username || !pass) {
      const usernameKey = `BOT_${botId.toUpperCase()}_USERNAME`;
      const passwordKey = `BOT_${botId.toUpperCase()}_PASSWORD`;

      username = this.configService.get<string>(usernameKey, '');
      pass = this.configService.get<string>(passwordKey, '');

      if (!username || !pass) {
        username = this.configService.get<string>('BOT_DEFAULT_USERNAME', '');
        pass = this.configService.get<string>('BOT_DEFAULT_PASSWORD', '');
      }
    }

    console.log(`[Worker] loginBot: starting login for ${botId}, has credentials: ${!!username && !!pass}`);

    if (!username || !pass) {
      console.warn(`[Worker] No credentials for bot ${botId}, assuming already logged in`);
      return;
    }

    // Poker Mavens: click "כניסה" (Login) button
    const loginButton = page.locator('#LogInOutBtn');
    const isVisible = await loginButton.isVisible({ timeout: 5000 }).catch(() => false);
    const loginText = await loginButton.textContent().catch(() => '');
    console.log(`[Worker] loginBot: login button visible: ${isVisible}, text: "${loginText}"`);

    if (isVisible) {
      await loginButton.click({ force: true });
      console.log(`[Worker] loginBot: clicked login button`);
    } else {
      // Button not visible due to shader overlay - remove it and click
      console.log(`[Worker] loginBot: login button not visible, removing shader overlay`);
      await page.evaluate(() => {
        const s = (globalThis as any).document.querySelectorAll('.shader');
        s.forEach((x: any) => { x.style.display = 'none'; });
      }).catch(() => {});
      await page.waitForTimeout(500);
      if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await loginButton.click({ force: true });
        console.log(`[Worker] loginBot: clicked login button after removing shader`);
      } else {
        console.log(`[Worker] loginBot: still cannot find login button, clicking via JS`);
        await page.evaluate(() => {
          const btn = (globalThis as any).document.querySelector('#LogInOutBtn');
          if (btn) btn.click();
        }).catch(() => {});
      }
    }

    // Wait for login dialog to appear
    await page.waitForTimeout(1500);
    console.log(`[Worker] loginBot: checking for login dialog`);

    // Check if login dialog appeared
    const loginDialog = page.locator('#Login');
    if (await loginDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[Worker] loginBot: login dialog visible, filling fields`);

      // Fill username (first visible text input inside login dialog)
      const usernameInput = page.locator('#Login input[type="text"]').first();
      await usernameInput.fill(username);
      console.log(`[Worker] loginBot: filled username`);

      // Fill password
      const passwordInput = page.locator('#Login input[type="password"]').first();
      await passwordInput.fill(pass);
      console.log(`[Worker] loginBot: filled password`);

      // Click "אישור" (OK) button
      const submitButton = page.locator('#Login button:has-text("אישור"), #Login button:has-text("OK")');
      console.log(`[Worker] loginBot: clicking submit`);
      await submitButton.click();
      await page.waitForTimeout(3000);
      console.log(`[Worker] loginBot: login completed`);
    } else {
      console.log(`[Worker] loginBot: login dialog not visible after click`);
    }
  }

  private async clickEmptySeat(page: Page): Promise<boolean> {
    try {
      // `.sp_seat` (the clickable seat area) exists for EVERY seat position,
      // occupied or not - Poker Mavens uses it both to open the buy-in
      // dialog on an empty seat and to open a player-profile popup on an
      // occupied one. Blindly clicking `.first()` eventually hits an
      // occupied seat as more real players join the table, which was
      // confirmed live (it opened a player's info dialog instead of
      // seating the bot). Each seat position wraps `.sp_seat` plus, when
      // occupied (including just "sitting out" - confirmed live with a
      // real player, name shown, seat still held), a `.sp_name` sibling
      // with the player's name - skip any seat whose `.sp_name` has real
      // text. The outer wrapper's own class is NOT reliably ".seatplate" -
      // confirmed live it's sometimes bare ".hide" instead - so query
      // `.sp_seat` directly (a stable 1-per-seat-position element) and look
      // at its own parent for the name, rather than starting from
      // ".seatplate" and missing seats whose wrapper lacks that class.
      // Find which `.sp_seat` (by index) is the right one to click via JS,
      // but perform the actual click through Playwright's real mouse-event
      // API rather than the element's own `.click()` method. A JS-level
      // `.click()` dispatches an untrusted synthetic event (isTrusted:
      // false); a real seat-reservation flow is exactly the kind of
      // sensitive action a site might gate on genuine user input, so
      // clicking through Playwright (which drives real OS/CDP mouse events)
      // is the more robust choice here.
      const targetIndex: number = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const seatEls = Array.from(doc.querySelectorAll('.sp_seat'));
        for (let i = 0; i < seatEls.length; i++) {
          const seatEl: any = seatEls[i];
          const parent = seatEl.parentElement;
          const nameEl = parent ? parent.querySelector('.sp_name') : null;
          const occupied = nameEl && nameEl.textContent && nameEl.textContent.trim().length > 0;
          if (occupied) continue;
          if (seatEl.offsetParent !== null) return i;
        }
        return -1;
      }).catch(() => -1);

      if (targetIndex >= 0) {
        const seatLocator = page.locator('.sp_seat').nth(targetIndex);
        await seatLocator.click({ force: true, timeout: 3000 }).catch(async () => {
          // Fall back to the synthetic click only if a real click can't
          // land (e.g. the element is covered by an overlay).
          await page.evaluate((idx: number) => {
            const doc = (globalThis as any).document;
            const el: any = doc.querySelectorAll('.sp_seat')[idx];
            if (el) el.click();
          }, targetIndex);
        });
        console.log(`[Worker] clickEmptySeat: clicked an unoccupied seatplate (seat index ${targetIndex}) via real mouse click`);
        return true;
      }

      console.log(`[Worker] clickEmptySeat: no unoccupied seatplate found, falling back to generic selectors`);

      // Fallback for skins without the confirmed .seatplate/.sp_name
      // structure - less reliable since it can't distinguish occupied
      // seats, but better than nothing.
      const seatSelectors = [
        'div.sp_seat',
        'div.seat.empty',
        'div[class*="seat"][class*="empty"]',
        'div[class*="sp_seat"]',
        '.tablecontent div.sp_seat',
        '.table_content div.sp_seat',
        'div[id*="Table"] div.sp_seat',
        'div[id*="table"] div.sp_seat',
      ];

      for (const selector of seatSelectors) {
        const seats = page.locator(selector);
        const count = await seats.count();
        if (count > 0) {
          console.log(`[Worker] clickEmptySeat: found ${count} seats with selector "${selector}"`);
          const firstSeat = seats.first();
          if (await firstSeat.isVisible({ timeout: 3000 }).catch(() => false)) {
            await firstSeat.click({ force: true });
            console.log(`[Worker] clickEmptySeat: clicked seat`);
            return true;
          }
        }
      }

      // Strategy 2: Use JavaScript to find and click any clickable seat element
      console.log(`[Worker] clickEmptySeat: trying JS-based seat click`);
      const clicked = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        // Look for any element with 'seat' in class or id that's visible
        const allElements = doc.querySelectorAll('*');
        for (const el of allElements) {
          const cls = (el.className || '') + ' ' + (el.id || '');
          if (
            cls.toLowerCase().includes('seat') &&
            el.offsetParent !== null &&
            el.tagName !== 'SCRIPT' &&
            el.tagName !== 'STYLE'
          ) {
            el.click();
            return true;
          }
        }
        return false;
      }).catch(() => false);

      if (clicked) {
        console.log(`[Worker] clickEmptySeat: clicked seat via JS`);
        return true;
      }

      console.log(`[Worker] clickEmptySeat: no empty seat found`);
      return false;
    } catch (err) {
      console.warn(`[Worker] clickEmptySeat error:`, err);
      return false;
    }
  }

  // "הצטרף לרשימת ההמתנה" (Join Waiting List) appears when the table has no
  // free seat - it starts with "הצטרף" (Join), the same word we match for
  // the legitimate "join/sit in" action, so a plain substring match clicks
  // it by mistake and the bot ends up queued, not seated. Must be excluded
  // explicitly everywhere we match on "הצטרף".
  private static readonly WAITLIST_TEXT = 'רשימת ההמתנה';

  private async clickReadyButton(page: Page): Promise<'ready' | 'waitlist' | 'none'> {
    try {
      // Common Poker Mavens ready/sit-in button selectors
      const readySelectors = [
        'button:has-text("הצטרף")',
        'button:has-text("המתנה")',
        'button:has-text("אישור")',
        'button:has-text("מוכן")',
        'button:has-text("השב")',
        'button:has-text("חזור")',
        'button:has-text("התחל")',
        // English buttons
        'button:has-text("Ready")',
        'button:has-text("Sit In")',
        'button:has-text("Join")',
        'button:has-text("Play")',
        'button:has-text("Start")',
        'button:has-text("Back to Game")',
        'button:has-text("Confirm")',
        // Generic
        '#Dialog_Button_OK',
        '#OkBtn',
        '#ReadyBtn',
        '#SitInBtn',
        '#PlayBtn',
        '.dialog_button',
        'div.button:has-text("אישור")',
        'div.button:has-text("הצטרף")',
      ];

      let sawWaitlist = false;

      for (const selector of readySelectors) {
        const btn = page.locator(selector);
        const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          const text = (await btn.textContent().catch(() => '')) ?? '';
          if (text.includes(WorkerService.WAITLIST_TEXT)) {
            sawWaitlist = true;
            continue;
          }
          console.log(`[Worker] clickReadyButton: found button "${selector}"`);
          await btn.click({ force: true });
          console.log(`[Worker] clickReadyButton: clicked`);
          await page.waitForTimeout(1000);
          return 'ready';
        }
      }

      // Fallback: try clicking any visible button in the dialog area
      console.log(`[Worker] clickReadyButton: no ready button found by selector, trying JS fallback`);
      const clicked = await page.evaluate((waitlistText: string) => {
        const w = (globalThis as any);
        const buttons = w.document.querySelectorAll('button, .button, input[type="submit"], input[type="button"], div[role="button"]');
        for (const btn of buttons) {
          if (btn.offsetParent !== null) {
            const text = (btn.textContent || btn.value || '').toLowerCase();
            if (text.includes(waitlistText.toLowerCase())) continue;
            // Hebrew: הצטרף=join, המתנה=wait, אישור=confirm, מוכן=ready, השב=sit back, חזור=return
            if (
              text.includes('ready') ||
              text.includes('sit') ||
              text.includes('join') ||
              text.includes('play') ||
              text.includes('confirm') ||
              text.includes('start') ||
              text.includes('הצטרף') ||
              text.includes('המתנה') ||
              text.includes('אישור') ||
              text.includes('מוכן') ||
              text.includes('השב') ||
              text.includes('חזור') ||
              text.includes('התחל')
            ) {
              btn.click();
              return text;
            }
          }
        }
        return null;
      }, WorkerService.WAITLIST_TEXT).catch(() => null);

      if (clicked) {
        console.log(`[Worker] clickReadyButton: clicked button via JS: "${clicked}"`);
        return 'ready';
      }

      // Log all visible buttons for debugging
      const visibleButtons = await page.evaluate(() => {
        const w = (globalThis as any);
        const btns = w.document.querySelectorAll('button, .button, input[type="submit"]');
        const results = [];
        for (const b of btns) {
          if (b.offsetParent !== null) {
            results.push({ text: (b.textContent || b.value || '').substring(0, 40), id: b.id, class: b.className });
          }
        }
        return results;
      }).catch(() => []);
      console.log(`[Worker] clickReadyButton: visible buttons: ${JSON.stringify(visibleButtons)}`);

      const waitlistBtn = page.locator(`button:has-text("${WorkerService.WAITLIST_TEXT}")`);
      if (sawWaitlist || (await waitlistBtn.isVisible().catch(() => false))) {
        console.log(`[Worker] clickReadyButton: only a "join waiting list" option is available - no free seat right now`);
        return 'waitlist';
      }

      console.log(`[Worker] clickReadyButton: no ready button found`);
      return 'none';
    } catch (err) {
      console.warn(`[Worker] clickReadyButton error:`, err);
      return 'none';
    }
  }

  /**
   * Poker Mavens' page keeps multiple copies of the same class around
   * (empty templates, off-screen/animation-staged elements) - `.first()` on
   * a class selector routinely binds to one of those instead of the one
   * actually on screen. Scan every match and return the first one
   * Playwright confirms visible.
   */
  private async firstVisible(page: Page, selector: string): Promise<ReturnType<Page['locator']> | null> {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    return null;
  }

  /**
   * Diagnostic-only: saves a screenshot + HTML snapshot at a named
   * checkpoint during joinTable(), so the actual live seating/buy-in flow
   * can be inspected visually instead of guessed from text logs.
   */
  private async captureDebugSnapshot(page: Page, botId: string, label: string): Promise<void> {
    try {
      const dir = path.join(process.cwd(), 'storage', 'debug', botId);
      fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const pngPath = path.join(dir, `${ts}-${label}.png`);
      const htmlPath = path.join(dir, `${ts}-${label}.html`);
      await page.screenshot({ path: pngPath }).catch(() => {});
      const html = await page.content().catch(() => null);
      if (html) fs.writeFileSync(htmlPath, html, 'utf-8');
      console.log(`[Worker] captureDebugSnapshot: saved "${label}" -> ${pngPath}`);
    } catch (err) {
      console.warn(`[Worker] captureDebugSnapshot failed for "${label}":`, err);
    }
  }

  /**
   * Dismisses generic informational "הודעה" (Notice) popups - e.g. "the
   * minimum buy-in at this table is X" when a live table's minimum has
   * risen above the requested amount. Confirmed via a live snapshot: these
   * render as `.dialog > .dialogcontent > .okbtn > button`, distinct from
   * the main buy-in dialog's `.ok`/`.cancel` button pair (which has a
   * cancel option and must NOT be blindly auto-confirmed here). Left
   * undismissed, this notice sits on top of the table UI indefinitely and
   * blocks every subsequent read (seat/cards/pot all read as empty), which
   * is exactly what happened live: a bot stuck in WAITING_FOR_HAND forever
   * after a buy-in below the table's current (dynamic) minimum.
   */
  private async dismissNoticeDialogs(page: Page): Promise<void> {
    try {
      for (let i = 0; i < 3; i++) {
        const okBtn = await this.firstVisible(page, '.dialog .okbtn button');
        if (!okBtn) return;
        console.log(`[Worker] dismissNoticeDialogs: dismissing a notice popup`);
        await okBtn.click().catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch {
      // Best-effort - if this fails, the normal buy-in flow below still runs.
    }
  }

  /**
   * Some fresh browser profiles land on a full-page "Open in full screen
   * mode" banner over the table, covering the ready/sit-in button entirely
   * - confirmed live via a debug screenshot where the button was hidden
   * behind this exact banner while other already-warmed profiles never saw
   * it. Clicking it (rather than hiding it) is the correct action since it's
   * a legitimate CTA that reveals the real game view, not a decorative
   * overlay like `.shader`.
   */
  private async dismissFullScreenPrompt(page: Page): Promise<void> {
    try {
      const clicked = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        // offsetParent is null for position:fixed elements even when they're
        // genuinely visible (a real browser quirk, not just "is it hidden") -
        // this banner is exactly the kind of full-page fixed-position
        // overlay that trips that check, so use getBoundingClientRect/
        // computed style instead of offsetParent to decide visibility.
        const isVisible = (el: any): boolean => {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          const style = (globalThis as any).getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
        };
        const candidates = doc.querySelectorAll('button, a, div, span');
        for (const el of candidates) {
          const text = (el.textContent || '').trim().toLowerCase();
          if (!text.includes('full screen') && !text.includes('fullscreen')) continue;
          if (!isVisible(el)) continue;
          el.click();
          return text.substring(0, 60);
        }
        return null;
      });
      if (clicked) {
        console.log(`[Worker] dismissFullScreenPrompt: clicked "${clicked}"`);
        await page.waitForTimeout(1000);
      }
    } catch {
      // Best-effort - if this fails, the normal ready-button flow below still runs.
    }
  }

  private async performBuyIn(page: Page, amount: number): Promise<void> {
    try {
      await this.dismissNoticeDialogs(page);
      // Remove any shader overlay that might be blocking inputs
      await page.evaluate(() => {
        const w = (globalThis as any);
        const shaders = w.document.querySelectorAll('.shader');
        for (const s of shaders) {
          s.style.display = 'none';
        }
      }).catch(() => {});
      await page.waitForTimeout(300);

      // `.first()` picks the first DOM match regardless of visibility - if
      // an earlier (hidden/off-screen, e.g. in the lobby window behind this
      // one) element happens to contain the same text, it silently wins and
      // isVisible() correctly reports false for THAT element while a real,
      // visible match exists elsewhere. Walk all matches and act on the
      // first one that's actually visible instead.
      const firstVisible = async (locator: ReturnType<Page['getByText']>) => {
        const count = await locator.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
          const candidate = locator.nth(i);
          if (await candidate.isVisible().catch(() => false)) return candidate;
        }
        return null;
      };

      // Confirmed via a live screenshot capture: Poker Mavens' real buy-in
      // dialog is titled "מושב פנוי" (Empty Seat) and shows a "שניות:"
      // (Seconds:) countdown - the seat reservation is released if not
      // confirmed within ~30 seconds, which is why earlier attempts that
      // never found this dialog resulted in the bot silently losing its
      // seat. The dialog's buttons/labels are plain text elements, not
      // `<button>` tags, which is why `button:has-text(...)` never matched.
      let dialogAppeared = false;
      const dialogDeadline = Date.now() + 6000;
      while (Date.now() < dialogDeadline && !dialogAppeared) {
        dialogAppeared = (await firstVisible(page.getByText('שניות', { exact: false }))) !== null;
        if (!dialogAppeared) await page.waitForTimeout(300);
      }

      if (!dialogAppeared) {
        console.log(`[Worker] performBuyIn: buy-in dialog ("שניות" countdown) did not appear, skipping`);
        return;
      }

      console.log(`[Worker] performBuyIn: buy-in dialog detected`);

      // The dialog offers a minimum, a maximum, and a custom "other" amount
      // (pre-selected, with an editable input next to it). Prefer the
      // preset min/max option if it matches the requested amount exactly;
      // otherwise fill the custom "other" input.
      let amountSet = false;
      const minLabel = await firstVisible(page.getByText(new RegExp(`מינימלי.*${amount}|${amount}.*מינימלי`)));
      const maxLabel = minLabel ? null : await firstVisible(page.getByText(new RegExp(`מקסימלי.*${amount}|${amount}.*מקסימלי`)));

      if (minLabel) {
        await minLabel.click().catch(() => {});
        amountSet = true;
        console.log(`[Worker] performBuyIn: selected preset minimum amount ${amount}`);
      } else if (maxLabel) {
        await maxLabel.click().catch(() => {});
        amountSet = true;
        console.log(`[Worker] performBuyIn: selected preset maximum amount ${amount}`);
      }

      if (!amountSet) {
        const otherLabel = await firstVisible(page.getByText('ביי-אין אחר'));
        if (otherLabel) {
          const otherInput = otherLabel.locator('xpath=following::input[1]');
          const otherVisible = await otherInput.isVisible({ timeout: 2000 }).catch(() => false);
          if (otherVisible) {
            await otherInput.fill(String(amount));
            console.log(`[Worker] performBuyIn: filled custom amount ${amount}`);
            amountSet = true;
          }
        }
      }

      if (!amountSet) {
        console.log(`[Worker] performBuyIn: could not select/fill any amount option, using dialog default`);
      }

      // The dialog's own instructional paragraph contains the substring
      // "אישור" too ("...לחץ על אישור בתוך 30 שניות..."), is visible, and
      // comes before the real button in DOM order - a plain substring
      // match grabs that sentence instead of the button. Anchor the match
      // to elements whose *entire* (trimmed) text is just "אישור", tolerant
      // of invisible bidi control characters (U+200E/U+200F) around it.
      const confirmExact = new RegExp('^[\\s\\u200e\\u200f]*אישור[\\s\\u200e\\u200f]*$');
      const confirmButton = await firstVisible(page.getByText(confirmExact));
      if (confirmButton) {
        await confirmButton.click();
        console.log(`[Worker] performBuyIn: clicked confirm`);
      } else {
        console.log(`[Worker] performBuyIn: confirm ("אישור") not found`);
      }

      // Live tables can raise their minimum buy-in dynamically (e.g. tied to
      // the current biggest stack) - confirmed live, where a custom amount
      // that was valid earlier got silently rejected here, popping the
      // "minimum buy-in is X" notice on top of this dialog and leaving the
      // bot stuck forever (every later read saw an empty seat, no hand ever
      // started). If dismissing that notice reveals this same dialog still
      // open, the requested amount didn't go through - fall back to
      // whichever preset the site currently calls "minimum" rather than
      // leaving the bot seatless.
      await page.waitForTimeout(500);
      const rejectionNotice = await this.firstVisible(page, '.dialog .okbtn button');
      if (rejectionNotice) {
        console.log(
          `[Worker] performBuyIn: requested amount ${amount} was rejected (likely below the table's current minimum) - falling back to the minimum preset`,
        );
        await this.dismissNoticeDialogs(page);
        const minFallback = await firstVisible(page.getByText('מינימלי', { exact: false }));
        if (minFallback) {
          await minFallback.click().catch(() => {});
          const confirmButton2 = await firstVisible(page.getByText(confirmExact));
          if (confirmButton2) {
            await confirmButton2.click().catch(() => {});
            console.log(`[Worker] performBuyIn: re-confirmed with minimum preset amount`);
          }
        }
      }

      await page.waitForTimeout(1000);
    } catch (err) {
      console.warn('[Worker] Failed to perform buy-in:', err);
    }
  }

  private async registerWithBackend(): Promise<void> {
    try {
      const response = await fetch(`${this.backendUrl}/api/v1/internal/workers/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          workerId: this.workerId,
          maxBots: parseInt(
            this.configService.get<string>('MAX_BOTS_PER_WORKER', '5'),
            10,
          ),
          port: this.configService.get<string>('WORKER_PORT', '3001'),
        }),
      });

      if (!response.ok) {
        console.warn(`[Worker] Backend registration returned ${response.status}`);
      }
    } catch (err) {
      console.warn('[Worker] Failed to register with backend:', err);
    }
  }

  private async reportStatus(
    botId: string,
    status: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await fetch(`${this.backendUrl}/api/v1/internal/bots/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': this.internalApiKey,
        },
        body: JSON.stringify({
          botId,
          status,
          workerId: this.workerId,
          ...extra,
        }),
      });
    } catch (err) {
      console.warn(`[Worker] Failed to report status for bot ${botId}:`, err);
    }
  }

  private startJobProcessing(): void {
    this.isProcessing = true;
    this.processJobs().catch((err) => {
      console.error('[Worker] Job processing error:', err);
    });
  }

  private async processJobs(): Promise<void> {
    const queueName = this.configService.get<string>('BOT_QUEUE_NAME', 'bot-commands');
    console.log(`[Worker] processJobs: starting to listen on queue "${queueName}"`);

    while (this.isProcessing) {
      try {
        console.log(`[Worker] processJobs: waiting for jobs on "${queueName}" (BRPOP timeout 5s)...`);
        const result = await this.redis.brpop(queueName, 5);

        if (result) {
          const [, rawData] = result;
          console.log(`[Worker] processJobs: received raw data: ${rawData.substring(0, 200)}`);
          const job: JobData = JSON.parse(rawData);
          console.log(`[Worker] processJobs: parsed job: type=${job.type}, botId=${job.botId}`);
          await this.handleJob(job);
        } else {
          console.log(`[Worker] processJobs: BRPOP timed out, no jobs available`);
        }
      } catch (err) {
        if (this.isProcessing) {
          console.error('[Worker] Error processing job:', err);
        }
      }
    }

    console.log(`[Worker] processJobs: stopped listening`);
  }

  private async handleJob(job: JobData): Promise<void> {
    const { type, botId } = job;

    console.log(`[Worker] Processing job: ${type} for bot ${botId}`);

    // Map BullMQ SCREAMING_SNAKE_CASE types to camelCase
    const typeMap: Record<string, string> = {
      'START_BOT': 'startBot',
      'STOP_BOT': 'stopBot',
      'RESTART_BOT': 'restartBot',
      'JOIN_TABLE': 'joinTable',
      'LEAVE_TABLE': 'leaveTable',
      'SIT_OUT': 'sitOut',
      'SIT_IN': 'sitIn',
      'REBUY': 'rebuy',
      'EXECUTE_ACTION': 'executeAction',
    };
    const normalizedType = typeMap[type] || type;

    try {
      switch (normalizedType) {
        case 'startBot':
          await this.startBot(botId, job.login, job.password);
          break;
        case 'stopBot':
          await this.stopBot(botId);
          break;
        case 'joinTable':
          await this.joinTable(botId, job.tableId!, job.buyIn, job.login, job.password);
          break;
        case 'leaveTable':
          await this.leaveTable(botId);
          break;
        case 'sitOut':
          await this.sitOut(botId);
          break;
        case 'sitIn':
          await this.sitIn(botId);
          break;
        case 'rebuy':
          await this.rebuy(botId, job.amount!);
          break;
        case 'executeAction': {
          const context = this.botContexts.get(botId);
          await this.actionExecutor.executeAction(
            botId,
            job.tableId!,
            job.handId!,
            job.turnId!,
            job.action!,
            job.amount,
            context?.page ?? undefined,
          );
          break;
        }
        default:
          console.warn(`[Worker] Unknown job type: ${type}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.errorHandler.handleError(botId, error);
    }
  }
}
