import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';

export interface LoadInfo {
  activeBots: number;
  cpuUsage: number;
  memoryUsage: number;
  percentOfMax: number;
}

@Injectable()
export class ResourceManager {
  private readonly maxBotsPerWorker: number;
  private readonly maxCpuPercent: number;
  private readonly maxMemoryPercent: number;
  private activeBots = 0;
  private cpuUsageHistory: number[] = [];

  constructor(private readonly configService: ConfigService) {
    this.maxBotsPerWorker = parseInt(
      this.configService.get<string>('MAX_BOTS_PER_WORKER', '5'),
      10,
    );
    this.maxCpuPercent = parseFloat(
      this.configService.get<string>('MAX_CPU_PERCENT', '80'),
    );
    this.maxMemoryPercent = parseFloat(
      this.configService.get<string>('MAX_MEMORY_PERCENT', '80'),
    );
  }

  canStartNewBot(): boolean {
    if (this.activeBots >= this.maxBotsPerWorker) {
      return false;
    }

    const cpuUsage = this.getCpuUsage();
    if (cpuUsage > this.maxCpuPercent) {
      console.warn(
        `[ResourceManager] CPU usage ${cpuUsage}% exceeds max ${this.maxCpuPercent}%`,
      );
      return false;
    }

    const memoryUsage = this.getMemoryUsagePercent();
    if (memoryUsage > this.maxMemoryPercent) {
      console.warn(
        `[ResourceManager] Memory usage ${memoryUsage}% exceeds max ${this.maxMemoryPercent}%`,
      );
      return false;
    }

    return true;
  }

  getCurrentLoad(): LoadInfo {
    return {
      activeBots: this.activeBots,
      cpuUsage: this.getCpuUsage(),
      memoryUsage: this.getMemoryUsagePercent(),
      percentOfMax: this.maxBotsPerWorker > 0
        ? (this.activeBots / this.maxBotsPerWorker) * 100
        : 0,
    };
  }

  activeBotsCount(): number {
    return this.activeBots;
  }

  incrementBotCount(): void {
    this.activeBots++;
  }

  decrementBotCount(): void {
    if (this.activeBots > 0) {
      this.activeBots--;
    }
  }

  setActiveBots(count: number): void {
    this.activeBots = count;
  }

  private getCpuUsage(): number {
    try {
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      for (const cpu of cpus) {
        for (const type in cpu.times) {
          if (Object.prototype.hasOwnProperty.call(cpu.times, type)) {
            totalTick += cpu.times[type as keyof typeof cpu.times];
          }
        }
        totalIdle += cpu.times.idle;
      }

      const idle = totalIdle / cpus.length;
      const tick = totalTick / cpus.length;
      const usage = 100 - (idle / tick) * 100;

      this.cpuUsageHistory.push(usage);
      if (this.cpuUsageHistory.length > 10) {
        this.cpuUsageHistory.shift();
      }

      const avg =
        this.cpuUsageHistory.reduce((a, b) => a + b, 0) /
        this.cpuUsageHistory.length;

      return Math.round(avg * 100) / 100;
    } catch {
      return 0;
    }
  }

  private getMemoryUsagePercent(): number {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      return (usedMem / totalMem) * 100;
    } catch {
      return 0;
    }
  }
}
