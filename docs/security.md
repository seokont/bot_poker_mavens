# Security Documentation

## Overview

The Poker Mavens Bot Management System implements a defense-in-depth security strategy covering authentication, encryption, authorization, audit, rate limiting, and secrets management.

## Password Encryption (AES-256-GCM)

### Bot Credential Storage

Bot passwords for Poker Mavens login are encrypted at rest using **AES-256-GCM** with the following scheme:

```typescript
class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;  // Derived via scrypt

  encrypt(plainText: string): string {
    const iv = randomBytes(16);               // Unique IV per encryption
    const cipher = createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();       // Authentication tag
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(cipherText: string): string {
    const [iv, authTag, encrypted] = cipherText.split(':');
    const decipher = createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### Key Derivation

```typescript
this.key = scryptSync(keyStr, 'poker-bot-salt', 32);
```

- **Algorithm**: scrypt (memory-hard key derivation)
- **Salt**: Fixed application salt `poker-bot-salt`
- **Output**: 32 bytes (256 bits) for AES-256
- **Input**: `BOT_CREDENTIALS_ENCRYPTION_KEY` env var

### Security Properties

| Property | Implementation |
|---|---|
| Encryption | AES-256-GCM (authenticated encryption) |
| IV | 16 random bytes per encryption (never reused) |
| Authentication Tag | 16 bytes, verified on decryption |
| Output Format | `hex(iv):hex(authTag):hex(ciphertext)` |
| Decryption Failure | Throws on tampered data |

### Why Not bcrypt for Bot Passwords?

Bot passwords must be **decryptable** because the worker needs the original plaintext to log into Poker Mavens. bcrypt is one-way (hash-only) and unsuitable for this use case. Bot passwords are encrypted for storage security but must be recoverable at runtime.

## Admin Authentication (JWT + bcrypt)

### Password Hashing

```typescript
const passwordHash = await bcrypt.hash(password, 12);
```

- **Algorithm**: bcrypt
- **Cost factor**: 12 (~250ms per hash on modern hardware)
- **Salt**: Auto-generated per password (embedded in bcrypt output)
- **Output format**: `$2b$12$<22-char-salt><31-char-hash>`

### JWT Token Structure

```typescript
const payload = { sub: admin.id, email: admin.email, role: admin.role };

// Access token (short-lived)
accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '15m' });

// Refresh token (long-lived)
refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' });
```

| Property | Access Token | Refresh Token |
|---|---|---|
| Secret | `JWT_ACCESS_SECRET` | `JWT_REFRESH_SECRET` |
| Default TTL | 15 minutes | 30 days |
| Usage | All API requests | Token refresh only |
| Storage | Memory (client) | Secure HTTP-only cookie or client storage |

### JWT Strategy (passport-jwt)

```typescript
class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

- Tokens extracted from `Authorization: Bearer <token>` header
- Expired tokens are rejected (not auto-refreshed)
- Validated payload attached to `request.user`

## Internal API Key

Worker-to-backend communication uses a shared secret API key:

```typescript
class InternalApiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-internal-api-key'];

    if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException('Invalid or missing internal API key');
    }
    return true;
  }
}
```

### Protection Layers

1. **Header validation**: Requests must include `x-internal-api-key` matching `INTERNAL_API_KEY`
2. **Network restriction**: Nginx blocks `/internal/` routes to Docker internal network only (`172.0.0.0/8`)
3. **Rate limiting**: Internal endpoints limited to 5 req/s (burst 10)

```nginx
location /internal/ {
    limit_req zone=internal burst=10 nodelay;
    allow 172.0.0.0/8;
    deny all;
}
```

## RBAC (Role-Based Access Control)

### Roles

```typescript
enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',  // Full system access
  ADMIN = 'ADMIN',               // Management access (except audit)
  OPERATOR = 'OPERATOR',         // Bot operations only
  VIEWER = 'VIEWER',             // Read-only access
}
```

### Role Permissions Matrix

| Resource | SUPER_ADMIN | ADMIN | OPERATOR | VIEWER |
|---|---|---|---|---|
| Bot: List | ✓ | ✓ | ✓ | ✓ |
| Bot: Create | ✓ | ✓ | ✓ | ✗ |
| Bot: Update | ✓ | ✓ | ✓ | ✗ |
| Bot: Delete | ✓ | ✓ | ✗ | ✗ |
| Bot: Start/Stop | ✓ | ✓ | ✓ | ✗ |
| Bot: Join Table | ✓ | ✓ | ✓ | ✗ |
| Strategies: List | ✓ | ✓ | - | ✓ |
| Strategies: CRUD | ✓ | ✓ | ✗ | ✗ |
| Tables: Sync | ✓ | ✓ | ✗ | ✗ |
| Tables: Update | ✓ | ✓ | ✗ | ✗ |
| Limits: View | ✓ | ✓ | - | ✓ |
| Limits: Update | ✓ | ✓ | ✗ | ✗ |
| Audit Logs | ✓ | ✗ | ✗ | ✗ |
| Bot Bulk Ops | ✓ | ✓ | ✗ | ✗ |

### Implementation

```typescript
// Decorator-based role checking
@Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
@UseGuards(AuthGuard('jwt'), RolesGuard)
```

The `RolesGuard` checks `request.user.role` against the required roles list set via the `@Roles()` decorator.

## Audit Logging

All admin actions that modify state are logged to the `audit_logs` table.

### Logged Actions

| Action | Entity | Details Captured |
|---|---|---|
| BOT_CREATED | Bot | Full bot configuration (passwords excluded) |
| BOT_UPDATED | Bot | Before/after JSON diff |
| BOT_DISABLED | Bot | Previous state |
| STRATEGY_CREATED | StrategyProfile | Full strategy configuration |
| STRATEGY_UPDATED | StrategyProfile | Before/after configuration |
| STRATEGY_CLONED | StrategyProfile | Source and destination IDs |
| TABLE_UPDATED | PokerTable | Before/after settings |
| LIMITS_UPDATED | BotLimit | Before/after limit values |

### Audit Log Record Schema

```json
{
  "adminUserId": "clx...",
  "action": "BOT_UPDATED",
  "entityType": "Bot",
  "entityId": "clx...",
  "beforeJson": "{\"name\":\"Old Name\",\"maxBuyIn\":1000}",
  "afterJson": "{\"name\":\"New Name\",\"maxBuyIn\":2000}",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "createdAt": "2024-01-15T10:00:00Z"
}
```

## Rate Limiting

### Nginx Layer

```nginx
# Public API: 30 requests/second with burst of 20
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
location /api/ {
    limit_req zone=api burst=20 nodelay;
}

# Internal API: 5 requests/second with burst of 10
limit_req_zone $binary_remote_addr zone=internal:10m rate=5r/s;
location /internal/ {
    limit_req zone=internal burst=10 nodelay;
}
```

- Rate limiting is per client IP address
- `nodelay` means excess requests are rejected immediately (not queued)
- Rate limit zones use 10MB of shared memory (sufficient for ~160,000 IPs)

### HTTP 429 Response

When rate limited, clients receive:

```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "ThrottlerException"
}
```

## CORS and Helmet

### CORS Configuration

```typescript
app.enableCors({
  origin: process.env.ADMIN_WEB_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

- Whitelist-based CORS (not `*`) in production
- Credentials enabled for cookie/session support
- Standard HTTP methods only
- Limited headers exposed

### Helmet Security Headers

```typescript
app.use(helmet());
```

Nginx also adds:

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## No Secrets in Logs

### Error Handler Secret Stripping

When capturing HTML snapshots on errors, the `ErrorHandler` automatically redacts sensitive data:

```typescript
private stripSecrets(html: string): string {
  return html
    .replace(/password="[^"]*"/gi, 'password="[REDACTED]"')
    .replace(/token="[^"]*"/gi, 'token="[REDACTED]"')
    .replace(/secret="[^"]*"/gi, 'secret="[REDACTED]"')
    .replace(/authorization:\s*Bearer\s+\S+/gi, 'authorization: Bearer [REDACTED]');
}
```

### Logging Best Practices

- Logs use structured JSON via Pino
- Bot passwords are never logged (only encrypted form stored)
- JWT tokens are not included in log output
- `LOG_LEVEL` controls verbosity (set to `info` or `warn` in production)

## Security Checklist for Production

### Pre-Deployment

- [ ] Change all default secrets in `.env`:
  - `JWT_ACCESS_SECRET` (min 32 chars, random)
  - `JWT_REFRESH_SECRET` (min 32 chars, different from access secret)
  - `BOT_CREDENTIALS_ENCRYPTION_KEY` (exactly 32 chars)
  - `INTERNAL_API_KEY` (random, long)
  - `ADMIN_SEED_PASSWORD` (strong password)
  - `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD`
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS (TLS 1.3) via reverse proxy
- [ ] Restrict network access: internal API on private network only
- [ ] Configure firewall rules for Docker host
- [ ] Set up automated database backups
- [ ] Configure log rotation and retention
- [ ] Review rate limiting thresholds based on expected load

### Operational Security

- [ ] Monitor audit logs for suspicious activity
- [ ] Rotate JWT secrets periodically
- [ ] Rotate internal API keys on worker compromise
- [ ] Review bot operation logs for unusual patterns
- [ ] Keep Docker images updated (security patches)
- [ ] Run with least-privilege database user
- [ ] Use separate database credentials per environment

### Incident Response

- [ ] Disable suspicious bots immediately via `PATCH /api/v1/bots/:id` (set `isEnabled: false`)
- [ ] Revoke all JWT tokens by changing `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Rotate `INTERNAL_API_KEY` to disconnect workers
- [ ] Review audit logs to determine scope of incident
- [ ] Restore database from backup if tampered
