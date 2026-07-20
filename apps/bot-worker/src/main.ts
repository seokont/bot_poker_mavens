import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.WORKER_PORT || 3001;
  await app.listen(port);

  console.log(`[BotWorker] Worker started on port ${port}`);
  console.log(`[BotWorker] Worker ID: ${process.env.WORKER_ID || 'unknown'}`);
}

bootstrap().catch((err) => {
  console.error('[BotWorker] Failed to start:', err);
  process.exit(1);
});
