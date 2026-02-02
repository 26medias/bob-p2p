# Security Analysis & Edge Cases

**Comprehensive list of potential issues, exploits, and mitigations for Bob P2P API Network V2**

---

## Critical Security Vulnerabilities

### 1. Payment Replay Attack
**Severity**: CRITICAL

**Attack**:
- Attacker captures valid transaction signature
- Reuses signature for multiple API calls
- Gets free API executions after initial payment

**Mitigation**:
- Store all used transaction signatures in database (UNIQUE constraint)
- Check if signature already used before accepting
- Return 409 Conflict if duplicate detected

**Implementation**:
```sql
CREATE TABLE used_transactions (
    transaction_signature TEXT PRIMARY KEY,
    job_id TEXT,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Before accepting payment
SELECT * FROM used_transactions WHERE transaction_signature = ?;
```

### 2. Queue Squatting / DOS Attack
**Severity**: HIGH

**Attack**:
- Malicious actor requests hundreds of queue positions
- Never pays or executes
- Legitimate users blocked from accessing API

**Mitigation**:
- Queue codes expire quickly (60 seconds default)
- Rate limit queue requests per wallet (10/minute)
- Rate limit by IP address (100/minute)
- Background cleanup removes expired codes
- Optional: Require small deposit for queue reservation (refunded on use)

**Implementation**:
```javascript
// Rate limiter
const queueLimiter = new RateLimiterMemory({
    points: 10,      // 10 requests
    duration: 60,    // per minute
    blockDuration: 300  // block for 5 min if exceeded
});

await queueLimiter.consume(walletAddress);
```

### 3. Price Manipulation
**Severity**: HIGH

**Attack**:
- Provider issues queue code with price = 0.5 BOB
- Consumer starts payment process
- Provider changes API price to 1.0 BOB
- Consumer's payment now insufficient

**Mitigation**:
- Lock price when queue code generated
- Store price in queue code record
- Verify payment amount >= locked price (not current price)
- Queue code includes price hash for verification

**Implementation**:
```javascript
// When issuing queue code
const queueCode = {
    code: uuid(),
    price: currentPrice,
    priceHash: sha256(currentPrice + timestamp),
    expiresAt: now + 60
};

// When verifying payment
if (paymentAmount < queueCode.price) {
    return 402; // Payment insufficient
}
```

### 4. Front-Running
**Severity**: MEDIUM

**Attack**:
- Attacker monitors Solana mempool
- Sees pending payment for queue code
- Submits higher-fee transaction to steal queue position

**Mitigation**:
- Queue code tied to specific wallet address
- Only matching wallet can execute with code
- Verify caller address matches queue code owner
- Signature verification prevents impersonation

**Implementation**:
```javascript
// Queue code record
{
    code: "abc123",
    walletAddress: "BxU7...",  // Locked to this wallet
    expiresAt: ...
}

// When executing
if (request.callerAddress !== queueCode.walletAddress) {
    return 401; // Unauthorized
}
```

### 5. Payment Without Execution
**Severity**: HIGH

**Attack**:
- Consumer pays provider
- Provider accepts payment
- Provider never creates job or goes offline
- Consumer loses funds

**Mitigation** (Progressive):
- **Phase 1 (V2)**:
  - Trust-based, reputation tracking
  - Payment grace period (5 minutes to create job)
  - Consumer can dispute if no job created
- **Phase 2**:
  - Escrow smart contract
  - Automatic refund if job not created within timeout
- **Phase 3**:
  - Reputation staking
  - Provider deposits collateral that's slashed for bad behavior

### 6. Result Withholding
**Severity**: MEDIUM

**Attack**:
- Provider accepts payment
- Creates job (so payment valid)
- Executes job successfully
- Never returns result or marks job complete

**Mitigation**:
- Job status must update within reasonable time (maxDuration)
- If job stuck in "processing" beyond maxDuration:
  - Automatically mark as failed
  - Enable refund request
- Reputation penalty for timeouts
- Results must be accessible for retention period

### 7. Sybil Attack (Multiple Identities)
**Severity**: MEDIUM

**Attack**:
- Create multiple wallet addresses
- Bypass rate limits by cycling through wallets
- Register fake APIs to spam aggregator

**Mitigation**:
- Rate limit by IP address (harder to bypass)
- Require small stake per wallet (burns tokens or locks them)
- Aggregator charges registration fee (discourages spam)
- Reputation tracking across wallet addresses (heuristics)

### 8. Aggregator API Spam
**Severity**: MEDIUM

**Attack**:
- Register thousands of fake APIs
- Pollute search results
- Make legitimate APIs hard to find

**Mitigation**:
- Require payment to register API (0.1-1.0 BOB)
- Signature verification (must own wallet)
- Health checks: auto-remove offline APIs
- Limit APIs per wallet address (e.g., 10 max)
- Reputation system: new APIs start hidden, become visible after verified calls

### 9. Invalid Transaction Claims
**Severity**: CRITICAL

**Attack**:
- Consumer claims to have paid (sends fake signature)
- Provider trusts client without verification
- Consumer gets free API execution

**Mitigation**:
- NEVER trust client claims
- ALWAYS verify transaction on-chain via Solana RPC
- Check amount, recipient, token mint, confirmations
- Only trust blockchain, not headers

**Implementation**:
```javascript
// WRONG - trusting client
if (request.headers['x-paid'] === 'true') {
    executeAPI(); // BAD!
}

// CORRECT - verify on-chain
const tx = await solanaConnection.getTransaction(signature);
if (!verifyTransaction(tx, expectedAmount, providerWallet)) {
    return 402; // Payment failed
}
```

### 10. Man-in-the-Middle (MITM)
**Severity**: HIGH

**Attack**:
- Attacker intercepts HTTP traffic
- Steals transaction signatures or queue codes
- Replays them to get free API access

**Mitigation**:
- Use HTTPS for all communication (TLS/SSL)
- Providers should use SSL certificates
- Consumers verify SSL certs
- Aggregators should enforce HTTPS

---

## Edge Cases

### Case 1: User Gets Queue Code But Provider Goes Offline
**Scenario**:
1. Consumer requests queue code
2. Provider issues code (expires in 60s)
3. Provider server crashes
4. Consumer tries to pay and execute

**Solution**:
- Queue code expires (no payment made, no loss)
- Consumer can try different provider
- Aggregator health checks mark provider offline
- Consumer sees API status before queueing

**Recommendation**: Consumer should check `/status` endpoint immediately before requesting queue

### Case 2: Payment Sent But Network Lag Delays Confirmation
**Scenario**:
1. Consumer sends payment transaction
2. Network congested, confirmation takes 2 minutes
3. Queue code expires after 60 seconds
4. Consumer cannot execute API

**Solution**:
- Extend queue code validity during payment window
- Grace period: queue code valid for 5 minutes if payment pending
- Provider checks if transaction exists even if queue code expired
- Consumer can retry execute with same transaction

**Implementation**:
```javascript
// Check if payment pending
if (queueCode.expiresAt < now && queueCode.expiresAt + gracePeriod > now) {
    // Check if transaction exists
    const tx = await connection.getTransaction(signature);
    if (tx && tx.blockTime > queueCode.createdAt) {
        // Allow execution
    }
}
```

### Case 3: Job Takes Longer Than Estimated
**Scenario**:
1. API estimates 5 minutes for video generation
2. Actual generation takes 15 minutes
3. Consumer thinks job failed

**Solution**:
- Estimated time is best-effort, not guaranteed
- Job status includes progress percentage
- maxDuration is hard limit (job killed if exceeded)
- Progress updates reassure consumer job is still running

### Case 4: Multiple Consumers Get Same Queue Position
**Scenario**:
1. Race condition in queue position calculation
2. Two consumers request queue at same time
3. Both get position = 5

**Solution**:
- Use database transactions with row-level locking
- Atomic increment of position counter
- UNIQUE constraint on (api_id, position) prevents duplicates

**Implementation**:
```sql
BEGIN TRANSACTION;

SELECT COUNT(*) FROM queue_codes
WHERE api_id = ? AND used = 0;
-- position = count + 1

INSERT INTO queue_codes (code, api_id, position, ...)
VALUES (?, ?, position, ...);

COMMIT;
```

### Case 5: Provider Runs Out of Disk Space for Results
**Scenario**:
1. Provider stores results locally
2. Disk fills up
3. Cannot save new job results

**Solution**:
- Provider monitors disk usage
- Cleanup expired results proactively
- Set queue to "unavailable" if disk >90% full
- Alert provider to increase storage
- Configuration option for max storage usage

### Case 6: Consumer Pays Wrong Amount
**Scenario**:
1. Queue code says price = 0.5 BOB
2. Consumer pays 0.3 BOB (underpayment)
3. Or consumer pays 1.0 BOB (overpayment)

**Solution**:
- Underpayment: Reject with 402 Payment Required
- Overpayment: Accept (extra is tip) OR reject (strict mode)
- Verify payment >= expected amount
- No automatic refunds for overpayment (user error)

### Case 7: Provider Updates API While Jobs Running
**Scenario**:
1. Provider running API version 1.0
2. Has 3 jobs in queue
3. Provider deploys version 2.0 (different schema)
4. Existing jobs fail due to schema mismatch

**Solution**:
- API versioning: include version in queue code
- Jobs execute against version they queued for
- Provider can run multiple versions simultaneously
- Gradual migration: deprecate old version, new queues use new version

### Case 8: Transaction Confirmed But Provider Missed It
**Scenario**:
1. Consumer pays
2. Provider queries transaction
3. Network hiccup, RPC returns "not found"
4. Provider rejects payment
5. But transaction actually confirmed

**Solution**:
- Retry transaction verification (3 attempts)
- Consumer can retry execute with same transaction
- Provider logs all verification attempts
- Manual resolution if dispute

### Case 9: Result Files Deleted Before Consumer Downloads
**Scenario**:
1. Job completes at 12:00
2. Retention = 24 hours (expires 12:00 next day)
3. Cleanup job runs at 11:55, deletes results
4. Consumer tries to download at 12:30

**Solution**:
- Set reasonable retention (minimum 24 hours)
- Warn consumer to download promptly (in job status)
- Cleanup job runs with buffer (e.g., results retained 25 hours)
- Consumer can request extension (manual, fees)

### Case 10: API Handler Crashes During Execution
**Scenario**:
1. Job starts processing
2. Handler throws uncaught exception
3. Process crashes
4. Job stuck in "processing" forever

**Solution**:
- Wrap handler in try-catch
- Set job status = "failed" on error
- Log error message
- Timeout mechanism: if no progress update for >10 minutes, mark failed
- Provider can restart failed jobs (manual)

---

## Rate Limiting Recommendations

### Aggregator

| Endpoint | Limit | Scope | Penalty |
|----------|-------|-------|---------|
| /search | 100/min | IP | 429 for 5 min |
| /search | 1000/hour | Wallet | 429 for 1 hour |
| /api/register | 10/day | Wallet | Reject new registrations |
| /api/{id} | 200/min | IP | 429 for 5 min |

### Provider (Client)

| Endpoint | Limit | Scope | Penalty |
|----------|-------|-------|---------|
| /api/{id}/queue | 10/min | Wallet | 429 for 5 min |
| /api/{id}/queue | 100/hour | IP | 429 for 1 hour |
| /api/{id}/execute | No limit | - | Enforced by queue |
| /api/jobs/{id} | 60/min | IP | 429 for 1 min |

---

## Data Validation Checklists

### Provider: Queue Request Validation
- [ ] API ID exists
- [ ] API status = "active"
- [ ] Queue not full (length < maxQueueLength)
- [ ] Wallet address valid Solana address
- [ ] Wallet not rate limited
- [ ] Generate unique queue code
- [ ] Set proper expiration time
- [ ] Return correct price from config

### Provider: Payment Verification Checklist
- [ ] Transaction signature provided
- [ ] Signature format valid (base58)
- [ ] Transaction exists on-chain
- [ ] Transaction has sufficient confirmations
- [ ] Transfer amount >= expected price
- [ ] Recipient address = provider wallet
- [ ] Token mint = configured token
- [ ] Signature not previously used (replay check)
- [ ] Queue code valid and not expired
- [ ] Queue code matches caller wallet
- [ ] Queue code not already used

### Provider: Job Execution Validation
- [ ] Request params provided
- [ ] Params match JSON schema (type, required fields)
- [ ] Params within allowed ranges (min/max)
- [ ] Handler module exists and loadable
- [ ] Sufficient disk space for results
- [ ] GPU/CPU resources available
- [ ] Job ID unique
- [ ] Job created in database
- [ ] Earnings recorded

### Aggregator: API Registration Validation
- [ ] API ID unique
- [ ] Provider address valid
- [ ] Signature verification passes
- [ ] Endpoint URL valid and reachable
- [ ] Pricing amount valid (>= 0)
- [ ] Capacity settings valid (concurrent > 0)
- [ ] JSON schemas valid
- [ ] Category and tags provided
- [ ] Health check endpoint responds

---

## Monitoring & Alerting

### Critical Alerts (Page Immediately)

**Provider**:
- Disk usage > 95%
- Payment verification failure rate > 5%
- Job failure rate > 20%
- Queue full for > 10 minutes
- Database connection lost

**Aggregator**:
- Database connection lost
- Health check failure rate > 50%
- API registration spam (>100/hour)
- Payment verification failures (if paid access)

### Warning Alerts (Review Within 1 Hour)

**Provider**:
- Disk usage > 80%
- Average job duration exceeds estimate by >50%
- Queue wait time > 30 minutes
- Failed jobs > 10% of total

**Aggregator**:
- Active APIs < 50% of registered APIs
- Search requests drop >30% from average
- Database query time > 1 second

### Info Metrics (Daily Review)

**Provider**:
- Total earnings
- Jobs completed vs failed
- Average execution time per API
- Most used APIs
- Queue statistics (avg wait, max wait)

**Aggregator**:
- Total APIs registered
- Search query patterns
- Most searched categories
- Access payments (if paid)
- Health check success rate

---

## Testing Strategy

### Security Testing

1. **Payment Replay**:
   - Execute API with valid transaction
   - Try to reuse same signature
   - Expect: 409 Conflict

2. **Invalid Payment**:
   - Send fake transaction signature
   - Expect: 402 Payment Required

3. **Queue Squatting**:
   - Request 100 queue codes rapidly
   - Expect: Rate limit after 10/min

4. **Expired Queue Code**:
   - Request queue code
   - Wait >60 seconds
   - Try to execute
   - Expect: 401 Unauthorized

5. **Wrong Wallet Execution**:
   - User A gets queue code
   - User B tries to execute with that code
   - Expect: 401 Unauthorized

### Load Testing

1. **Concurrent Consumers**:
   - 100 consumers request queue simultaneously
   - Verify queue positions unique
   - Verify no race conditions

2. **Provider Capacity**:
   - Send jobs equal to maxConcurrent
   - Verify concurrent execution limit respected
   - Verify additional jobs queued

3. **Aggregator Search**:
   - 1000 searches per second
   - Verify response time < 200ms
   - Verify no database deadlocks

### Integration Testing

1. **Full Flow**:
   - Consumer searches
   - Consumer requests queue
   - Consumer pays
   - Consumer executes
   - Provider processes
   - Consumer polls
   - Consumer downloads
   - Verify end-to-end success

2. **Failure Scenarios**:
   - Provider offline during execution
   - Payment with insufficient funds
   - Invalid API parameters
   - Handler crash during execution
   - Result cleanup before download

---

## Recommended Production Config

### Provider

```json
{
    "provider": {
        "queue": {
            "codeExpiry": 60,
            "maxConcurrent": 2,
            "maxQueueLength": 10
        },
        "results": {
            "retention": 86400,
            "maxStorageGB": 100
        },
        "security": {
            "rateLimit": {
                "queueRequestsPerMinute": 10,
                "queueRequestsPerHour": 100
            }
        }
    },
    "solana": {
        "network": "mainnet-beta",
        "rpcUrl": "https://api.mainnet-beta.solana.com",
        "confirmations": 3
    }
}
```

### Aggregator

```json
{
    "access": {
        "type": "paid",
        "fee": 1.0,
        "validityDays": 30
    },
    "health": {
        "checkInterval": 300,
        "timeout": 10,
        "maxFailures": 3
    },
    "security": {
        "rateLimit": {
            "requestsPerMinute": 100,
            "requestsPerHour": 5000
        },
        "registration": {
            "maxApisPerWallet": 10,
            "requirePayment": true,
            "registrationFee": 0.1
        }
    }
}
```

---

## Future Security Enhancements

### Phase 2
- [ ] Escrow smart contracts for automatic refunds
- [ ] Reputation system with on-chain verification
- [ ] Result integrity verification (cryptographic hashes)
- [ ] Multi-signature for high-value transactions
- [ ] Dispute resolution mechanism

### Phase 3
- [ ] Zero-knowledge proofs for privacy
- [ ] Homomorphic encryption for sensitive data
- [ ] Cross-chain payment support
- [ ] Decentralized identity (DID) integration
- [ ] Automated fraud detection (ML-based)

---

## Conclusion

This document covers the major security vulnerabilities, edge cases, and mitigations for Bob P2P API Network V2. The system is designed with security-first principles:

1. **Never trust client claims** - Always verify on-chain
2. **Atomic operations** - Use database transactions
3. **Rate limiting** - Prevent abuse
4. **Expiry mechanisms** - Auto-cleanup prevents stale state
5. **Replay protection** - Track all used transactions
6. **Signature verification** - Prevent impersonation

The queue-first protocol solves the fundamental problem of paying for unavailable capacity, while the security measures prevent common crypto exploits.

**Before production deployment**:
- [ ] Security audit by third party
- [ ] Penetration testing
- [ ] Load testing with realistic traffic
- [ ] Legal review (terms of service, liability)
- [ ] Insurance for high-value transactions
