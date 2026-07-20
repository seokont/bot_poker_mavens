export default () => ({
  port: parseInt(process.env.BACKEND_PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/poker_bots',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  encryption: {
    key: process.env.BOT_CREDENTIALS_ENCRYPTION_KEY || 'change-me-32-char-encryption-key!',
  },
  pokerMavens: {
    url: process.env.POKER_MAVENS_URL || 'https://poker.example.com',
    apiPort: process.env.POKER_MAVENS_API_PORT || '8087',
    adminApiUrl: process.env.POKER_MAVENS_ADMIN_API_URL || 'https://poker.example.com/api',
    adminApiPassword: process.env.POKER_MAVENS_ADMIN_API_PASSWORD || '',
  },
  bot: {
    actionTimeoutMs: parseInt(process.env.BOT_ACTION_TIMEOUT_MS || '5000', 10),
    heartbeatIntervalMs: parseInt(process.env.BOT_HEARTBEAT_INTERVAL_MS || '10000', 10),
    reconnectDelayMs: parseInt(process.env.BOT_RECONNECT_DELAY_MS || '5000', 10),
    maxReconnectAttempts: parseInt(process.env.BOT_MAX_RECONNECT_ATTEMPTS || '10', 10),
  },
  decisionEngine: {
    mode: process.env.DECISION_ENGINE_MODE || 'internal',
    url: process.env.DECISION_ENGINE_URL || 'http://decision-engine:8000',
  },
  worker: {
    maxBotsPerWorker: parseInt(process.env.MAX_BOTS_PER_WORKER || '5', 10),
  },
  internalApi: {
    key: process.env.INTERNAL_API_KEY || 'change-me-internal-api-key',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
});
