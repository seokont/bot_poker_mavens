import { Injectable } from '@nestjs/common';
import { Page } from 'playwright';
import {
  Card,
  CardRank,
  CardSuit,
  GameState as SharedGameState,
  TablePlayerState,
  AllowedAction,
  GameAction,
  ActionType,
  GameType,
  LimitType,
  Street as SharedStreet,
} from '@poker-bot/shared-types';
import { resolvePosition, resolveFoldedPlayers } from './state-derivation';

export interface GameState {
  holeCards: string[];
  boardCards: string[];
  potSize: number;
  heroStack: number;
  players: PlayerState[];
  street: Street;
  actionHistory: ActionEntry[];
  heroSeatIndex: number;
}

export interface PlayerState {
  name: string;
  stack: number;
  bet: number;
  cards?: string[];
  isHero: boolean;
  isActive: boolean;
  isDealer: boolean;
  seatIndex: number;
}

export interface ActionEntry {
  playerName: string;
  action: string;
  amount?: number;
  street?: Street;
}

export type Street = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'UNKNOWN';

export interface TableStakes {
  smallBlind: number;
  bigBlind: number;
  ante: number;
  gameType: string;
  limitType: string;
}

const ACTION_BUTTON_MAP: Record<string, ActionType> = {
  fold: ActionType.FOLD,
  check: ActionType.CHECK,
  call: ActionType.CALL,
  bet: ActionType.BET,
  raise: ActionType.RAISE,
  allIn: ActionType.ALL_IN,
};

@Injectable()
export class GameStateReader {
  /**
   * Poker Mavens' page keeps multiple copies of the same class around (empty
   * seat templates, off-screen/animation-staged elements with `display:none`
   * that still have real content inside) - `.first()` on a class selector
   * routinely binds to one of those instead of the one actually on screen.
   * Scan every match and return the first one Playwright confirms visible.
   */
  private async firstVisibleLocator(
    page: Page,
    selector: string,
  ): Promise<ReturnType<Page['locator']> | null> {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    return null;
  }

  async readGameState(
    page: Page,
    _botId: string,
    _tableId: string,
  ): Promise<GameState> {
    const holeCards = await this.readHoleCards(page);
    const boardCards = await this.readBoardCards(page);
    const potSize = await this.readPotSize(page);
    const heroStack = await this.readHeroStack(page);
    const players = await this.readPlayers(page);
    const street = await this.readStreet(page);
    const actionHistory = await this.readActionHistory(page);
    const heroSeatIndex = await this.readHeroSeatIndex(page);

    return {
      holeCards,
      boardCards,
      potSize,
      heroStack,
      players,
      street,
      actionHistory,
      heroSeatIndex,
    };
  }

  /**
   * Whether a hand currently appears to be in progress (hero has hole cards, or
   * there is money in the pot). Used by the game loop to detect when a new hand
   * has started while the bot is idle at the table.
   */
  async isHandInProgress(page: Page): Promise<boolean> {
    try {
      // Confirmed via a live hand capture on iqpoker88.com: the action bar
      // (.commandbtn1 = fold) only renders during an active hand, whether or
      // not it's currently the hero's turn to use it, and .totalplate is the
      // pot display container - both are strong, verified in-hand signals.
      // Scoped to the child <button> specifically: the page also carries an
      // empty `.commandbtn1` placeholder div with no button inside, and
      // `.first()` on the bare class can bind to that instead of the real,
      // populated one.
      const actionBar = await this.firstVisibleLocator(page, '.commandbtn1 button');
      if (actionBar) return true;

      const holeCards = await this.readHoleCards(page);
      if (holeCards.length > 0) return true;

      const pot = await this.readPotSize(page);
      if (pot > 0) return true;

      const anyVisibleCard = await this.firstVisibleLocator(page, '.card, .seatplate .card');
      if (anyVisibleCard) return true;

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Diagnostic-only: reports how many elements each detection selector
   * currently matches on the page, plus a raw snapshot of likely candidate
   * elements. Used to tune the (currently unverified) selectors against a
   * real Poker Mavens skin without needing to inspect the browser directly.
   */
  async debugSnapshot(page: Page): Promise<Record<string, unknown>> {
    const count = async (selector: string) => {
      try {
        return await page.locator(selector).count();
      } catch {
        return -1;
      }
    };

    const [heroCards, boardCards, pot, heroStack, players, heroTurn, actionLog] =
      await Promise.all([
        count('[data-testid="hero-cards"] .card, .hero-cards .card, .hole-card'),
        count('[data-testid="board-cards"] .card, .board-cards .card, .community-card'),
        count('[data-testid="pot-size"], .pot-size, .pot-amount'),
        count('[data-testid="hero-stack"], .hero-stack, .my-stack'),
        count('[data-testid="player"], .player-seat, .seat'),
        count('[data-testid="hero-turn"], .hero-turn-indicator, .my-turn'),
        count('[data-testid="action-log"] .action-entry, .action-history .action-entry, .action-log li'),
      ]);

    const domHints = await page
      .evaluate(() => {
        const doc = (globalThis as any).document;
        const classNames = new Set<string>();
        doc.querySelectorAll('[class*="card"],[class*="pot"],[class*="seat"],[class*="turn"],[class*="stack"],[class*="hand"]')
          .forEach((el: any) => {
            String(el.className || '')
              .split(/\s+/)
              .filter(Boolean)
              .forEach((c: string) => classNames.add(c));
          });
        return Array.from(classNames).slice(0, 60);
      })
      .catch(() => []);

    const seatplateHtml = await page
      .evaluate(() => {
        const doc = (globalThis as any).document;
        const els = Array.from(doc.querySelectorAll('.seatplate, .sp_seat, .chipstack')).slice(0, 4);
        return els.map((el: any) => (el.outerHTML || '').slice(0, 500));
      })
      .catch(() => []);

    return {
      selectorCounts: { heroCards, boardCards, pot, heroStack, players, heroTurn, actionLog },
      candidateClassNames: domHints,
      seatplateHtml,
      url: page.url(),
    };
  }

  /**
   * Builds a full decision-engine-ready GameState (the shape consumed by
   * @poker-bot/poker-engine) from the current page. handId/turnId are supplied
   * by the caller (the game loop tracks them internally rather than trying to
   * read an id from the page, since Poker Mavens does not expose one).
   */
  async readForDecision(
    page: Page,
    botId: string,
    tableId: string,
    handId: string,
    turnId: string,
    stakes: TableStakes,
  ): Promise<SharedGameState> {
    const holeCardCount = stakes.gameType?.toUpperCase().startsWith('PLO') || stakes.gameType?.toUpperCase() === 'OMAHA' ? 4 : 2;
    const [rawHole, rawBoard, potRaw, heroStackRaw, rawPlayers, streetLabel, rawHistory, heroSeatIndex, allowedActions, amountToCall] =
      await Promise.all([
        this.readHoleCards(page, holeCardCount),
        this.readBoardCards(page),
        this.readPotSize(page),
        this.readHeroStack(page),
        this.readPlayers(page),
        this.readStreet(page),
        this.readActionHistory(page),
        this.readHeroSeatIndex(page),
        this.readAllowedActions(page),
        this.readAmountToCall(page),
      ]);

    const holeCards = this.parseCards(rawHole);
    const boardCards = this.parseCards(rawBoard);
    const street = this.resolveStreet(streetLabel, boardCards.length);

    const foldedPlayerNames = resolveFoldedPlayers(rawHistory);

    // resolvePosition needs the count of seats actually in the hand, not the
    // physical table size - empty seats read by readPlayers() come back with
    // a placeholder name and stack: 0, so a seat only counts as occupied if
    // it has chips behind it or it's the hero's own seat (whose stack can
    // legitimately read as 0 during some read timings).
    const occupiedPlayers = rawPlayers.filter((p) => p.stack > 0 || p.isHero);

    const players: TablePlayerState[] = rawPlayers.map((p) => ({
      playerId: `seat-${p.seatIndex}`,
      playerName: p.name,
      seatNumber: p.seatIndex,
      stack: p.stack,
      currentBet: p.bet,
      isHero: p.isHero,
      isDealer: p.isDealer,
      hasFolded: foldedPlayerNames.has(p.name),
      isAllIn: false,
    }));

    const raiseAction = allowedActions.find(
      (a) => a.action === ActionType.RAISE || a.action === ActionType.BET,
    );

    const actionHistory: GameAction[] = rawHistory.map((h, i) => ({
      playerId: h.playerName,
      playerName: h.playerName,
      action: this.mapHistoryAction(h.action),
      amount: h.amount ?? 0,
      street,
      sequence: i,
      timestamp: new Date().toISOString(),
    }));

    return {
      botId,
      tableId,
      handId,
      turnId,
      gameType: this.resolveGameType(stakes.gameType),
      limitType: this.resolveLimitType(stakes.limitType),
      street,
      seatNumber: heroSeatIndex >= 0 ? heroSeatIndex : 0,
      position: resolvePosition(occupiedPlayers, heroSeatIndex),
      playerCount: players.length,
      activePlayerCount: players.filter((p) => !p.hasFolded).length,
      holeCards,
      boardCards,
      smallBlind: stakes.smallBlind,
      bigBlind: stakes.bigBlind,
      ante: stakes.ante,
      heroStack: heroStackRaw,
      effectiveStack: heroStackRaw,
      pot: potRaw,
      mainPot: potRaw,
      sidePots: [],
      amountToCall,
      minBet: stakes.bigBlind,
      minRaiseTo: raiseAction?.minAmount ?? stakes.bigBlind * 2,
      maxRaiseTo: raiseAction?.maxAmount ?? heroStackRaw,
      allowedActions,
      players,
      actionHistory,
      actionDeadlineAt: null,
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * Reads which action buttons are currently visible + enabled, mapped to the
   * shared ActionType enum, with min/max amounts for bet/raise where available.
   */
  async readAllowedActions(page: Page): Promise<AllowedAction[]> {
    const results: AllowedAction[] = [];

    // Confirmed via a live hand capture: the three action-bar buttons are
    // fixed by class (commandbtn1=fold, commandbtn2=check-or-call,
    // commandbtn3=bet-or-raise); commandbtn2/3's *text* is contextual, so
    // it's read to disambiguate check vs. call and bet vs. raise.
    try {
      const foldBtn = page.locator('.commandbtn1 button').first();
      if (await foldBtn.isVisible().catch(() => false)) {
        results.push({ action: ActionType.FOLD });
      }
    } catch {
      // skip
    }

    try {
      const checkCallBtn = page.locator('.commandbtn2 button').first();
      if (await checkCallBtn.isVisible().catch(() => false)) {
        const text = (await checkCallBtn.textContent().catch(() => '')) ?? '';
        const isCall = /\d/.test(text) || text.includes('השוואה');
        results.push({ action: isCall ? ActionType.CALL : ActionType.CHECK });
      }
    } catch {
      // skip
    }

    try {
      const betRaiseBtn = page.locator('.commandbtn3 button').first();
      if (await betRaiseBtn.isVisible().catch(() => false)) {
        const text = (await betRaiseBtn.textContent().catch(() => '')) ?? '';
        const isRaise = text.includes('העלאה');
        const allowed: AllowedAction = { action: isRaise ? ActionType.RAISE : ActionType.BET };
        const amountMatch = text.match(/(\d+)/);
        if (amountMatch) {
          allowed.minAmount = parseFloat(amountMatch[1]);
        }
        results.push(allowed);
      }
    } catch {
      // skip
    }

    try {
      const allInBtn = page.locator('.commandbtn4 button').first();
      if (await allInBtn.isVisible().catch(() => false)) {
        results.push({ action: ActionType.ALL_IN });
      }
    } catch {
      // skip
    }

    if (results.length > 0) return results;

    // Fallback for skins where the confirmed classes don't apply.
    for (const [key, actionType] of Object.entries(ACTION_BUTTON_MAP)) {
      try {
        const btn = page
          .locator(`[data-testid="action-${key}"], .btn-${key}, button:has-text("${key}")`)
          .first();
        const visible = await btn.isVisible().catch(() => false);
        if (!visible) continue;
        const enabled = await btn.isEnabled().catch(() => false);
        if (!enabled) continue;

        results.push({ action: actionType });
      } catch {
        // selector didn't resolve on this skin; skip this action
      }
    }

    return results;
  }

  async getAllowedActions(page: Page): Promise<string[]> {
    try {
      const actionButtons = page.locator(
        '[data-testid^="action-"], button.btn-action, .poker-action-btn',
      );
      const count = await actionButtons.count();
      const actions: string[] = [];

      for (let i = 0; i < count; i++) {
        const btn = actionButtons.nth(i);
        const isVisible = await btn.isVisible().catch(() => false);
        const isEnabled = await btn.isEnabled().catch(() => false);

        if (isVisible && isEnabled) {
          const text = (await btn.textContent())?.trim().toLowerCase() ?? '';
          if (text) actions.push(text);
        }
      }

      return actions;
    } catch {
      return [];
    }
  }

  async isHeroTurn(page: Page): Promise<boolean> {
    try {
      // Confirmed via a live hand capture: standard poker-client convention
      // holds here too - the action bar (.commandbtn1 fold / .commandbtn2
      // check-or-call / .commandbtn3 bet-or-raise) only renders while it's
      // actually the hero's turn to act.
      const foldButton = await this.firstVisibleLocator(page, '.commandbtn1 button');
      if (foldButton) return true;

      const turnIndicator = page.locator(
        '[data-testid="hero-turn"], .hero-turn-indicator, .my-turn',
      );
      return await turnIndicator.isVisible().catch(() => false);
    } catch {
      return false;
    }
  }

  /**
   * Detects the "sitting out" state (confirmed live: hero's seat shows
   * "יושב בחוץ" and the only available action is a "מוכן" (Ready) button).
   * Table-wide signals like isHandInProgress()/pot/cards stay true while
   * OTHER seated players keep playing, so a sitting-out hero can otherwise
   * get stuck spinning in IN_HAND with isHeroTurn() perpetually false
   * forever - this needs its own explicit, narrow check (just the one
   * button that ONLY appears in this state) so the loop can click through
   * it and resume actually playing hands.
   */
  async isSittingOut(page: Page): Promise<boolean> {
    try {
      return await this.firstVisibleLocator(page, 'button:has-text("מוכן")').then((el) => el !== null);
    } catch {
      return false;
    }
  }

  private async readAmountToCall(page: Page): Promise<number> {
    try {
      // Confirmed via a live hand capture: the check/call button is
      // `.commandbtn2 button`; when a call is owed, its text reads
      // "השוואה X" (Call X) with the amount embedded.
      const callBtn = page.locator('.commandbtn2 button').first();
      const text = await callBtn.textContent().catch(() => null);
      if (text) {
        const cleaned = text.replace(/[^0-9.]/g, '');
        if (cleaned) return parseFloat(cleaned) || 0;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private parseCards(raw: string[]): Card[] {
    const cards: Card[] = [];
    for (const value of raw) {
      const card = this.parseCard(value);
      if (card) cards.push(card);
    }
    return cards;
  }

  private parseCard(raw: string): Card | null {
    if (!raw || raw.length < 2) return null;
    const rankChar = raw[0].toUpperCase();
    const suitChar = raw[raw.length - 1].toLowerCase();

    const rank = (Object.values(CardRank) as string[]).includes(rankChar)
      ? (rankChar as CardRank)
      : null;
    const suit = (Object.values(CardSuit) as string[]).includes(suitChar)
      ? (suitChar as CardSuit)
      : null;

    if (!rank || !suit) return null;
    return { rank, suit };
  }

  private mapHistoryAction(raw: string): ActionType {
    const key = raw.toLowerCase();
    if (key.includes('fold')) return ActionType.FOLD;
    if (key.includes('check')) return ActionType.CHECK;
    if (key.includes('call')) return ActionType.CALL;
    if (key.includes('raise')) return ActionType.RAISE;
    if (key.includes('bet')) return ActionType.BET;
    if (key.includes('all')) return ActionType.ALL_IN;
    return ActionType.CHECK;
  }

  private resolveStreet(label: Street, boardCardCount: number): SharedStreet {
    // Board card count is a hard poker-rules invariant (0/3/4/5 cards map
    // exactly to PREFLOP/FLOP/TURN/RIVER) and is far more trustworthy than
    // the DOM street label - those selectors (`.street-label`/`.round-label`
    // etc) were never confirmed against this site's real markup, unlike the
    // other confirmed selectors used elsewhere in this file. Live logs
    // showed hands with a visibly dealt flop still reporting label=PREFLOP,
    // which made the bot use preflop-only decision logic against a real
    // postflop bet - a genuine misplay risk with real money on the table.
    // Board count now wins whenever it implies cards are on the table; a
    // count of 1 or 2 is impossible in real poker (only happens when the
    // board reader undercounts a flop/turn/river by one or more cards), so
    // it's still treated as at least FLOP - reasoning about an incomplete
    // board is safer than ignoring the board's existence entirely.
    if (boardCardCount >= 5) return SharedStreet.RIVER;
    if (boardCardCount === 4) return SharedStreet.TURN;
    if (boardCardCount >= 1) return SharedStreet.FLOP;

    switch (label) {
      case 'PREFLOP':
        return SharedStreet.PREFLOP;
      case 'FLOP':
        return SharedStreet.FLOP;
      case 'TURN':
        return SharedStreet.TURN;
      case 'RIVER':
        return SharedStreet.RIVER;
      case 'SHOWDOWN':
        return SharedStreet.RIVER;
      default:
        return SharedStreet.PREFLOP;
    }
  }

  private resolveGameType(value: string): GameType {
    if ((Object.values(GameType) as string[]).includes(value)) {
      return value as GameType;
    }
    // The DB/site store the generic table label "PLO" (not the specific
    // PLO4/PLO5/PLO6 the enum distinguishes) - standard Omaha is 4-card,
    // which also matches holeCardCount's PLO branch in readForDecision.
    const upper = value.toUpperCase();
    if (upper === 'PLO' || upper === 'OMAHA') return GameType.PLO4;
    return GameType.NLH;
  }

  private resolveLimitType(value: string): LimitType {
    return (Object.values(LimitType) as string[]).includes(value)
      ? (value as LimitType)
      : LimitType.NL;
  }

  // Confirmed via a live capture plus the actual `Cards1` sprite sheet PNG
  // fetched directly from the site: card faces render as `.card` divs whose
  // `background-position` selects a 46px-wide cell from a single-row, 53-
  // cell sprite (52 cards + 1 face-down back at index 52 / -2392px). Cells
  // are grouped by rank (2..A, 13 groups of 4), with the 4 suits within
  // each group ordered [Diamonds, Clubs, Hearts, Spades]. Verified against
  // two independent live data points (J♥ at -1748px = index 38, 3♣ at
  // -230px = index 5) - both matched `index = rank*4 + suit` exactly.
  private static readonly CARD_SPRITE_WIDTH = 46;
  private static readonly CARD_SPRITE_RANK_ORDER: string[] = [
    '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A',
  ];
  private static readonly CARD_SPRITE_SUIT_ORDER: string[] = ['d', 'c', 'h', 's'];

  private cardFromSpriteOffset(offsetPx: number): string | null {
    if (!Number.isFinite(offsetPx)) return null;
    const index = Math.round(-offsetPx / GameStateReader.CARD_SPRITE_WIDTH);
    if (index < 0 || index >= 52) return null; // 52 = face-down back
    const rank = GameStateReader.CARD_SPRITE_RANK_ORDER[Math.floor(index / 4)];
    const suit = GameStateReader.CARD_SPRITE_SUIT_ORDER[index % 4];
    if (!rank || !suit) return null;
    return `${rank}${suit}`;
  }

  private async readHoleCards(page: Page, maxCards: number = 2): Promise<string[]> {
    try {
      const ownLoginMatch = page.url().match(/LoginName=([^&]+)/i);
      const ownLogin = ownLoginMatch ? decodeURIComponent(ownLoginMatch[1]) : null;
      if (!ownLogin) return [];

      // Poker Mavens absolutely-positions each seat/card container via an
      // inline `left`/`top` style - walk up from a known reference element
      // (here, hero's own `.sp_name`) to find it, then take the N visible
      // (non-face-down) `.card` elements closest to that point as hero's
      // hole cards (N=2 for hold'em, N=4 for Omaha - the site deals more
      // cards but the "closest to hero" logic is otherwise identical).
      // There's no semantic "hero-cards" wrapper to key off.
      const offsets: number[] = await page.evaluate((args: { login: string; maxCards: number }) => {
        const { login, maxCards } = args;
        const doc = (globalThis as any).document;
        const findPosition = (start: any): { left: number | null; top: number | null } => {
          let el: any = start;
          let left: number | null = null;
          let top: number | null = null;
          while (el && (left === null || top === null)) {
            const style = el.getAttribute ? el.getAttribute('style') || '' : '';
            const lm = style.match(/left:\s*(-?\d+(?:\.\d+)?)px/);
            const tm = style.match(/top:\s*(-?\d+(?:\.\d+)?)px/);
            if (lm && left === null) left = parseFloat(lm[1]);
            if (tm && top === null) top = parseFloat(tm[1]);
            el = el.parentElement;
          }
          return { left, top };
        };

        let heroX: number | null = null;
        let heroY: number | null = null;
        const nameEls = doc.querySelectorAll('.sp_name');
        for (const nameEl of nameEls) {
          if ((nameEl.textContent || '').trim() !== login) continue;
          // .sp_name itself carries a fixed *local* offset (e.g. "top: 2px;
          // left: 38px") that's identical across every seat - it's the name
          // label's position inside the seatplate box, not the seatplate's
          // position on the table. findPosition would latch onto that and
          // stop immediately, making every seat resolve to the same point.
          // The real absolute position lives 2 levels up, on the seatplate
          // wrapper (wrapper > .sp_seat > .sp_name).
          const seatWrapper =
            nameEl.parentElement && nameEl.parentElement.parentElement
              ? nameEl.parentElement.parentElement
              : nameEl;
          const pos = findPosition(seatWrapper);
          heroX = pos.left;
          heroY = pos.top;
          break;
        }
        if (heroX === null || heroY === null) return [];

        const candidates: { posX: number; dist: number }[] = [];
        const cardEls = doc.querySelectorAll('.card');
        for (const el of cardEls) {
          if (el.offsetParent === null) continue;
          const style = el.getAttribute('style') || '';
          const posMatch = style.match(/background-position:\s*(-?\d+)px/);
          if (!posMatch) continue;
          const posX = parseInt(posMatch[1], 10);
          if (posX === -2392) continue; // face-down back
          const pos = findPosition(el);
          if (pos.left === null || pos.top === null) continue;
          const dist = Math.hypot(pos.left - (heroX as number), pos.top - (heroY as number));
          candidates.push({ posX, dist });
        }
        candidates.sort((a, b) => a.dist - b.dist);
        return candidates.slice(0, maxCards).map((c) => c.posX);
      }, { login: ownLogin, maxCards }).catch(() => []);

      return offsets
        .map((o) => this.cardFromSpriteOffset(o))
        .filter((c): c is string => c !== null);
    } catch {
      return [];
    }
  }

  private async readBoardCards(page: Page): Promise<string[]> {
    try {
      const ownLoginMatch = page.url().match(/LoginName=([^&]+)/i);
      const ownLogin = ownLoginMatch ? decodeURIComponent(ownLoginMatch[1]) : null;

      // Board cards cluster tightly around the pot display (`.totalplate`,
      // table center); use distance from it rather than from any seat to
      // pick them out from hole cards. As a belt-and-suspenders check, also
      // exclude hero's own hole-card values explicitly - a card can only
      // exist once in the deck, so if it's in hero's hand it can't also be
      // on the board, regardless of how the `.totalplate` distance-based
      // classification happens to score it.
      const offsets: number[] = await page.evaluate((login: string | null) => {
        const doc = (globalThis as any).document;
        const findPosition = (start: any): { left: number | null; top: number | null } => {
          let el: any = start;
          let left: number | null = null;
          let top: number | null = null;
          while (el && (left === null || top === null)) {
            const style = el.getAttribute ? el.getAttribute('style') || '' : '';
            const lm = style.match(/left:\s*(-?\d+(?:\.\d+)?)px/);
            const tm = style.match(/top:\s*(-?\d+(?:\.\d+)?)px/);
            if (lm && left === null) left = parseFloat(lm[1]);
            if (tm && top === null) top = parseFloat(tm[1]);
            el = el.parentElement;
          }
          return { left, top };
        };

        let heroX: number | null = null;
        let heroY: number | null = null;
        if (login) {
          const nameEls = doc.querySelectorAll('.sp_name');
          for (const nameEl of nameEls) {
            if ((nameEl.textContent || '').trim() !== login) continue;
            const seatWrapper =
              nameEl.parentElement && nameEl.parentElement.parentElement
                ? nameEl.parentElement.parentElement
                : nameEl;
            const pos = findPosition(seatWrapper);
            heroX = pos.left;
            heroY = pos.top;
            break;
          }
        }

        // Hero's own hole-card sprite values, found the same way
        // readHoleCards() does (closest-to-hero-seat), so board candidates
        // can be excluded by exact card *value* rather than by distance to
        // hero's seat. The distance-based heroDist check this replaced was
        // seat-geometry-dependent - confirmed live, a genuine board card
        // (e.g. Qs on the flop) came out CLOSER to a particular seat's
        // anchor point than to the pot for that seat specifically, silently
        // dropping it from that one bot's board read while other bots at
        // the same table read the board correctly. A card can only exist
        // once in the deck, so matching hero's already-identified hole
        // cards by value has no such seat-dependent failure mode.
        const heroCardPosXs = new Set<number>();
        if (heroX !== null && heroY !== null) {
          const heroCandidates: { posX: number; dist: number }[] = [];
          const allCardEls = doc.querySelectorAll('.card');
          for (const el of allCardEls) {
            if (el.offsetParent === null) continue;
            const style = el.getAttribute('style') || '';
            const posMatch = style.match(/background-position:\s*(-?\d+)px/);
            if (!posMatch) continue;
            const posX = parseInt(posMatch[1], 10);
            if (posX === -2392) continue;
            const pos = findPosition(el);
            if (pos.left === null || pos.top === null) continue;
            const dist = Math.hypot(pos.left - heroX, pos.top - heroY);
            heroCandidates.push({ posX, dist });
          }
          heroCandidates.sort((a, b) => a.dist - b.dist);
          // Up to 4 covers Omaha; hold'em hero reads will just have 2 real
          // matches and 2 harmless extra (non-hero, non-matching) entries.
          heroCandidates.slice(0, 4).forEach((c) => heroCardPosXs.add(c.posX));
        }

        let potX: number | null = null;
        let potY: number | null = null;
        const plates = doc.querySelectorAll('.totalplate');
        for (const plate of plates) {
          if (plate.offsetParent === null) continue;
          const pos = findPosition(plate);
          if (pos.left !== null) potX = pos.left;
          if (pos.top !== null) potY = pos.top;
          if (potX !== null && potY !== null) break;
        }
        if (potX === null || potY === null) return [];

        const candidates: { posX: number; dist: number }[] = [];
        const cardEls = doc.querySelectorAll('.card');
        for (const el of cardEls) {
          if (el.offsetParent === null) continue;
          const style = el.getAttribute('style') || '';
          const posMatch = style.match(/background-position:\s*(-?\d+)px/);
          if (!posMatch) continue;
          const posX = parseInt(posMatch[1], 10);
          if (posX === -2392) continue;
          if (heroCardPosXs.has(posX)) continue;
          const pos = findPosition(el);
          if (pos.left === null || pos.top === null) continue;
          const dist = Math.hypot(pos.left - (potX as number), pos.top - (potY as number));
          candidates.push({ posX, dist });
        }
        candidates.sort((a, b) => a.dist - b.dist);
        return candidates
          // The board row sits ~170-190px from `.totalplate` on this
          // table's layout (confirmed from a live turn capture: pot at
          // (307,8), board cards at top:178, left:229/278/327/376), so 150
          // was cutting off every real board card; 220 gives margin for a
          // 5-card river row too.
          .filter((c) => c.dist < 220)
          .slice(0, 5)
          .map((c) => c.posX);
      }, ownLogin).catch(() => []);

      return offsets
        .map((o) => this.cardFromSpriteOffset(o))
        .filter((c): c is string => c !== null);
    } catch {
      return [];
    }
  }

  async readPotSize(page: Page): Promise<number> {
    try {
      // Confirmed via a live hand capture: the pot display renders as
      // `.totalplate` with text "סה״כ<br>40" (Total / 40) - no semantic
      // "pot" class exists on this skin. There are multiple `.totalplate`
      // elements on the page (an empty pre-hand template plus the live
      // one) - `.first()` isn't reliably the one with actual pot text, so
      // scan all matches for the first one that parses to a real number.
      const potElements = page.locator(
        '.totalplate, [data-testid="pot-size"], .pot-size, .pot-amount',
      );
      const count = await potElements.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const text = await potElements.nth(i).textContent().catch(() => null);
        if (!text) continue;
        const cleaned = text.replace(/[^0-9.]/g, '');
        const value = parseFloat(cleaned);
        if (!Number.isNaN(value) && value > 0) return value;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  async readHeroStack(page: Page): Promise<number> {
    try {
      const ownLoginMatch = page.url().match(/LoginName=([^&]+)/i);
      const ownLogin = ownLoginMatch ? decodeURIComponent(ownLoginMatch[1]) : null;
      if (!ownLogin) return 0;

      // Hero's stack is the plain-text content of `.sp_info`, a sibling of
      // `.sp_name` within the same `.sp_seat` wrapper (confirmed from a
      // live seatplate capture: <div class="sp_name">bot_1</div><div
      // class="sp_info">1000</div>).
      return await page.evaluate((login: string) => {
        const doc = (globalThis as any).document;
        const nameEls = doc.querySelectorAll('.sp_name');
        for (const nameEl of nameEls) {
          if ((nameEl.textContent || '').trim() !== login) continue;
          const seat = nameEl.parentElement;
          const infoEl = seat ? seat.querySelector('.sp_info') : null;
          if (!infoEl) continue;
          const cleaned = (infoEl.textContent || '').replace(/[^0-9.]/g, '');
          const value = parseFloat(cleaned);
          if (!isNaN(value)) return value;
        }
        return 0;
      }, ownLogin).catch(() => 0);
    } catch {
      return 0;
    }
  }

  /**
   * Real hand number as shown in the table's `.infobar` toolbar (e.g.
   * "יד #399-1" -> "399-1"). Used as PokerHand.externalHandId so multiple
   * bots at the same table converge on the same DB row for a given hand.
   */
  async readHandNumber(page: Page): Promise<string | null> {
    try {
      const infobar = await this.firstVisibleLocator(page, '.infobar');
      if (!infobar) return null;
      const text = await infobar.textContent().catch(() => null);
      if (!text) return null;
      const match = text.match(/#(\d+-\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private async readPlayers(page: Page): Promise<PlayerState[]> {
    try {
      const playerElements = page.locator(
        '[data-testid="player"], .player-seat, .seat',
      );
      const count = await playerElements.count();
      const players: PlayerState[] = [];

      for (let i = 0; i < count; i++) {
        const player = playerElements.nth(i);
        const name =
          (await player
            .locator('[data-testid="player-name"], .player-name')
            .textContent()
            .catch(() => null)) ?? `Player ${i}`;
        const stackText =
          (await player
            .locator('[data-testid="player-stack"], .player-stack')
            .textContent()
            .catch(() => null)) ?? '0';
        const betText =
          (await player
            .locator('[data-testid="player-bet"], .player-bet')
            .textContent()
            .catch(() => null)) ?? '0';
        const isHero =
          (await player
            .locator('[data-testid="hero-indicator"], .hero-indicator, .is-me')
            .isVisible()
            .catch(() => false)) ?? false;
        const isActive =
          (await player
            .locator('[data-testid="active-indicator"], .active-indicator')
            .isVisible()
            .catch(() => false)) ?? false;
        const isDealer =
          (await player
            .locator('[data-testid="dealer-indicator"], .dealer-indicator, .dealer-chip')
            .isVisible()
            .catch(() => false)) ?? false;

        players.push({
          name,
          stack: parseFloat(stackText.replace(/[^0-9.]/g, '')) || 0,
          bet: parseFloat(betText.replace(/[^0-9.]/g, '')) || 0,
          isHero,
          isActive,
          isDealer,
          seatIndex: i,
        });
      }

      return players;
    } catch {
      return [];
    }
  }

  private async readStreet(page: Page): Promise<Street> {
    try {
      const streetElement = page.locator(
        '[data-testid="street"], .street-label, .round-label',
      );
      const text = (await streetElement.textContent().catch(() => null)) ?? '';

      const upper = text.toUpperCase().trim();
      if (upper.includes('PREFLOP') || upper.includes('PRE-FLOP')) return 'PREFLOP';
      if (upper.includes('FLOP')) return 'FLOP';
      if (upper.includes('TURN')) return 'TURN';
      if (upper.includes('RIVER')) return 'RIVER';
      if (upper.includes('SHOWDOWN')) return 'SHOWDOWN';

      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  private async readActionHistory(page: Page): Promise<ActionEntry[]> {
    try {
      const actionElements = page.locator(
        '[data-testid="action-log"] .action-entry, .action-history .action-entry, .action-log li',
      );
      const count = await actionElements.count();
      const history: ActionEntry[] = [];

      for (let i = 0; i < count; i++) {
        const entry = actionElements.nth(i);
        const text = (await entry.textContent().catch(() => null)) ?? '';
        const parts = text.split(':');

        if (parts.length >= 2) {
          history.push({
            playerName: parts[0].trim(),
            action: parts[1].trim().split(' ')[0]?.toLowerCase() ?? 'unknown',
            amount: undefined,
          });
        }
      }

      return history;
    } catch {
      return [];
    }
  }

  private async readHeroSeatIndex(page: Page): Promise<number> {
    try {
      const players = await this.readPlayers(page);
      const hero = players.find((p) => p.isHero);
      return hero?.seatIndex ?? -1;
    } catch {
      return -1;
    }
  }
}
