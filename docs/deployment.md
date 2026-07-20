# Deployment Guide

## Docker Compose Configuration

The system is deployed as a multi-container Docker application defined in `docker-compose.yml`.

### Services Overview

| Service | Image | Port | Dependencies |
|---|---|---|---|
| mysql | mysql:8.0 | 3306 | - |
| redis | redis:7-alpine | 6379 | - |
| backend | Dockerfile.backend | 3000 | mysql (healthy), redis (healthy) |
| bot-worker | Dockerfile.worker | 3001 | redis (healthy), backend |
| admin-web | Dockerfile.web | 80 (nginx) | backend |
| nginx | nginx:alpine | 8080 | backend, admin-web |

### Networks

All services are connected to a bridge network `poker-bot-network`.

### Volumes

- `mysql-data` - Persistent MySQL data at `/var/lib/mysql`
- `redis-data` - Persistent Redis data at `/data`

### Dockerfiles

#### Backend (`Dockerfile.backend`)

Multi-stage build:
1. **Builder**: `node:20-alpine` - installs dependencies and compiles TypeScript
2. **Runner**: `node:20-alpine` - copies compiled output and `node_modules`

```bash
# Build
docker build -t poker-bot-backend -f Dockerfile.backend .
```

#### Bot Worker (`Dockerfile.worker`)

Single-stage build on `mcr.microsoft.com/playwright:v1.40.0-focal`:
- This image includes Chromium and all Playwright system dependencies
- Compiles TypeScript and runs the worker

```bash
# Build
docker build -t poker-bot-worker -f Dockerfile.worker .
```

#### Admin Web (`Dockerfile.web`)

Multi-stage build:
1. **Builder**: `node:20-alpine` - builds Vue 3 app with Vite
2. **Runner**: `nginx:alpine` - serves static files

```bash
# Build
docker build -t poker-bot-admin -f Dockerfile.web .
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | MySQL connection string | `mysql://root:password@mysql:3306/poker_bots` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `JWT_ACCESS_SECRET` | JWT signing secret (min 32 chars) | `your-access-secret-at-least-32-chars` |
| `JWT_REFRESH_SECRET` | JWT refresh secret (min 32 chars) | `your-refresh-secret-at-least-32-chars` |
| `BOT_CREDENTIALS_ENCRYPTION_KEY` | AES-256-GCM key (32 chars) | `change-me-32-char-encryption-key!` |
| `INTERNAL_API_KEY` | Worker-to-backend auth | `secure-internal-api-key` |
| `POKER_MAVENS_URL` | Poker Mavens web URL | `https://poker.example.com` |
| `POKER_MAVENS_ADMIN_API_URL` | Poker Mavens admin API URL | `https://poker.example.com/api` |
| `POKER_MAVENS_ADMIN_API_PASSWORD` | Admin API password | (your admin password) |

### Optional Variables

| Variable | Default | Description |
|---|---|---|
| `BACKEND_PORT` | 3000 | Backend API port |
| `ADMIN_WEB_PORT` | 5173 | Admin UI dev port |
| `JWT_ACCESS_EXPIRES_IN` | 15m | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | 30d | Refresh token TTL |
| `PLAYWRIGHT_HEADLESS` | true | Headless browser mode |
| `PLAYWRIGHT_TIMEOUT_MS` | 15000 | Playwright operation timeout |
| `BOT_ACTION_TIMEOUT_MS` | 5000 | Bot action timeout |
| `BOT_HEARTBEAT_INTERVAL_MS` | 10000 | Heartbeat frequency |
| `BOT_RECONNECT_DELAY_MS` | 5000 | Reconnect initial delay |
| `BOT_MAX_RECONNECT_ATTEMPTS` | 10 | Max reconnect retries |
| `DECISION_ENGINE_MODE` | internal | internal or external |
| `DECISION_ENGINE_URL` | http://decision-engine:8000 | External engine URL |
| `MAX_BOTS_PER_WORKER` | 5 | Bots per worker instance |
| `LOG_LEVEL` | info | Pino log level |
| `ADMIN_SEED_EMAIL` | admin@poker-bots.local | Seed admin email |
| `ADMIN_SEED_PASSWORD` | Admin123! | Seed admin password |

## Deployment Steps

### Production Deployment

```bash
# 1. Clone repository
git clone <repo-url> poker-bot-platform
cd poker-bot-platform

# 2. Configure environment
cp .env.example .env
# Edit .env with production values (USE STRONG SECRETS)

# 3. Build and start
docker compose up -d --build

# 4. Run database migrations
docker compose exec -T backend npx prisma migrate deploy

# 5. Seed initial data (first time only)
docker compose exec -T backend npx prisma db seed

# 6. Verify deployment
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/health/ready
```

### Health Check Verification

```bash
# Basic health
curl http://localhost:8080/health
# {"status":"ok","timestamp":"..."}

# Readiness (checks DB + Redis)
curl http://localhost:8080/api/v1/health/ready
# {"status":"ok","checks":{"database":true,"redis":true},"timestamp":"..."}

# Liveness
curl http://localhost:8080/api/v1/health/live
# {"status":"ok","timestamp":"..."}
```

## Scaling Workers

### Horizontal Scaling

The `bot-worker` service uses Docker Compose replicas:

```yaml
services:
  bot-worker:
    deploy:
      replicas: 3  # Scale to 3 workers
```

Each worker independently polls the Redis queue and registers with the backend. The backend tracks which bots are assigned to which worker via sessions.

### Scaling Considerations

| Factor | Limit | Impact |
|---|---|---|
| `MAX_BOTS_PER_WORKER` | 5 per worker (default) | Each worker can handle up to 5 concurrent bots |
| CPU per worker | ~20-30% per bot | Chromium is CPU-intensive for each browser context |
| Memory per worker | ~200-400MB per bot | Each browser context consumes significant memory |
| Worker replicas | Limited by host resources | More workers = more parallelism but more resource contention |

### Resource Manager Guards

The `ResourceManager` prevents starting new bots when:

- Active bot count >= `MAX_BOTS_PER_WORKER`
- CPU usage > `MAX_CPU_PERCENT` (default: 80%)
- Memory usage > `MAX_MEMORY_PERCENT` (default: 80%)

```bash
# Increase per-worker capacity (monitor resource usage)
MAX_BOTS_PER_WORKER=10
MAX_CPU_PERCENT=90
MAX_MEMORY_PERCENT=90
```

## Monitoring

### Health Check Endpoints

| Endpoint | Purpose | Recommended Probe |
|---|---|---|
| `/health` | Basic liveness | Docker HEALTHCHECK |
| `/health/ready` | Readiness (DB + Redis) | Kubernetes readiness |
| `/health/live` | Liveness | Kubernetes liveness |

### Docker HEALTHCHECK

Each service has a configured healthcheck:

- **MySQL**: `mysqladmin ping`
- **Redis**: `redis-cli ping`
- **Backend**: HTTP GET `/health`
- **Bot Worker**: HTTP GET `/health` (via internal node HTTP request)
- **Admin Web**: HTTP GET on port 80

### Logs

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f bot-worker
docker compose logs -f nginx

# View logs with timestamps
docker compose logs -f --timestamps

# Last N lines
docker compose logs --tail=100 bot-worker
```

### Log Levels

Configure via `LOG_LEVEL` env var:

| Level | Usage |
|---|---|
| `fatal` | Production - only fatal errors |
| `error` | Production - errors only |
| `warn` | Production - warnings and errors |
| `info` | Default - normal operation |
| `debug` | Development - detailed information |
| `trace` | Development - very verbose |

### Metrics to Monitor

1. **Bot statuses**: Count of bots in OFFLINE, PLAYING, ERROR states
2. **Session durations**: Average and max session lengths
3. **Profit/Loss**: Total, daily, per-bot P&L
4. **Decision time**: Average decision engine response time
5. **Error rate**: Percentage of actions that fail
6. **Queue depth**: Number of pending jobs in each BullMQ queue
7. **Heartbeat age**: Time since last heartbeat per bot
8. **Worker load**: Active bots per worker, CPU/memory usage

## Backup and Restore

### MySQL Backup

```bash
# Backup
docker compose exec mysql mysqldump -u root -p poker_bots > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
cat backup.sql | docker compose exec -T mysql mysql -u root -p poker_bots
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh - Run as a cron job
BACKUP_DIR="/backups/poker-bot"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
docker compose exec -T mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" poker_bots | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"
# Retain last 30 days
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +30 -delete
```

### Redis Backup

Redis data is persisted to the `redis-data` volume. For manual backup:

```bash
# Trigger Redis save
docker compose exec redis redis-cli SAVE

# The RDB file is at /data/dump.rdb in the container
# Backed up via the redis-data Docker volume
```

### Full System Backup

```bash
#!/bin/bash
BACKUP_DIR="/backups/poker-bot"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 1. Database backup
docker compose exec -T mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" poker_bots > "$BACKUP_DIR/db_$TIMESTAMP.sql"

# 2. Environment configuration
cp .env "$BACKUP_DIR/env_$TIMESTAMP.txt"

# 3. Nginx configuration
cp -r nginx/ "$BACKUP_DIR/nginx_$TIMESTAMP/"

# 4. Error snapshots (if stored on volume)
# docker cp poker-bot-worker:/app/storage/errors "$BACKUP_DIR/errors_$TIMESTAMP/"
```

## Nginx Configuration

The Nginx reverse proxy (`nginx/default.conf`) provides:

- **Static file serving**: Admin web UI at `/`
- **API proxy**: Backend at `/api/` with rate limiting (30 req/s, burst 20)
- **Internal API restriction**: `/internal/` limited to Docker network (172.0.0.0/8, 5 req/s, burst 10)
- **WebSocket proxying**: Socket.IO at `/socket.io/` with upgrade headers and long timeout (86400s)
- **Swagger docs**: `/api/docs` proxied to backend
- **Security headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy
