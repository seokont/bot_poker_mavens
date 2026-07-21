import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export enum QueueName {
  BOT_LIFECYCLE = 'bot-lifecycle',
  BOT_TABLE = 'bot-table',
  BOT_ACTIONS = 'bot-actions',
  BOT_RECONNECT = 'bot-reconnect',
  BOT_EVENTS = 'bot-events',
  BOT_STATISTICS = 'bot-statistics',
}

export enum JobType {
  START_BOT = 'START_BOT',
  STOP_BOT = 'STOP_BOT',
  RESTART_BOT = 'RESTART_BOT',
  JOIN_TABLE = 'JOIN_TABLE',
  LEAVE_TABLE = 'LEAVE_TABLE',
  SIT_OUT = 'SIT_OUT',
  SIT_IN = 'SIT_IN',
  REBUY = 'REBUY',
  EXECUTE_ACTION = 'EXECUTE_ACTION',
  RECONNECT_BOT = 'RECONNECT_BOT',
  SYNC_TABLES = 'SYNC_TABLES',
  CALCULATE_STATISTICS = 'CALCULATE_STATISTICS',
  EMERGENCY_STOP_ALL = 'EMERGENCY_STOP_ALL',
}

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  timeout: 30000,
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};

@Injectable()
export class QueueService implements OnModuleDestroy {
  private queues: Map<QueueName, Queue> = new Map();
  private queueEvents: Map<QueueName, QueueEvents> = new Map();
  private workers: Worker[] = [];

  constructor(private redis: RedisService) {
    this.initializeQueues();
  }

  private initializeQueues() {
    const connection = { ...this.redis.options, maxRetriesPerRequest: null as (number | null) };

    Object.values(QueueName).forEach((name) => {
      const queue = new Queue(name, {
        connection,
        defaultJobOptions,
      });
      this.queues.set(name, queue);

      const events = new QueueEvents(name, {
        connection,
      });
      this.queueEvents.set(name, events);
    });
  }

  getQueue(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not found`);
    }
    return queue;
  }

  addWorker(name: QueueName, processor: (job: any) => Promise<void>) {
    const connection = { ...this.redis.options, maxRetriesPerRequest: null as (number | null) };
    const worker = new Worker(name, processor, {
      connection,
      concurrency: 5,
    });
    worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} in queue ${name} failed:`, err.message);
    });
    this.workers.push(worker);
    return worker;
  }

  async addJob(
    queueName: QueueName,
    jobType: JobType,
    data: Record<string, unknown>,
    jobId?: string,
  ) {
    const queue = this.getQueue(queueName);

    console.log(`[QueueService] addJob called: queue=${queueName}, type=${jobType}, botId=${data.botId}, dataKeys=${Object.keys(data).join(',')}`);

    // Also publish to simple Redis list for external workers (Playwright-based bot workers)
    // that read via BRPOP instead of BullMQ
    const workerMsg = JSON.stringify({
      type: jobType,
      botId: data.botId || null,
      login: data.login || null,
      password: data.password || null,
      tableId: data.tableId || null,
      buyIn: data.buyIn || null,
      amount: data.amount || null,
      handId: data.handId || null,
      turnId: data.turnId || null,
      action: data.action || null,
    });
    console.log(`[QueueService] Pushing to Redis list 'bot-commands': ${workerMsg.substring(0, 200)}`);

    try {
      const lpushResult = await this.redis.lpush('bot-commands', workerMsg);
      console.log(`[QueueService] Redis lpush result: ${lpushResult}`);
    } catch (err: any) {
      console.error(`[QueueService] Failed to relay to bot-commands queue:`, err.message);
    }

    const generatedJobId = jobId || `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log(`[QueueService] Adding BullMQ job: ${generatedJobId}`);

    return queue.add(jobType, data, {
      jobId: generatedJobId,
    });
  }

  async onModuleDestroy() {
    for (const worker of this.workers) {
      await worker.close();
    }
    for (const events of this.queueEvents.values()) {
      await events.close();
    }
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }
}
