import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Browser, BrowserContext, chromium } from 'playwright';

@Injectable()
export class PlaywrightManager {
  private browsers: Map<string, Browser> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private botPageCount: Map<string, number> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Each bot gets its own Chromium process rather than sharing one browser
   * via separate contexts - full process isolation between bots (no shared
   * browser-level cache/network stack/fingerprint), at the cost of more
   * memory per bot.
   */
  async launchForBot(botId: string): Promise<Browser> {
    const existing = this.browsers.get(botId);
    if (existing) {
      return existing;
    }

    const headless = this.configService.get<string>('PLAYWRIGHT_HEADLESS', 'true') === 'true';

    const browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    this.browsers.set(botId, browser);
    console.log(`[PlaywrightManager] Browser launched for bot ${botId}`);
    return browser;
  }

  async getOrCreateContext(botId: string): Promise<BrowserContext> {
    const existing = this.contexts.get(botId);
    if (existing) {
      return existing;
    }

    const browser = await this.launchForBot(botId);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    this.contexts.set(botId, context);
    this.botPageCount.set(botId, 0);

    console.log(`[PlaywrightManager] Created context for bot ${botId}`);
    return context;
  }

  async createPage(botId: string) {
    const context = await this.getOrCreateContext(botId);
    const page = await context.newPage();
    this.botPageCount.set(botId, (this.botPageCount.get(botId) ?? 0) + 1);
    return page;
  }

  getContext(botId: string): BrowserContext | null {
    return this.contexts.get(botId) ?? null;
  }

  async closeContext(botId: string): Promise<void> {
    const context = this.contexts.get(botId);
    if (context) {
      await context.close();
      this.contexts.delete(botId);
      this.botPageCount.delete(botId);
      console.log(`[PlaywrightManager] Closed context for bot ${botId}`);
    }

    const browser = this.browsers.get(botId);
    if (browser) {
      await browser.close();
      this.browsers.delete(botId);
      console.log(`[PlaywrightManager] Browser closed for bot ${botId}`);
    }
  }

  async closeAll(): Promise<void> {
    for (const [botId] of this.contexts) {
      await this.closeContext(botId);
    }
    // In case any browser was launched without a matching context.
    for (const [botId] of this.browsers) {
      await this.closeContext(botId);
    }
  }

  enforceMaxBots(): boolean {
    const maxBots = parseInt(
      this.configService.get<string>('MAX_BOTS_PER_WORKER', '5'),
      10,
    );
    return this.browsers.size < maxBots;
  }

  activeBotsCount(): number {
    return this.browsers.size;
  }
}
