import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Page } from 'playwright';
import { GameStateReader } from '../game-state-reader/game-state-reader';

export interface PreFlightResult {
  passed: boolean;
  failures: string[];
}

export interface ActionExecutionResult {
  success: boolean;
  error?: string;
  verificationDetails?: Record<string, unknown>;
}

@Injectable()
export class ActionExecutorService {
  private redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly gameStateReader: GameStateReader,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: parseInt(this.configService.get<string>('REDIS_PORT', '6379'), 10),
    });
  }

  async executeAction(
    botId: string,
    tableId: string,
    handId: string,
    turnId: string,
    action: string,
    amount?: number,
    page?: Page,
  ): Promise<ActionExecutionResult> {
    const lockKey = `bot-action-lock:${botId}:${tableId}:${handId}:${turnId}`;
    const lockAcquired = await this.acquireLock(lockKey, 30);

    if (!lockAcquired) {
      return {
        success: false,
        error: 'Duplicate action detected - lock already exists for this hand/turn',
      };
    }

    try {
      if (!page) {
        return { success: false, error: 'No page available for bot' };
      }

      const preFlight = await this.runPreFlightChecks(
        botId,
        tableId,
        handId,
        turnId,
        action,
        amount,
        page,
      );

      if (!preFlight.passed) {
        return {
          success: false,
          error: `Pre-flight checks failed: ${preFlight.failures.join(', ')}`,
          verificationDetails: { failures: preFlight.failures },
        };
      }

      const result = await this.executePokerAction(page, action, amount);

      if (result) {
        // There's no reliable, independent hand/turn id on the page to
        // re-check post-click (Poker Mavens exposes none), so a clean
        // button click is the success signal itself - trying to "verify"
        // via a nonexistent id just produces a false negative here.
        return { success: true };
      }

      return { success: false, error: 'Action execution returned no result' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Action execution error: ${message}` };
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  private async runPreFlightChecks(
    _botId: string,
    expectedTableId: string,
    expectedHandId: string,
    expectedTurnId: string,
    action: string,
    amount: number | undefined,
    page?: Page,
  ): Promise<PreFlightResult> {
    const failures: string[] = [];

    if (!page) {
      failures.push('No page available for bot');
      return { passed: false, failures };
    }

    const tableCheck = await this.isCorrectTable(page, expectedTableId);
    if (!tableCheck) failures.push('Incorrect table');

    const seated = await this.isSeated(page);
    if (!seated) failures.push('Bot is not seated');

    const inHand = await this.isInHand(page);
    if (!inHand) failures.push('Bot is not in a hand');

    const heroTurn = await this.isHeroTurn(page);
    if (!heroTurn) failures.push('Not hero turn');

    const handCheck = await this.verifyHandId(page, expectedHandId);
    if (!handCheck) failures.push(`Hand ID mismatch (expected: ${expectedHandId})`);

    const turnCheck = await this.verifyTurnId(page, expectedTurnId);
    if (!turnCheck) failures.push(`Turn ID mismatch (expected: ${expectedTurnId})`);

    const actionAllowed = this.isActionAllowed(action);
    if (!actionAllowed) failures.push(`Action "${action}" is not allowed`);

    if (amount !== undefined) {
      const amountValid = await this.isAmountInRange(page, action, amount);
      if (!amountValid) failures.push(`Amount ${amount} is out of valid range`);
    }

    return { passed: failures.length === 0, failures };
  }

  private async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  private async releaseLock(key: string): Promise<void> {
    await this.redis.del(key);
  }

  // The bot only ever holds one page per table (there's no multi-table
  // juggling in a single browser context), and Poker Mavens' real URL scheme
  // doesn't contain our internal table id, so this can only fail closed if we
  // have positive evidence of being on the *wrong* page, not just an
  // inability to confirm the right one.
  private async isCorrectTable(page: Page, _expectedTableId: string): Promise<boolean> {
    try {
      return !page.isClosed();
    } catch {
      return false;
    }
  }

  private async isSeated(page: Page): Promise<boolean> {
    try {
      const seatIndicator = page.locator('[data-testid="hero-seat"], .hero-seat, .my-seat');
      if ((await seatIndicator.count()) > 0) {
        return await seatIndicator.first().isVisible().catch(() => false);
      }
      // No known seat indicator on this skin - fall back to the same
      // hole-cards/pot heuristic used to detect an active hand, since being
      // dealt cards implies being seated.
      return await this.gameStateReader.isHandInProgress(page);
    } catch {
      return false;
    }
  }

  private async isInHand(page: Page): Promise<boolean> {
    try {
      const handIndicator = page.locator('[data-testid="in-hand"], .in-hand, .hand-active');
      if ((await handIndicator.count()) > 0) {
        return await handIndicator.first().isVisible().catch(() => false);
      }
      return await this.gameStateReader.isHandInProgress(page);
    } catch {
      return false;
    }
  }

  private async isHeroTurn(page: Page): Promise<boolean> {
    try {
      return await this.gameStateReader.isHeroTurn(page);
    } catch {
      return false;
    }
  }

  // Poker Mavens does not expose a hand/turn id element on the page - handId
  // and turnId are identifiers the game loop tracks internally. These checks
  // only reject when the page *does* expose such an element and it disagrees;
  // when there's nothing to read (the normal case), they don't block, since
  // there's no independent value to verify against.
  private async verifyHandId(page: Page, expectedHandId: string): Promise<boolean> {
    try {
      const handIdElement = page.locator('[data-testid="hand-id"], .hand-id');
      if ((await handIdElement.count()) === 0) return true;
      const text = await handIdElement.textContent().catch(() => null);
      if (!text) return true;
      return text.trim() === expectedHandId;
    } catch {
      return true;
    }
  }

  private async verifyTurnId(page: Page, expectedTurnId: string): Promise<boolean> {
    try {
      const turnIdElement = page.locator('[data-testid="turn-id"], .turn-id');
      if ((await turnIdElement.count()) === 0) return true;
      const text = await turnIdElement.textContent().catch(() => null);
      if (!text) return true;
      return text.trim() === expectedTurnId;
    } catch {
      return true;
    }
  }

  private isActionAllowed(action: string): boolean {
    const ALLOWED_ACTIONS = ['fold', 'check', 'call', 'bet', 'raise', 'allIn'];
    return ALLOWED_ACTIONS.includes(action);
  }

  private async isAmountInRange(
    page: Page,
    action: string,
    amount: number,
  ): Promise<boolean> {
    if (action !== 'bet' && action !== 'raise') return true;

    try {
      const minRaise = page.locator('[data-testid="min-raise"], .min-raise');
      const maxRaise = page.locator('[data-testid="max-raise"], .max-raise');

      const minText = await minRaise.textContent().catch(() => null);
      const maxText = await maxRaise.textContent().catch(() => null);

      const min = minText ? parseFloat(minText.replace(/[^0-9.]/g, '')) : 0;
      const max = maxText ? parseFloat(maxText.replace(/[^0-9.]/g, '')) : Infinity;

      return amount >= min && amount <= max;
    } catch {
      return true;
    }
  }

  // Confirmed via a live screenshot + HTML capture of an active hand on
  // iqpoker88.com: the action bar is three fixed-position buttons whose
  // *class* is stable but whose *text* is contextual (e.g. commandbtn2 reads
  // "צ׳ק" when checking is free and "השוואה X" when there's a bet to call) -
  // so action selection must go by class, not by text.
  private static readonly ACTION_BUTTON_CLASS: Record<string, string> = {
    fold: '.commandbtn1',
    check: '.commandbtn2',
    call: '.commandbtn2',
    bet: '.commandbtn3',
    raise: '.commandbtn3',
    allIn: '.commandbtn4',
  };

  // Confirmed via a live capture: Poker Mavens shows a generic
  // "<msgtext><div class='ok'><button>אישור</button></div><div class='cancel'>
  // <button>ביטול</button></div>" confirmation dialog for actions like
  // folding when a check is actually free ("You can check here - are you
  // sure you want to fold?"). Left open (e.g. a genuine intended fold that
  // triggered it, or a leftover from a stale prior click), it sits on top of
  // the real action buttons and blocks every future click at the same
  // screen position with a 15s Playwright actionability timeout - confirmed
  // live via repeated "locator.click: Timeout 15000ms exceeded" errors that
  // traced back to exactly this dialog. Cancelling is always safe (it just
  // returns to the real action buttons for a fresh decision) except when the
  // action we're actually trying to take right now is the fold itself, in
  // which case confirming completes it.
  private async dismissConfirmDialog(page: Page, intendedAction: string): Promise<void> {
    try {
      // The page can carry many `.dialog` elements at once (empty templates
      // plus assorted popups) - `.first()` binds to whichever is first in
      // DOM order, which confirmed live is NOT reliably the one actually
      // open/visible right now. Scan every `.cancel button` match and act on
      // the one Playwright confirms visible, matching the pattern already
      // used elsewhere in this codebase for the same duplicate-template issue.
      const cancelLocator = page.locator('.dialog .cancel button');
      const count = await cancelLocator.count().catch(() => 0);
      let cancelButton = null;
      for (let i = 0; i < count; i++) {
        const candidate = cancelLocator.nth(i);
        if (await candidate.isVisible().catch(() => false)) {
          cancelButton = candidate;
          break;
        }
      }
      if (!cancelButton) return;

      if (intendedAction === 'fold') {
        console.log('[ActionExecutor] dismissConfirmDialog: confirming fold via open confirmation dialog');
        // The matching "ok" button lives in the same dialog as the visible
        // cancel button. `cancelButton` is the <button> itself (matched via
        // `.dialog .cancel button`), nested one level inside the `.cancel`
        // div that `.ok` is actually a sibling of - go up to that div first,
        // then to its preceding `.ok` sibling, then into its button.
        const okButton = cancelButton.locator('xpath=../preceding-sibling::div[contains(@class,"ok")]/button');
        await okButton.click().catch(() => {});
      } else {
        console.log('[ActionExecutor] dismissConfirmDialog: cancelling stale/unrelated confirmation dialog');
        await cancelButton.click().catch(() => {});
      }
      await page.waitForTimeout(300);
    } catch {
      // Best-effort - if this fails, the click attempt below still runs and
      // will surface its own (now at least attributable) timeout.
    }
  }

  private async executePokerAction(
    page: Page,
    action: string,
    amount?: number,
  ): Promise<boolean> {
    if (!page) return false;

    try {
      await this.dismissConfirmDialog(page, action);

      const buttonClass = ActionExecutorService.ACTION_BUTTON_CLASS[action];
      // Scoped strictly to the child <button>: the page also carries empty
      // `.commandbtnN` placeholder divs with no button inside, and a bare
      // class selector can bind to one of those instead of the real one.
      const actionButton = buttonClass
        ? page.locator(`${buttonClass} button`).first()
        : page.locator(`[data-testid="action-${action}"], .btn-${action}, button:has-text("${action}")`).first();

      if (amount !== undefined && (action === 'bet' || action === 'raise')) {
        // The raise amount lives in `.raiseinput input`, a slider-linked
        // text box positioned just left of the action buttons. Confirmed via
        // a live capture: `.raiseinput` (like the commandbtnN divs) has an
        // empty placeholder duplicate elsewhere in the DOM with no <input>
        // inside, so this selector structurally only matches the real one.
        // An earlier version tried to disambiguate via
        // `xpath=preceding::*[contains(@class,"commandbtn3")]`, assuming the
        // input came *after* commandbtn3 in DOM order - it's actually
        // *before* (confirmed live), so that filter never matched and every
        // raise/bet silently filled the wrong field (literally the first
        // `input[type=text]` on the whole page, e.g. a login field in an
        // unrelated background dialog) while the real raise box kept
        // whatever stale value the site had defaulted it to - explaining
        // live "Error"-labelled confirm buttons on raise.
        const amountInput = page.locator('.raiseinput input').first();
        const hasRaiseInput = (await amountInput.count().catch(() => 0)) > 0;
        const target = hasRaiseInput ? amountInput : page.locator('input[type="text"], input[type="number"]').first();
        await target.fill(amount.toString()).catch(() => {});

        // The fill() above is an extra async round-trip that widens the
        // window between GameLoop's pre-click isHeroTurn() check and this
        // actual click - confirmed live as the source of persistent 15s
        // "locator.click: Timeout" errors isolated specifically to
        // bet/raise (never fold/check/call, which don't fill anything
        // first): the turn had already ended by the time of the click,
        // so a real, permanently-gone button was waited on for nothing.
        // Re-check right here, in the narrowest possible window, and bail
        // fast instead of stalling - a failed raise otherwise gets no
        // action from us at all and can end in the site auto-folding the
        // hand on its own turn timer, which looks exactly like the bot
        // "decided" to fold a hand it actually meant to raise with.
        const stillHeroTurn = await this.gameStateReader.isHeroTurn(page).catch(() => true);
        if (!stillHeroTurn) {
          console.warn(`[ActionExecutor] turn expired while filling ${action} amount - aborting before click`);
          return false;
        }
      }

      // Bounded well under the page's global default (15s, from
      // PLAYWRIGHT_TIMEOUT_MS): the button can genuinely vanish (turn ended)
      // in the gap between the last freshness check above and this click -
      // confirmed live via a captured snapshot showing the real commandbtn3
      // button's own style with `display: none` moments after a passing
      // isHeroTurn() check. That gap can't be closed further from here (no
      // server-push hook into the site's own client), but its *cost* can be
      // bounded - failing in ~2s instead of waiting the full 15s to learn
      // the same thing lets the auto-sit-in recovery kick in much sooner.
      await actionButton.click({ timeout: 2000 });
      await page.waitForTimeout(500);

      // A fold click can itself trigger the same confirmation dialog (a
      // genuinely-intended fold while check happens to be free) - resolve it
      // immediately rather than reporting success while the site is still
      // waiting on an unconfirmed "are you sure?" prompt.
      await this.dismissConfirmDialog(page, action);

      return true;
    } catch (err) {
      console.error(`[ActionExecutor] Failed to execute ${action}:`, err);
      return false;
    }
  }

}
