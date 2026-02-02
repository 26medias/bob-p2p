# Bob P2P API Network V2

**Decentralized API marketplace with queue management, rate limiting, and payment protection**

## Overview

V2 is a complete redesign focused on simplicity, security, and real-world usability. The system enables API providers to monetize local compute (GPUs, ML models, services) through a pay-per-use model with proper queue management for resource-constrained operations.

### Key Problems Solved

1. **Simple Setup**: Single config file per service, no complex scripts
2. **Payment Protection**: Queue system prevents paying for unavailable capacity
3. **Rate Limiting**: Providers control throughput to match their resources
4. **Long-Running Jobs**: Async job execution with polling for results
5. **Attack Prevention**: Protection against common crypto exploits

---

## Architecture

### Two Independent Projects

1. **bob-p2p-aggregator**: Discovery service that indexes available APIs
2. **bob-p2p-client**: API provider/consumer running locally

**Critical**: These are separate projects with NO shared code. Each can be installed and run independently.

---

## Core Concepts

### API Provider
- Runs locally (laptop, server, GPU machine)
- Defines APIs in `api.json` (name, endpoint, pricing, capacity)
- Manages request queue and rate limits
- Verifies payments on-chain before execution
- Returns results via polling endpoint

### API Consumer
- Discovers APIs via aggregator
- Requests queue position before payment (capacity check)
- Pays after confirming availability
- Calls API with payment proof + queue code
- Polls for results (async execution)

### Aggregator
- Indexes APIs from providers
- Provides search/discovery
- Optional paid access model
- No involvement in API execution (direct P2P)

---

## Payment Protection Protocol

### The Problem
Traditional "pay-then-call" model fails for slow APIs:
- Provider offers GPU-based text-to-video (5 minutes per video)
- 20 users pay simultaneously
- Provider overwhelmed, can't fulfill requests
- Users already paid, must wait indefinitely or lose funds

### The Solution: Queue-First Protocol

```
1. Status Check
   Consumer → Provider: GET /api/{id}/status
   Provider → Consumer: { available: true, queueLength: 3, estimatedWait: 15m }

2. Queue Request
   Consumer → Provider: POST /api/{id}/queue
   Provider → Consumer: {
       queueCode: "abc123",
       position: 4,
       price: 0.5,
       expiresAt: "2026-02-01T12:35:00Z",
       estimatedStart: "2026-02-01T12:30:00Z"
   }

3. Payment
   Consumer → Solana: Transfer 0.5 BOB to provider wallet
   Solana → Consumer: Transaction signature

4. API Call
   Consumer → Provider: POST /api/{id}/execute
   Headers:
     X-Queue-Code: abc123
     X-Transaction-Signature: 5x7K9m...
     X-Caller-Address: BxU7...
   Body: { prompt: "sunset over mountains" }

   Provider → Consumer: {
       jobId: "job-xyz789",
       status: "queued",
       estimatedCompletion: "2026-02-01T12:35:00Z"
   }

5. Poll for Results
   Consumer → Provider: GET /api/jobs/{jobId}
   Provider → Consumer: {
       status: "completed",
       result: { videoUrl: "...", duration: 5.2 }
   }
```

### Benefits
- **No wasted payments**: Users see queue before paying
- **Capacity awareness**: Provider controls queue depth
- **Fair ordering**: First to get queue code, first served
- **DOS protection**: Queue codes expire if not used

---

## Security & Attack Prevention

### 1. Payment Replay Attack
**Threat**: Attacker reuses transaction signature for multiple API calls

**Prevention**:
- Provider tracks used transaction signatures in database
- Each signature can only be used once
- Return 402 error if signature already used

### 2. Queue Squatting
**Threat**: Attacker requests many queue positions to DOS the API

**Prevention**:
- Queue codes expire after short time (60 seconds)
- Limit queue requests per IP/wallet
- Require small deposit for queue reservation (refunded if used)

### 3. Price Manipulation
**Threat**: Provider changes price after queue code issued

**Prevention**:
- Price locked when queue code generated
- Queue code includes price hash
- Provider must honor original price or refund

### 4. Payment Without Execution
**Threat**: Provider accepts payment but never executes API

**Prevention**:
- Job must be created or payment considered invalid
- Timeout mechanism: if no job created within 5 minutes, user can reclaim
- Reputation system in aggregator (Phase 2)

### 5. Result Withholding
**Threat**: Provider executes job but never returns result

**Prevention**:
- Job status must update within reasonable time
- Results stored for minimum period (configurable)
- Reputation penalties for abandoned jobs

### 6. Aggregator Spam
**Threat**: Fake APIs registered to pollute discovery

**Prevention**:
- Aggregator requires payment to register API
- Heartbeat checks: aggregator pings API health endpoint
- APIs auto-removed if offline for >24 hours
- Reputation/rating system

### 7. Front-Running
**Threat**: Monitor pending transactions and steal queue positions

**Prevention**:
- Queue code tied to specific wallet address
- Only matching wallet can use queue code
- Transaction verification checks caller matches code owner

### 8. Sybil Attack
**Threat**: Create multiple identities to bypass rate limits

**Prevention**:
- Rate limit by IP address AND wallet address
- Require small stake per unique wallet (burned/locked)
- Aggregator tracks wallet reputation

---

## Edge Cases & Solutions

### Case 1: User Gets Queue Code But Provider Goes Offline
**Solution**:
- Queue codes expire (60s default)
- Provider health checked by aggregator
- User never pays if provider offline during payment window

### Case 2: User Pays But Network Fails Before API Call
**Solution**:
- Payment grace period (5 minutes)
- User can retry API call with same transaction
- Provider checks if transaction already used for successful job

### Case 3: Long Transaction Confirmation Time
**Solution**:
- Provider configurable confirmation requirements (1-3 for devnet/mainnet)
- Queue code validity extends during payment confirmation
- User notified of confirmation wait time

### Case 4: Job Takes Longer Than Expected
**Solution**:
- Estimated completion time is best-effort, not guaranteed
- Job status includes progress percentage (optional)
- Results available for 24 hours minimum after completion

### Case 5: Provider Runs Out of Storage for Results
**Solution**:
- Provider sets max result storage in config
- Old completed jobs purged after retention period
- Users should poll and download results promptly

### Case 6: Multiple Users Share Queue Position
**Solution**:
- Queue codes are unique, single-use
- Provider validates code hasn't been redeemed
- First successful API call consumes the code

### Case 7: User Wants Refund for Failed Job
**Solution**:
- If job status = "failed", user can request refund
- Refund requires provider signature (manual process V2)
- Automatic refunds via escrow (future: Phase 3)

### Case 8: Provider Changes API Pricing
**Solution**:
- API version in spec includes price
- Price changes create new API version
- Old version deprecated but still honored for existing queue codes

---

## Configuration Architecture

### Single Config File Philosophy

Each service uses ONE config file containing ALL necessary information:
- Wallet credentials (address + private key/mnemonic)
- Token configuration
- Database credentials
- Service settings

**Example: Aggregator Config** (`~/.bob-aggregator/config.json`)
```json
{
    "wallet": {
        "address": "BxU7TLWjKKG5pF8H2V3nN9w8X3mK5qY2ZqC7vD8eR9f",
        "privateKey": [123, 45, 67, ...],  // or "mnemonic": "word1 word2..."
    },
    "token": {
        "symbol": "BOB",
        "mint": "F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH"
    },
    "database": {
        "type": "sqlite",
        "path": "/home/user/.bob-aggregator/aggregator.db"
    },
    "access": {
        "type": "paid",
        "fee": 1.0
    },
    "solana": {
        "network": "mainnet-beta",
        "rpcUrl": "https://api.mainnet-beta.solana.com"
    }
}
```

**Example: Client Config** (`~/.bob-client/config.json`)
```json
{
    "wallet": {
        "address": "7xK9mPQvN8wR5tL2cH6eF3jD4gB1sA9uY8vC2xE5pM3",
        "privateKey": [234, 56, 78, ...]
    },
    "token": {
        "symbol": "BOB",
        "mint": "F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH"
    },
    "aggregators": [
        "https://aggregator1.example.com",
        "https://aggregator2.example.com"
    ],
    "solana": {
        "network": "mainnet-beta",
        "rpcUrl": "https://api.mainnet-beta.solana.com",
        "confirmations": 3
    }
}
```

### API Definition File

Client providers define their APIs in `api.json`:

```json
{
    "apis": [
        {
            "id": "text-to-video-v1",
            "name": "Text to Video Generator",
            "description": "Generate videos from text prompts using local GPU",
            "version": "1.0.0",
            "endpoint": "/generate-video",
            "method": "POST",
            "pricing": {
                "amount": 0.5,
                "unit": "per-call"
            },
            "capacity": {
                "concurrent": 1,
                "queueMax": 5,
                "queueTimeout": 60
            },
            "execution": {
                "estimatedDuration": 300,
                "maxDuration": 600,
                "resultRetention": 86400
            },
            "schema": {
                "request": {
                    "type": "object",
                    "properties": {
                        "prompt": { "type": "string", "maxLength": 500 },
                        "duration": { "type": "number", "minimum": 5, "maximum": 30 }
                    },
                    "required": ["prompt"]
                },
                "response": {
                    "type": "object",
                    "properties": {
                        "videoUrl": { "type": "string" },
                        "duration": { "type": "number" }
                    }
                }
            }
        }
    ]
}
```

---

## CLI Usage

### Aggregator

```bash
# Install
npm install -g @bob-p2p/aggregator

# Initialize with config
bob-aggregator start --config /path/to/config.json

# Stats
bob-aggregator stats --config /path/to/config.json
```

### Client (Provider Mode)

```bash
# Install
npm install -g @bob-p2p/client

# Start provider
bob-client provide --config /path/to/config.json --apis /path/to/api.json

# View earnings
bob-client earnings --config /path/to/config.json

# View queue status
bob-client queue-status --config /path/to/config.json
```

### Client (Consumer Mode)

```bash
# Search APIs
bob-client search --config /path/to/config.json --category video

# Get API status
bob-client status <api-id> --config /path/to/config.json

# Request queue position
bob-client queue <api-id> --config /path/to/config.json

# Execute API
bob-client execute <api-id> \
  --queue-code abc123 \
  --body '{"prompt":"sunset"}' \
  --config /path/to/config.json

# Check job status
bob-client job <job-id> --config /path/to/config.json
```

---

## Data Flow Diagrams

### Provider Registration
```
Provider                    Aggregator
   |                             |
   |-- POST /api/register ------>|
   |   (API spec + signature)    |
   |                             |
   |                             |-- Verify signature
   |                             |-- Store in DB
   |                             |-- Start health checks
   |                             |
   |<----- 200 OK + API ID ------|
```

### Consumer Discovery & Execution
```
Consumer          Aggregator          Provider
   |                   |                  |
   |-- GET /search --->|                  |
   |<-- API list ------|                  |
   |                                      |
   |-- GET /api/{id}/status ------------>|
   |<-- { available: true, queue: 2 } ---|
   |                                      |
   |-- POST /api/{id}/queue ------------>|
   |<-- { code: "abc", price: 0.5 } -----|
   |                                      |
   [Makes Solana payment: 0.5 BOB]       |
   |                                      |
   |-- POST /api/{id}/execute ---------->|
   |   (code + tx signature + params)    |
   |                                     ||                                     |-- Verify payment
   |                                     |-- Verify queue code
   |                                     |-- Create job
   |                                     |
   |<-- { jobId: "xyz", status: "queued" } --|
   |                                      |
   [Wait for execution]                  |
   |                                      |
   |-- GET /jobs/{jobId} --------------->|
   |<-- { status: "processing", progress: 45% } --|
   |                                      |
   |-- GET /jobs/{jobId} --------------->|
   |<-- { status: "completed", result: {...} } --|
```

---

## Database Schema

### Aggregator Database

**apis**
- id (primary key)
- name
- description
- provider_address
- endpoint
- pricing_amount
- pricing_unit
- capacity_concurrent
- capacity_queue_max
- status (active/offline)
- last_heartbeat
- created_at
- updated_at

**access_payments**
- id (primary key)
- wallet_address
- transaction_signature
- amount
- token_mint
- paid_at

**api_stats**
- api_id
- total_calls
- success_rate
- avg_response_time
- last_used

### Client Provider Database

**jobs**
- job_id (primary key)
- api_id
- caller_address
- transaction_signature
- queue_code
- status (queued/processing/completed/failed)
- request_params
- result_data
- created_at
- started_at
- completed_at

**queue_codes**
- code (primary key)
- api_id
- wallet_address
- price
- position
- created_at
- expires_at
- used (boolean)

**earnings**
- id (primary key)
- api_id
- amount
- token_mint
- transaction_signature
- earned_at

**used_transactions**
- transaction_signature (primary key)
- used_at

---

## Security Best Practices

### Config File Security

⚠️ **WARNING**: Config files contain private keys. Treat them like passwords.

**Recommendations**:
1. **File Permissions**: `chmod 600 config.json` (read/write owner only)
2. **Never commit to git**: Add to `.gitignore`
3. **Backup securely**: Encrypted backups only
4. **Use hardware wallets**: For production with high value
5. **Environment variables**: Alternative to storing keys in files

**Example with environment variables**:
```json
{
    "wallet": {
        "address": "${WALLET_ADDRESS}",
        "privateKey": "${WALLET_PRIVATE_KEY}"
    }
}
```

### On-Chain Security

1. **Transaction Verification**:
   - Always verify on-chain, never trust client claims
   - Check amount, recipient, token mint
   - Require minimum confirmations (3 for mainnet)

2. **Replay Protection**:
   - Store all used transaction signatures
   - Check signature not already used before accepting

3. **Rate Limiting**:
   - Per IP: 100 requests/hour
   - Per wallet: 1000 requests/day
   - Queue requests: 10/minute per wallet

4. **Input Validation**:
   - Validate all API params against schema
   - Sanitize inputs to prevent injection
   - Limit payload sizes

---

## Scalability Considerations

### Provider Scaling
- Single machine: 1-10 concurrent requests (GPU-bound)
- Multiple machines: Run multiple provider instances with load balancer
- Horizontal scaling: Each machine registers APIs independently

### Aggregator Scaling
- SQLite: Good for <100k APIs
- PostgreSQL: Recommended for >100k APIs
- Read replicas: For high search traffic
- Caching: Redis for hot API listings

---

## Roadmap

### Phase 1: Core Functionality (Current)
- [x] Queue management protocol design
- [ ] Aggregator implementation
- [ ] Client provider implementation
- [ ] Client consumer implementation
- [ ] Payment verification
- [ ] Basic security measures

### Phase 2: Enhanced Features
- [ ] Reputation system
- [ ] Automatic refunds via escrow
- [ ] WebSocket for real-time job updates
- [ ] Multi-token support
- [ ] API versioning

### Phase 3: Production Ready
- [ ] Hardware wallet support
- [ ] Monitoring & alerting
- [ ] Analytics dashboard
- [ ] Rate limit configurability
- [ ] Geographic discovery

---

## Known Limitations

1. **No Automatic Refunds**: Requires manual intervention in V2
2. **No Escrow**: Direct payments, trust-based (mitigated by reputation in Phase 2)
3. **Single Token**: Config supports one token per instance
4. **Result Storage**: Provider responsible for storage, no distributed storage
5. **No Load Balancing**: Single provider per API (can run multiple instances manually)

---

## FAQ

**Q: Why separate projects instead of monorepo?**
A: Simplicity. Users running aggregator don't need client code and vice versa.

**Q: Why store private keys in config file?**
A: Simplicity for development. Production should use hardware wallets or key management systems.

**Q: What if provider goes offline mid-job?**
A: Job lost. Phase 2 will add heartbeat monitoring and automatic refunds.

**Q: Can I run multiple APIs on one provider?**
A: Yes, define multiple APIs in `api.json`. Each has independent queue management.

**Q: How do consumers know provider is legitimate?**
A: Phase 1: Trust-based. Phase 2: Reputation system, aggregator verification, user reviews.

**Q: What prevents provider from accepting payment and disappearing?**
A: Nothing in Phase 1 (trust-based). Phase 2 adds escrow and reputation penalties.

**Q: Can I use tokens other than BOB?**
A: Yes, configure any SPL token in config. Aggregator and client must use same token.

---

## Contributing

This is an experimental project. Security audits needed before production use.

**Areas needing review**:
1. Payment verification logic
2. Queue management race conditions
3. Replay attack prevention
4. DOS protection mechanisms
5. Config file security

---

## License

TBD
