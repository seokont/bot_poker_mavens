import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export interface ErrorRecord {
  botId: string;
  timestamp: string;
  message: string;
  stack?: string;
  url?: string;
  screenshotPath?: string;
  htmlSnapshotPath?: string;
  consoleErrors?: string[];
}

@Injectable()
export class ErrorHandler {
  private readonly storageBasePath: string;

  constructor(private readonly configService: ConfigService) {
    this.storageBasePath =
      this.configService.get<string>('ERROR_STORAGE_PATH', './storage/errors');
  }

  async handleError(
    botId: string,
    error: Error,
    page?: Page,
  ): Promise<ErrorRecord> {
    const timestamp = new Date().toISOString();
    const record: ErrorRecord = {
      botId,
      timestamp,
      message: error.message,
      stack: error.stack,
    };

    if (page) {
      try {
        const screenshotPath = await this.takeScreenshot(page, botId, timestamp);
        if (screenshotPath) {
          record.screenshotPath = screenshotPath;
        }
      } catch {
        console.warn('[ErrorHandler] Failed to take screenshot');
      }

      try {
        record.url = page.url();
      } catch {
        // page might be closed
      }

      try {
        const htmlPath = await this.saveHtmlSnapshot(page, botId, timestamp);
        if (htmlPath) {
          record.htmlSnapshotPath = htmlPath;
        }
      } catch {
        console.warn('[ErrorHandler] Failed to save HTML snapshot');
      }

      try {
        record.consoleErrors = await this.getConsoleErrors(page);
      } catch {
        // page might be closed
      }
    }

    await this.saveErrorRecord(botId, timestamp, record);

    console.error(
      `[ErrorHandler] Bot ${botId} error: ${error.message}`,
      { stack: error.stack, url: record.url },
    );

    await this.notifyBackend(record);

    return record;
  }

  cleanupOldErrors(maxAgeDays: number = 7): void {
    try {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

      if (!fs.existsSync(this.storageBasePath)) return;

      const botDirs = fs.readdirSync(this.storageBasePath);
      for (const botDir of botDirs) {
        const botPath = path.join(this.storageBasePath, botDir);
        if (!fs.statSync(botPath).isDirectory()) continue;

        const dateDirs = fs.readdirSync(botPath);
        for (const dateDir of dateDirs) {
          const datePath = path.join(botPath, dateDir);
          const dirTime = new Date(dateDir).getTime();

          if (!isNaN(dirTime) && dirTime < cutoff) {
            this.removeDirectoryRecursive(datePath);
            console.log(`[ErrorHandler] Cleaned up old errors: ${datePath}`);
          }
        }
      }
    } catch (err) {
      console.error('[ErrorHandler] Error during cleanup:', err);
    }
  }

  private async takeScreenshot(
    page: Page,
    botId: string,
    timestamp: string,
  ): Promise<string | null> {
    const dir = this.getErrorDir(botId, timestamp);
    const filename = `screenshot-${this.sanitizeTimestamp(timestamp)}.png`;
    const filePath = path.join(dir, filename);

    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: filePath, fullPage: true });

    return filePath;
  }

  private async saveHtmlSnapshot(
    page: Page,
    botId: string,
    timestamp: string,
  ): Promise<string | null> {
    const dir = this.getErrorDir(botId, timestamp);
    const filename = `snapshot-${this.sanitizeTimestamp(timestamp)}.html`;
    const filePath = path.join(dir, filename);

    const html = await page.content();

    const cleanedHtml = this.stripSecrets(html);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, cleanedHtml, 'utf-8');

    return filePath;
  }

  private async getConsoleErrors(page: Page): Promise<string[]> {
    try {
      const errors: string[] = [];

      page.on('pageerror', (err) => {
        errors.push(err.message);
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      return errors;
    } catch {
      return [];
    }
  }

  private async saveErrorRecord(
    botId: string,
    timestamp: string,
    record: ErrorRecord,
  ): Promise<void> {
    const dir = this.getErrorDir(botId, timestamp);
    const filename = `error-${this.sanitizeTimestamp(timestamp)}.json`;
    const filePath = path.join(dir, filename);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
  }

  private async notifyBackend(record: ErrorRecord): Promise<void> {
    try {
      const backendUrl = this.configService.get<string>(
        'BACKEND_URL',
        'http://localhost:3000',
      );

      await fetch(`${backendUrl}/internal/workers/error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: this.configService.get<string>('WORKER_ID', 'unknown'),
          botId: record.botId,
          message: record.message,
          stack: record.stack,
          url: record.url,
          timestamp: record.timestamp,
        }),
      });
    } catch (err) {
      console.error('[ErrorHandler] Failed to notify backend:', err);
    }
  }

  private getErrorDir(botId: string, timestamp: string): string {
    const date = timestamp.split('T')[0] ?? 'unknown';
    return path.join(this.storageBasePath, botId, date);
  }

  private sanitizeTimestamp(timestamp: string): string {
    return timestamp.replace(/[:.]/g, '-').replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  private stripSecrets(html: string): string {
    return html
      .replace(/password="[^"]*"/gi, 'password="[REDACTED]"')
      .replace(/token="[^"]*"/gi, 'token="[REDACTED]"')
      .replace(/secret="[^"]*"/gi, 'secret="[REDACTED]"')
      .replace(/authorization:\s*Bearer\s+\S+/gi, 'authorization: Bearer [REDACTED]');
  }

  private removeDirectoryRecursive(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          this.removeDirectoryRecursive(fullPath);
        } else {
          fs.unlinkSync(fullPath);
        }
      }
      fs.rmdirSync(dirPath);
    }
  }
}
