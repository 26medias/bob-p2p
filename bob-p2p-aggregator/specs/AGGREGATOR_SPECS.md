# Bob P2P Aggregator - Technical Specifications

## Purpose

The Aggregator is a discovery service that indexes P2P APIs and enables consumers to search and find providers. It does NOT participate in API execution or payment processing - those happen directly between consumer and provider.

---

## Architecture

### High-Level Components

```
┌─────────────────────────────────────┐
│        HTTP API Server              │
│  (Fastify/Express on port 8080)     │
└──────────────┬──────────────────────┘
               │
               ├──────────────┬────────────────┬─────────────────┐
               │              │                │                 │
         ┌─────▼─────┐  ┌────▼────┐  ┌───────▼────────┐  ┌─────▼──────┐
         │  Search   │  │Register │  │  Health Check  │  │   Access   │
         │  Engine   │  │ Manager │  │   Monitor      │  │  Control   │
         └─────┬─────┘  └────┬────┘  └───────┬────────┘  └─────┬──────┘
               │              │                │                 │
               └──────────────┴────────────────┴─────────────────┘
                                      │
                              ┌───────▼────────┐
                              │    Database    │
                              │ (SQLite/Postgres)│
                              └────────────────┘
```

### Database Layer
- **SQLite** (default): For small/medium deployments (<100k APIs)
- **PostgreSQL**: For large deployments (>100k APIs)
- **MongoDB**: Optional support for document-based storage
- **MS SQL**: Optional support for enterprise deployments

---

## Configuration

### Config File Schema

**Location**: User-specified via `--config` flag

**Schema** (`config.json`):
```json
{
    "wallet": {
        "address": "string (Solana public key)",
        "privateKey": "number[] | string (array of bytes or base58)"
    },
    "token": {
        "symbol": "string (e.g., BOB)",
        "mint": "string (SPL token mint address)"
    },
    "database": {
        "type": "sqlite | postgres | mongodb | mssql",
        "path": "string (for SQLite)",
        "host": "string (for postgres/mongodb/mssql)",
        "port": "number",
        "database": "string",
        "username": "string",
        "password": "string"
    },
    "server": {
        "port": 8080,
        "host": "0.0.0.0",
        "cors": {
            "enabled": true,
            "origins": ["*"]
        }
    },
    "access": {
        "type": "free | paid",
        "fee": 1.0,
        "validityDays": 30
    },
    "solana": {
        "network": "mainnet-beta | devnet | testnet",
        "rpcUrl": "string",
        "confirmations": 3
    },
    "health": {
        "checkInterval": 300,
        "timeout": 10,
        "maxFailures": 3
    },
    "security": {
        "rateLimit": {
            "enabled": true,
            "requestsPerMinute": 60,
            "requestsPerHour": 1000
        }
    }
}
```

### Example Configs

**Development (Free Access)**:
```json
{
    "wallet": {
        "address": "BxU7TLWjKKG5pF8H2V3nN9w8X3mK5qY2ZqC7vD8eR9f",
        "privateKey": "provide-example-here"
    },
    "token": {
        "symbol": "BOB",
        "mint": "F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH"
    },
    "database": {
        "type": "sqlite",
        "path": "/home/user/.bob-aggregator/aggregator.db"
    },
    "server": {
        "port": 8080,
        "host": "0.0.0.0"
    },
    "access": {
        "type": "free"
    },
    "solana": {
        "network": "devnet",
        "rpcUrl": "https://api.devnet.solana.com",
        "confirmations": 1
    },
    "health": {
        "checkInterval": 300,
        "timeout": 10,
        "maxFailures": 3
    }
}
```

**Production (Paid Access)**:
```json
{
    "wallet": {
        "address": "7xK9mPQvN8wR5tL2cH6eF3jD4gB1sA9uY8vC2xE5pM3",
        "privateKey": [/* byte array */]
    },
    "token": {
        "symbol": "BOB",
        "mint": "F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH"
    },
    "database": {
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "bob_aggregator",
        "username": "bob_user",
        "password": "secure_password"
    },
    "server": {
        "port": 8080,
        "host": "0.0.0.0"
    },
    "access": {
        "type": "paid",
        "fee": 1.0,
        "validityDays": 30
    },
    "solana": {
        "network": "mainnet-beta",
        "rpcUrl": "https://api.mainnet-beta.solana.com",
        "confirmations": 3
    },
    "health": {
        "checkInterval": 300,
        "timeout": 10,
        "maxFailures": 3
    },
    "security": {
        "rateLimit": {
            "enabled": true,
            "requestsPerMinute": 100,
            "requestsPerHour": 5000
        }
    }
}
```

---

## API Endpoints

### Public Endpoints (No Authentication)

#### 1. Health Check
```http
GET /health

Response: 200 OK
{
    "status": "healthy",
    "uptime": 3600,
    "apisIndexed": 150
}
```

#### 2. Aggregator Info
```http
GET /info

Response: 200 OK
{
    "name": "Bob P2P Aggregator",
    "version": "2.0.0",
    "accessType": "paid",
    "accessFee": 1.0,
    "token": {
        "symbol": "BOB",
        "mint": "F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH"
    },
    "walletAddress": "BxU7TLWjKKG5pF8H2V3nN9w8X3mK5qY2ZqC7vD8eR9f",
    "stats": {
        "totalAPIs": 150,
        "activeAPIs": 142,
        "categories": ["ml", "video", "image", "data", "compute"]
    }
}
```

### Access-Controlled Endpoints

These require valid access (either free or paid depending on config).

#### 3. Search APIs
```http
GET /api/search?category=ml&maxPrice=0.5&tags=image,generation&limit=20

Headers (if paid access):
  X-Wallet-Address: <solana-address>

Response: 200 OK
{
    "total": 5,
    "apis": [
        {
            "id": "api-12345",
            "name": "Stable Diffusion XL",
            "description": "High-quality image generation",
            "provider": {
                "address": "7xK9mPQ...",
                "endpoint": "https://provider1.example.com",
                "reputation": {
                    "rating": 4.8,
                    "totalCalls": 1500,
                    "successRate": 98.5
                }
            },
            "pricing": {
                "amount": 0.3,
                "unit": "per-call"
            },
            "capacity": {
                "concurrent": 2,
                "queueMax": 10
            },
            "category": ["ml", "image"],
            "tags": ["stable-diffusion", "image", "generation"],
            "status": "online",
            "lastSeen": "2026-02-01T12:30:00Z"
        }
    ]
}

Error Responses:
  402 Payment Required (if paid access and no valid payment)
  429 Too Many Requests (rate limit exceeded)
```

#### 4. Get API Details
```http
GET /api/{apiId}

Headers (if paid access):
  X-Wallet-Address: <solana-address>

Response: 200 OK
{
    "id": "api-12345",
    "name": "Stable Diffusion XL",
    "description": "High-quality image generation",
    "version": "1.0.0",
    "provider": {
        "address": "7xK9mPQ...",
        "endpoint": "https://provider1.example.com"
    },
    "api": {
        "path": "/generate",
        "method": "POST",
        "requestSchema": {
            "type": "object",
            "properties": {
                "prompt": { "type": "string", "maxLength": 500 },
                "steps": { "type": "number", "minimum": 20, "maximum": 100 }
            },
            "required": ["prompt"]
        },
        "responseSchema": {
            "type": "object",
            "properties": {
                "imageUrl": { "type": "string" }
            }
        }
    },
    "pricing": {
        "amount": 0.3,
        "unit": "per-call"
    },
    "capacity": {
        "concurrent": 2,
        "queueMax": 10,
        "queueTimeout": 60
    },
    "execution": {
        "estimatedDuration": 45,
        "maxDuration": 120,
        "resultRetention": 86400
    },
    "stats": {
        "totalCalls": 1500,
        "successRate": 98.5,
        "avgResponseTime": 43
    }
}
```

#### 5. List Categories
```http
GET /api/categories

Response: 200 OK
{
    "categories": [
        { "name": "ml", "count": 50 },
        { "name": "video", "count": 20 },
        { "name": "image", "count": 40 },
        { "name": "data", "count": 30 },
        { "name": "compute", "count": 10 }
    ]
}
```

### Provider Endpoints

#### 6. Register API
```http
POST /api/register

Headers:
  Content-Type: application/json
  X-Provider-Address: <solana-address>
  X-Signature: <signature of API spec>

Body:
{
    "id": "api-12345",
    "name": "Stable Diffusion XL",
    "description": "High-quality image generation",
    "version": "1.0.0",
    "endpoint": "https://provider1.example.com",
    "api": {
        "path": "/generate",
        "method": "POST",
        "requestSchema": { /* ... */ },
        "responseSchema": { /* ... */ }
    },
    "pricing": {
        "amount": 0.3,
        "unit": "per-call"
    },
    "capacity": {
        "concurrent": 2,
        "queueMax": 10,
        "queueTimeout": 60
    },
    "execution": {
        "estimatedDuration": 45,
        "maxDuration": 120,
        "resultRetention": 86400
    },
    "category": ["ml", "image"],
    "tags": ["stable-diffusion", "image", "generation"]
}

Response: 201 Created
{
    "apiId": "api-12345",
    "status": "registered",
    "healthCheckScheduled": true
}

Error Responses:
  400 Bad Request (invalid API spec)
  401 Unauthorized (signature verification failed)
  409 Conflict (API ID already exists)
```

#### 7. Update API
```http
PUT /api/{apiId}

Headers:
  Content-Type: application/json
  X-Provider-Address: <solana-address>
  X-Signature: <signature>

Body: (same as register)

Response: 200 OK
{
    "apiId": "api-12345",
    "status": "updated"
}
```

#### 8. Deregister API
```http
DELETE /api/{apiId}

Headers:
  X-Provider-Address: <solana-address>
  X-Signature: <signature of apiId>

Response: 200 OK
{
    "apiId": "api-12345",
    "status": "deregistered"
}
```

#### 9. Heartbeat
```http
POST /api/{apiId}/heartbeat

Headers:
  X-Provider-Address: <solana-address>
  X-Signature: <signature>

Body:
{
    "status": "online",
    "queueLength": 3,
    "activeJobs": 2
}

Response: 200 OK
{
    "acknowledged": true,
    "nextHeartbeat": 300
}
```

### Access Payment Endpoints (Paid Access Only)

#### 10. Pay for Access
```http
POST /access/pay

Headers:
  Content-Type: application/json

Body:
{
    "walletAddress": "BxU7...",
    "transactionSignature": "5x7K9m...",
    "amount": 1.0,
    "tokenMint": "F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH"
}

Response: 200 OK
{
    "status": "verified",
    "accessGranted": true,
    "validUntil": "2026-03-03T12:30:00Z"
}

Error Responses:
  400 Bad Request (invalid transaction)
  402 Payment Required (payment verification failed)
```

#### 11. Check Access Status
```http
GET /access/status?walletAddress=BxU7...

Response: 200 OK
{
    "hasAccess": true,
    "validUntil": "2026-03-03T12:30:00Z",
    "daysRemaining": 28
}
```

### Admin Endpoints (Internal)

#### 12. Statistics
```http
GET /admin/stats

Response: 200 OK
{
    "apis": {
        "total": 150,
        "active": 142,
        "offline": 8
    },
    "access": {
        "totalPaid": 500,
        "activeUsers": 450
    },
    "revenue": {
        "total": 500.0,
        "thisMonth": 50.0
    },
    "searches": {
        "total": 10000,
        "thisWeek": 1200
    }
}
```

---

## Database Schema

### SQLite Schema

```sql
-- APIs registered by providers
CREATE TABLE apis (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL,
    provider_address TEXT NOT NULL,
    endpoint TEXT NOT NULL,

    -- API specification (JSON)
    api_spec TEXT NOT NULL,

    -- Pricing
    pricing_amount REAL NOT NULL,
    pricing_unit TEXT NOT NULL,

    -- Capacity
    capacity_concurrent INTEGER,
    capacity_queue_max INTEGER,
    capacity_queue_timeout INTEGER,

    -- Execution
    exec_estimated_duration INTEGER,
    exec_max_duration INTEGER,
    exec_result_retention INTEGER,

    -- Categorization
    category TEXT,  -- JSON array
    tags TEXT,      -- JSON array

    -- Status
    status TEXT DEFAULT 'pending',  -- pending | active | offline | suspended
    last_heartbeat TIMESTAMP,
    failure_count INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indices for search performance
CREATE INDEX idx_apis_category ON apis(category);
CREATE INDEX idx_apis_status ON apis(status);
CREATE INDEX idx_apis_provider ON apis(provider_address);

-- Access payments (for paid aggregators)
CREATE TABLE access_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    transaction_signature TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    token_mint TEXT NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_access_wallet ON access_payments(wallet_address);
CREATE INDEX idx_access_valid ON access_payments(valid_until);

-- API statistics
CREATE TABLE api_stats (
    api_id TEXT PRIMARY KEY,
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    failed_calls INTEGER DEFAULT 0,
    total_response_time INTEGER DEFAULT 0,  -- milliseconds
    last_called TIMESTAMP,
    FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE
);

-- Search logs (for analytics)
CREATE TABLE search_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT,
    search_query TEXT,
    results_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Health check logs
CREATE TABLE health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_id TEXT NOT NULL,
    status TEXT NOT NULL,  -- success | timeout | error
    response_time INTEGER,  -- milliseconds
    error_message TEXT,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE
);

CREATE INDEX idx_health_api ON health_checks(api_id);
CREATE INDEX idx_health_checked ON health_checks(checked_at);
```

### PostgreSQL Schema

```sql
-- Similar to SQLite but with better types

CREATE TABLE apis (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    provider_address VARCHAR(255) NOT NULL,
    endpoint VARCHAR(500) NOT NULL,

    api_spec JSONB NOT NULL,

    pricing_amount DECIMAL(18, 8) NOT NULL,
    pricing_unit VARCHAR(50) NOT NULL,

    capacity_concurrent INTEGER,
    capacity_queue_max INTEGER,
    capacity_queue_timeout INTEGER,

    exec_estimated_duration INTEGER,
    exec_max_duration INTEGER,
    exec_result_retention INTEGER,

    category JSONB,
    tags JSONB,

    status VARCHAR(50) DEFAULT 'pending',
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    failure_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GIN indices for JSON search
CREATE INDEX idx_apis_category ON apis USING GIN(category);
CREATE INDEX idx_apis_tags ON apis USING GIN(tags);
CREATE INDEX idx_apis_status ON apis(status);
CREATE INDEX idx_apis_provider ON apis(provider_address);

-- ... (similar tables for access_payments, api_stats, etc.)
```

---

## Business Logic

### API Registration Flow

1. **Provider sends registration request**
   - Includes API spec + signature

2. **Aggregator validates signature**
   - Verify signature matches provider address
   - Prevent impersonation attacks

3. **Aggregator validates API spec**
   - Check required fields present
   - Validate JSON schemas
   - Check pricing > 0 if not free

4. **Store in database**
   - Insert or update API record
   - Set status = "pending"

5. **Schedule health check**
   - Immediately ping provider endpoint
   - If successful, set status = "active"
   - If failed, set status = "offline"

### Health Check System

**Purpose**: Ensure listed APIs are actually online and responsive

**Process**:
1. Every N seconds (configurable, default 300s):
   - Select all APIs with status = "active"
   - For each API:
     - Send GET request to `{endpoint}/health`
     - Timeout after M seconds (configurable, default 10s)

2. **On Success**:
   - Update `last_heartbeat` = now
   - Reset `failure_count` = 0

3. **On Failure**:
   - Increment `failure_count`
   - If `failure_count` >= max (default 3):
     - Set status = "offline"
     - Remove from search results
   - Log failure in health_checks table

4. **Recovery**:
   - Provider can send manual heartbeat via `/api/{id}/heartbeat`
   - Resets failure count and status

### Access Control (Paid Aggregators)

**Middleware checks**:
1. Extract wallet address from request header
2. Query access_payments table:
   ```sql
   SELECT * FROM access_payments
   WHERE wallet_address = ?
   AND valid_until > NOW()
   ORDER BY valid_until DESC
   LIMIT 1
   ```
3. If found: Allow request
4. If not found: Return 402 Payment Required

**Payment verification**:
1. Consumer sends transaction signature
2. Aggregator queries Solana blockchain:
   - Verify transaction exists and confirmed
   - Verify amount >= access fee
   - Verify recipient = aggregator wallet
   - Verify token mint matches config
3. If valid:
   - Insert into access_payments
   - Set valid_until = now + validityDays
   - Return success

**Replay protection**:
- Transaction signature is UNIQUE in database
- Cannot use same payment twice

### Search Engine

**Query Parameters**:
- `category`: Filter by category (supports multiple: `category=ml,video`)
- `tags`: Filter by tags (supports multiple: `tags=image,generation`)
- `maxPrice`: Maximum price per call
- `freeOnly`: Only show free APIs
- `status`: Filter by status (default: active only)
- `limit`: Max results (default 20, max 100)
- `offset`: Pagination offset

**SQL Query Construction**:
```sql
SELECT * FROM apis
WHERE status = 'active'
AND (category LIKE '%ml%' OR category LIKE '%video%')
AND (tags LIKE '%image%' OR tags LIKE '%generation%')
AND (pricing_amount <= 0.5 OR pricing_unit = 'free')
ORDER BY last_heartbeat DESC
LIMIT 20 OFFSET 0
```

**Performance Optimization**:
- Index on category, tags, status
- Cache popular searches (Redis)
- Pre-compute category counts

---

## Security

### Signature Verification

**Purpose**: Prevent unauthorized API registration/updates

**Process**:
1. Provider signs API spec with their private key
2. Aggregator receives:
   - API spec (JSON)
   - Signature (base64)
   - Provider address (public key)
3. Aggregator verifies:
   ```javascript
   const message = JSON.stringify(apiSpec);
   const signature = base64Decode(signatureHeader);
   const verified = nacl.sign.detached.verify(
       Buffer.from(message),
       signature,
       base58Decode(providerAddress)
   );
   ```
4. If verification fails: Reject with 401 Unauthorized

### Rate Limiting

**Per IP Address**:
- 100 requests per minute
- 1000 requests per hour
- Use in-memory store (e.g., rate-limiter-flexible)

**Per Wallet Address** (for authenticated requests):
- 1000 requests per hour
- 5000 requests per day

**Implementation**:
```javascript
const rateLimiter = new RateLimiterMemory({
    points: 100,
    duration: 60
});

// Middleware
async function rateLimitMiddleware(req, res, next) {
    try {
        await rateLimiter.consume(req.ip);
        next();
    } catch {
        res.status(429).json({ error: 'Too many requests' });
    }
}
```

### DOS Protection

**Large Payloads**:
- Limit request body size: 1MB max
- Limit API spec size: 100KB max

**Spam Registrations**:
- Require signature verification
- Optional: Require small payment to register API (burned/refundable)

**Health Check Abuse**:
- Limit health check frequency per API
- Providers can opt-out of automatic checks (but manual heartbeat required)

---

## Error Handling

### Error Response Format

```json
{
    "error": {
        "code": "PAYMENT_REQUIRED",
        "message": "Access payment required for this aggregator",
        "details": {
            "fee": 1.0,
            "token": "BOB",
            "tokenMint": "F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH",
            "recipientAddress": "BxU7TLWjKKG5pF8H2V3nN9w8X3mK5qY2ZqC7vD8eR9f"
        }
    }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_REQUEST | 400 | Malformed request body |
| UNAUTHORIZED | 401 | Signature verification failed |
| PAYMENT_REQUIRED | 402 | Access payment needed |
| NOT_FOUND | 404 | API not found |
| CONFLICT | 409 | API already registered |
| TOO_MANY_REQUESTS | 429 | Rate limit exceeded |
| INTERNAL_ERROR | 500 | Server error |

---

## Monitoring & Logging

### Metrics to Track

1. **API Metrics**:
   - Total APIs registered
   - Active vs offline APIs
   - Average uptime per API

2. **Search Metrics**:
   - Searches per day
   - Most searched categories
   - Average results per search

3. **Access Metrics** (paid aggregators):
   - Total paid users
   - Revenue per day/month
   - Average access duration

4. **Performance Metrics**:
   - Average response time per endpoint
   - Database query performance
   - Health check success rate

### Logging

**Log Levels**:
- ERROR: Payment verification failures, health check failures
- WARN: Rate limit triggers, signature verification failures
- INFO: API registrations, searches, payments
- DEBUG: Health checks, detailed request logs

**Log Format** (JSON):
```json
{
    "level": "info",
    "timestamp": "2026-02-01T12:30:00.000Z",
    "event": "api_registered",
    "apiId": "api-12345",
    "provider": "7xK9mPQ...",
    "details": {
        "name": "Stable Diffusion XL",
        "pricing": 0.3
    }
}
```

---

## Deployment

### System Requirements

**Minimum**:
- CPU: 2 cores
- RAM: 2GB
- Disk: 10GB SSD
- Network: 10 Mbps

**Recommended (production)**:
- CPU: 4+ cores
- RAM: 8GB
- Disk: 50GB SSD
- Network: 100 Mbps

### Installation

```bash
# Install Node.js 18+
# Install PostgreSQL (optional, for production)

# Install aggregator
npm install -g @bob-p2p/aggregator

# Create config
mkdir -p ~/.bob-aggregator
cp config.example.json ~/.bob-aggregator/config.json

# Edit config with your wallet, database, etc.
nano ~/.bob-aggregator/config.json

# Start aggregator
bob-aggregator start --config ~/.bob-aggregator/config.json
```

### Production Checklist

- [ ] Use PostgreSQL instead of SQLite
- [ ] Enable HTTPS (SSL certificate)
- [ ] Set up reverse proxy (nginx)
- [ ] Configure firewall (only 8080 open)
- [ ] Set up monitoring (Prometheus + Grafana)
- [ ] Configure log rotation
- [ ] Set up database backups
- [ ] Use hardware wallet or key management system
- [ ] Enable rate limiting
- [ ] Set confirmations = 3 for mainnet

---

## CLI Commands

```bash
# Start aggregator
bob-aggregator start --config /path/to/config.json

# Check stats
bob-aggregator stats --config /path/to/config.json

# List all APIs
bob-aggregator list-apis --config /path/to/config.json

# Check revenue (paid aggregators)
bob-aggregator revenue --config /path/to/config.json

# Force health check
bob-aggregator health-check --config /path/to/config.json

# Export API list
bob-aggregator export --format json --output apis.json
```

---

## Testing

### Unit Tests

- Config loading and validation
- Database operations (CRUD)
- Signature verification
- Payment verification
- Search query building

### Integration Tests

- API registration flow
- Health check system
- Access payment flow
- Search with various filters
- Rate limiting

### End-to-End Tests

- Provider registers API
- Aggregator performs health check
- Consumer searches and finds API
- Consumer pays for access (if required)
- Consumer gets API details

---

## Future Enhancements

### Phase 2
- Reputation system (ratings, reviews)
- WebSocket for real-time API status updates
- Advanced search (natural language)
- API versioning support

### Phase 3
- Multi-region deployment
- CDN for static assets
- Machine learning for fraud detection
- Analytics dashboard (web UI)

---

## Appendix

### Example Wallet in Config

**For development/testing only. NEVER use in production.**

```json
{
    "wallet": {
        "address": "BxU7TLWjKKG5pF8H2V3nN9w8X3mK5qY2ZqC7vD8eR9f",
        "privateKey": [174,47,154,16,73,0,234,90,137,203,174,44,10,80,205,35,18,48,35,234,16,58,204,80,47,88,251,157,136,79,246,102,145,187,73,189,136,206,47,114,116,29,203,249,143,251,185,138,28,142,67,192,199,214,193,206,239,243,174,71,39,61,209,85]
    }
}
```

**Generate new wallet**:
```bash
solana-keygen new --no-bip39-passphrase --outfile wallet.json

# Get address
solana-keygen pubkey wallet.json

# Get private key (array format)
cat wallet.json
```

---

## Support

For issues, questions, or contributions, see main project README.
