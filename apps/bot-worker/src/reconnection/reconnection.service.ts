import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import { PlaywrightManager } from '../playwright/playwright-manager';
import { BotStateMachine } from '../state-machine/bot-state-machine';

@Injectable()
export class ReconnectionService {
  private readonly maxAttempts: number;
  private readonly backoffDelays: number[];

  constructor(
    private readonly configService: ConfigService,
    private readonly playwrightManager: PlaywrightManager,
    private readonly stateMachine: BotStateMachine,
  ) {
    this.maxAttempts = parseInt(
      this.configService.get<string>('BOT_MAX_RECONNECT_ATTEMPTS', '5'),
      10,
    );

    this.backoffDelays = [5000, 10000, 20000, 40000, 60000];
  }

  async reconnectBot(
    botId: string,
    tableId?: string,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      console.log(
        `[Reconnection] Attempt ${attempt}/${this.maxAttempts} for bot ${botId}`,
      );

      try {
        this.stateMachine.forceSetState(botId, 'RECONNECTING' as any);
        const success = await this.attemptReconnect(botId, tableId);

        if (success) {
          console.log(`[Reconnection] Bot ${botId} reconnected successfully`);
          return true;
        }
      } catch (err) {
        console.error(
          `[Reconnection] Attempt ${attempt} failed for bot ${botId}:`,
          err,
        );
      }

      if (attempt < this.maxAttempts) {
        const delay = this.backoffDelays[attempt - 1] ?? 60000;
        console.log(`[Reconnection] Waiting ${delay}ms before next attempt`);
        await this.sleep(delay);
      }
    }

    console.error(
      `[Reconnection] All ${this.maxAttempts} attempts failed for bot ${botId}`,
    );
    return false;
  }

  private async attemptReconnect(
    botId: string,
    tableId?: string,
  ): Promise<boolean> {
    const context = this.playwrightManager.getContext(botId);

    if (!context) {
      console.log('[Reconnection] No existing context, creating new one');
      await this.playwrightManager.getOrCreateContext(botId);
    }

    const page = await this.playwrightManager.createPage(botId);

    try {
      const pokerUrl = this.configService.get<string>(
        'POKER_SITE_URL',
        'http://localhost:8080',
      );
      await page.goto(pokerUrl, { waitUntil: 'domcontentloaded' });

      const isLoggedIn = await this.verifyAuthentication(page);
      if (!isLoggedIn) {
        console.log('[Reconnection] Not authenticated, attempting re-login');
        const reloginSuccess = await this.relogin(page);
        if (!reloginSuccess) {
          return false;
        }
      }

      if (tableId) {
        await this.reopenTable(page, tableId);
        const isSeated = await this.verifySeated(page);
        if (!isSeated) {
          console.log('[Reconnection] Bot is no longer seated at the table');
        }
      }

      return true;
    } catch (err) {
      console.error('[Reconnection] Attempt failed:', err);
      await page.close().catch(() => {});
      return false;
    }
  }

  private async verifyAuthentication(page: Page): Promise<boolean> {
    try {
      const loggedInIndicator = page.locator(
        '[data-testid="user-menu"], .logged-in, .user-avatar, .account-info',
      );
      return await loggedInIndicator.isVisible({ timeout: 10000 }).catch(() => false);
    } catch {
      return false;
    }
  }

  private async relogin(page: Page): Promise<boolean> {
    try {
      const loginButton = page.locator(
        'button:has-text("Login"), button:has-text("Sign In"), a:has-text("Login")',
      );
      const isVisible = await loginButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (!isVisible) {
        return false;
      }

      await loginButton.click();
      await page.waitForTimeout(2000);

      const usernameInput = page.locator('input[type="text"], input[name="username"], input[name="login"]').first();
      const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

      const username = this.configService.get<string>(`BOT_DEFAULT_USERNAME`, '');
      const password = this.configService.get<string>(`BOT_DEFAULT_PASSWORD`, '');

      if (!username || !password) {
        console.warn('[Reconnection] No credentials configured for bot');
        return false;
      }

      await usernameInput.fill(username);
      await passwordInput.fill(password);

      const submitButton = page.locator(
        'button[type="submit"], button:has-text("Login"), button:has-text("Sign In")',
      );
      await submitButton.click();
      await page.waitForTimeout(3000);

      return await this.verifyAuthentication(page);
    } catch (err) {
      console.error('[Reconnection] Re-login failed:', err);
      return false;
    }
  }

  private async reopenTable(page: Page, tableId: string): Promise<void> {
    try {
      const tableUrl = `${this.configService.get<string>('POKER_SITE_URL', 'http://localhost:8080')}/table/${tableId}`;
      await page.goto(tableUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    } catch (err) {
      console.error('[Reconnection] Failed to reopen table:', err);
    }
  }

  private async verifySeated(page: Page): Promise<boolean> {
    try {
      const seatIndicator = page.locator(
        '[data-testid="hero-seat"], .hero-seat, .my-seat, .seat-taken',
      );
      return await seatIndicator.isVisible({ timeout: 10000 }).catch(() => false);
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
