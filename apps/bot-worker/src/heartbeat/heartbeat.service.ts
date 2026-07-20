import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface HeartbeatPayload {
  workerId: string;
  botId: string;
  status: string;
  tableId?: string;
  handId?: string;
  lastActionAt?: string;
  memoryUsage: NodeJS.MemoryUsage;
  browserConnected: boolean;
}

@Injectable()
export class HeartbeatService implements OnModuleDestroy {
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private backendUrl: string;
  private workerId: string;

  constructor(private readonly configService: ConfigService) {
    this.backendUrl =
      this.configService.get<string>('BACKEND_URL', 'http://localhost:3000');
    this.workerId = this.configService.get<string>('WORKER_ID', 'unknown');
  }

  startHeartbeat(
    botId: string,
    status: string,
    getMetadata: () => {
      tableId?: string;
      handId?: string;
      lastActionAt?: string;
      browserConnected: boolean;
    },
  ): void {
    this.stopHeartbeat(botId);

    const intervalMs = parseInt(
      this.configService.get<string>('BOT_HEARTBEAT_INTERVAL_MS', '10000'),
      10,
    );

    const interval = setInterval(async () => {
      try {
        const metadata = getMetadata();
        const payload: HeartbeatPayload = {
          workerId: this.workerId,
          botId,
          status,
          tableId: metadata.tableId,
          handId: metadata.handId,
          lastActionAt: metadata.lastActionAt,
          memoryUsage: process.memoryUsage(),
          browserConnected: metadata.browserConnected,
        };

        await fetch(`${this.backendUrl}/api/v1/internal/workers/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error(`[Heartbeat] Failed to send heartbeat for bot ${botId}:`, err);
      }
    }, intervalMs);

    this.intervals.set(botId, interval);
  }

  stopHeartbeat(botId: string): void {
    const existing = this.intervals.get(botId);
    if (existing) {
      clearInterval(existing);
      this.intervals.delete(botId);
    }
  }

  onModuleDestroy(): void {
    for (const [botId] of this.intervals) {
      this.stopHeartbeat(botId);
    }
  }
}
