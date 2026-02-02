# Bob P2P Client - Technical Specifications

## Purpose

The Client serves dual roles:
1. **Provider Mode**: Run APIs locally, manage queues, verify payments, execute jobs
2. **Consumer Mode**: Discover APIs, request queue positions, pay, and call APIs

---

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────┐
│                    Client Application                    │
└───────────┬─────────────────────────┬───────────────────┘
            │                         │
    ┌───────▼────────┐        ┌──────▼─────────┐
    │ Provider Mode  │        │ Consumer Mode  │
    └───────┬────────┘        └──────┬─────────┘
            │                         │
┌───────────▼───────────┐    ┌────────▼─────────────┐
│   HTTP API Server     │    │  Aggregator Client   │
│   (Provider APIs)     │    │  (Search & Discovery)│
└───────┬───────────────┘    └────────┬─────────────┘
        │                              │
┌───────▼──────────┐          ┌────────▼──────────┐
│  Queue Manager   │          │  Payment Manager  │
│  Rate Limiter    │          │  (Solana)         │
└───────┬──────────┘          └────────┬──────────┘
        │                              │
┌───────▼──────────────────────────────▼──────────┐
│              SQLite Database                     │
│  (Jobs, Queue Codes, Earnings, Transactions)    │
└─────────────────────────────────────────────────┘
```

---

## Configuration

### Config File Schema

**Location**: User-specified via `--config` flag

**Schema** (`config.json`):
```json
{
    "wallet": {
        "address": "string (Solana public key)",
        "privateKey": "number[] | string (byte array or base58)"
    },
    "token": {
        "symbol": "string",
        "mint": "string (SPL token mint)"
    },
    "aggregators": [
        "string (aggregator URLs)"
    ],
    "solana": {
        "network": "mainnet-beta | devnet | testnet",
        "rpcUrl": "string",
        "confirmations": 3
    },
    "provider": {
        "enabled": true,
        "port": 8000,
        "host": "0.0.0.0",
        "publicEndpoint": "https://my-provider.example.com",
        "database": {
            "path": "/path/to/provider.db"
        },
        "queue": {
            "codeExpiry": 60,
            "maxConcurrent": 2,
            "maxQueueLength": 10
        },
        "results": {
            "retention": 86400,
            "storagePath": "/path/to/results"
        }
    },
    "consumer": {
        "enabled": true,
        "timeout": 30000,
        "retryAttempts": 3
    },
    "security": {
        "rateLimit": {
            "enabled": true,
            "queueRequestsPerMinute": 10
        }
    }
}
```

### Example Configs

**Provider Only** (Running ML APIs):
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
    "aggregators": [
        "https://aggregator1.example.com"
    ],
    "solana": {
        "network": "mainnet-beta",
        "rpcUrl": "https://api.mainnet-beta.solana.com",
        "confirmations": 3
    },
    "provider": {
        "enabled": true,
        "port": 8000,
        "host": "0.0.0.0",
        "publicEndpoint": "https://my-provider.example.com",
        "database": {
            "path": "/home/user/.bob-client/provider.db"
        },
        "queue": {
            "codeExpiry": 60,
            "maxConcurrent": 2,
            "maxQueueLength": 10
        },
        "results": {
            "retention": 86400,
            "storagePath": "/home/user/.bob-client/results"
        }
    },
    "consumer": {
        "enabled": false
    }
}
```

**Consumer Only** (Calling APIs):
```json
{
    "wallet": {
        "address": "BxU7TLWjKKG5pF8H2V3nN9w8X3mK5qY2ZqC7vD8eR9f",
        "privateKey": [/* byte array */]
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
    },
    "provider": {
        "enabled": false
    },
    "consumer": {
        "enabled": true,
        "timeout": 30000,
        "retryAttempts": 3
    }
}
```

**Both Provider & Consumer**:
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
    "aggregators": ["https://aggregator.example.com"],
    "solana": {
        "network": "mainnet-beta",
        "rpcUrl": "https://api.mainnet-beta.solana.com",
        "confirmations": 3
    },
    "provider": {
        "enabled": true,
        "port": 8000,
        "publicEndpoint": "https://my-provider.example.com",
        "database": {
            "path": "/home/user/.bob-client/provider.db"
        }
    },
    "consumer": {
        "enabled": true
    }
}
```

---

## API Definition File (Provider Mode)

### File: `api.json`

**Location**: User-specified via `--apis` flag

**Schema**:
```json
{
    "apis": [
        {
            "id": "string (unique identifier)",
            "name": "string",
            "description": "string",
            "version": "string (semver)",
            "endpoint": "string (path, e.g., /generate)",
            "method": "GET | POST | PUT | DELETE",
            "handler": "string (module path to handler function)",
            "pricing": {
                "amount": number,
                "unit": "per-call | per-unit | tiered | free"
            },
            "capacity": {
                "concurrent": number,
                "queueMax": number,
                "queueTimeout": number
            },
            "execution": {
                "estimatedDuration": number,
                "maxDuration": number,
                "resultRetention": number
            },
            "schema": {
                "request": { /* JSON Schema */ },
                "response": { /* JSON Schema */ }
            },
            "category": ["string"],
            "tags": ["string"]
        }
    ]
}
```

### Example `api.json`

```json
{
    "apis": [
        {
            "id": "text-to-video-v1",
            "name": "Text to Video Generator",
            "description": "Generate videos from text prompts using Stable Diffusion Video",
            "version": "1.0.0",
            "endpoint": "/generate-video",
            "method": "POST",
            "handler": "./handlers/video-generator.js",
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
                        "prompt": {
                            "type": "string",
                            "maxLength": 500,
                            "description": "Text description of desired video"
                        },
                        "duration": {
                            "type": "number",
                            "minimum": 5,
                            "maximum": 30,
                            "description": "Video duration in seconds"
                        },
                        "fps": {
                            "type": "number",
                            "enum": [24, 30],
                            "default": 24
                        }
                    },
                    "required": ["prompt"]
                },
                "response": {
                    "type": "object",
                    "properties": {
                        "videoUrl": {
                            "type": "string",
                            "description": "URL to download generated video"
                        },
                        "duration": {
                            "type": "number"
                        },
                        "resolution": {
                            "type": "string"
                        }
                    }
                }
            },
            "category": ["ml", "video"],
            "tags": ["stable-diffusion", "video", "generation", "ai"]
        },
        {
            "id": "image-gen-v2",
            "name": "Stable Diffusion XL",
            "description": "High-quality image generation",
            "version": "2.0.0",
            "endpoint": "/generate-image",
            "method": "POST",
            "handler": "./handlers/image-generator.js",
            "pricing": {
                "amount": 0.1,
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
            "schema": {
                "request": {
                    "type": "object",
                    "properties": {
                        "prompt": { "type": "string", "maxLength": 500 },
                        "negativePrompt": { "type": "string", "maxLength": 500 },
                        "steps": { "type": "number", "minimum": 20, "maximum": 100, "default": 50 },
                        "width": { "type": "number", "enum": [512, 768, 1024], "default": 1024 },
                        "height": { "type": "number", "enum": [512, 768, 1024], "default": 1024 }
                    },
                    "required": ["prompt"]
                },
                "response": {
                    "type": "object",
                    "properties": {
                        "imageUrl": { "type": "string" },
                        "seed": { "type": "number" }
                    }
                }
            },
            "category": ["ml", "image"],
            "tags": ["stable-diffusion", "sdxl", "image", "generation"]
        }
    ]
}
```

### API Handler Functions

**Handler Module Format** (`./handlers/video-generator.js`):

```javascript
/**
 * API handler function
 * @param {object} params - Request parameters (validated against schema)
 * @param {object} context - Execution context
 * @returns {Promise<object>} - Response (validated against response schema)
 */
module.exports = async function generateVideo(params, context) {
    const { prompt, duration = 10, fps = 24 } = params;
    const { jobId, updateProgress } = context;

    // Update progress (optional)
    await updateProgress(10, 'Initializing model...');

    // Your ML model logic here
    // Example: use Stable Diffusion Video, ComfyUI, etc.
    const videoPath = await runStableDiffusionVideo({
        prompt,
        duration,
        fps,
        onProgress: async (pct) => {
            await updateProgress(pct, `Generating frame ${Math.floor(pct * duration * fps / 100)}...`);
        }
    });

    await updateProgress(90, 'Encoding video...');

    // Save video to results storage
    const videoUrl = await context.saveResult(videoPath, 'video.mp4');

    await updateProgress(100, 'Complete');

    return {
        videoUrl,
        duration,
        resolution: '1024x576'
    };
};
```

---

## Provider Mode API Endpoints

### Public Endpoints

#### 1. Health Check
```http
GET /health

Response: 200 OK
{
    "status": "healthy",
    "apis": 2,
    "queueLength": 3,
    "activeJobs": 1
}
```

#### 2. Get API Status
```http
GET /api/{apiId}/status

Response: 200 OK
{
    "apiId": "text-to-video-v1",
    "status": "available",
    "queueLength": 3,
    "estimatedWait": 900,  // seconds
    "capacity": {
        "concurrent": 1,
        "queueMax": 5,
        "current": 1
    }
}
```

#### 3. Request Queue Position
```http
POST /api/{apiId}/queue

Headers:
  X-Wallet-Address: <consumer-wallet>

Response: 200 OK
{
    "queueCode": "abc123xyz",
    "position": 4,
    "price": 0.5,
    "expiresAt": "2026-02-01T12:35:00Z",
    "estimatedStart": "2026-02-01T12:30:00Z"
}

Error Responses:
  429 Too Many Requests (queue full)
  400 Bad Request (invalid wallet address)
```

#### 4. Execute API
```http
POST /api/{apiId}/execute

Headers:
  Content-Type: application/json
  X-Queue-Code: abc123xyz
  X-Transaction-Signature: 5x7K9m...
  X-Caller-Address: BxU7...
  X-Expected-Amount: 0.5
  X-Token-Mint: F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH

Body:
{
    "prompt": "sunset over mountains",
    "duration": 15,
    "fps": 30
}

Response: 202 Accepted
{
    "jobId": "job-xyz789",
    "status": "queued",
    "estimatedCompletion": "2026-02-01T12:35:00Z",
    "pollUrl": "/api/jobs/job-xyz789"
}

Error Responses:
  400 Bad Request (invalid params)
  401 Unauthorized (invalid queue code)
  402 Payment Required (payment verification failed)
  409 Conflict (queue code already used)
```

#### 5. Get Job Status
```http
GET /api/jobs/{jobId}

Response: 200 OK
{
    "jobId": "job-xyz789",
    "apiId": "text-to-video-v1",
    "status": "processing",
    "progress": 45,
    "progressMessage": "Generating frame 135...",
    "estimatedCompletion": "2026-02-01T12:33:00Z",
    "createdAt": "2026-02-01T12:25:00Z",
    "startedAt": "2026-02-01T12:28:00Z"
}

// When complete:
{
    "jobId": "job-xyz789",
    "status": "completed",
    "progress": 100,
    "result": {
        "videoUrl": "https://my-provider.example.com/results/job-xyz789/video.mp4",
        "duration": 15,
        "resolution": "1024x576"
    },
    "completedAt": "2026-02-01T12:35:00Z",
    "expiresAt": "2026-02-02T12:35:00Z"
}

// If failed:
{
    "jobId": "job-xyz789",
    "status": "failed",
    "error": "GPU out of memory",
    "failedAt": "2026-02-01T12:30:00Z"
}
```

#### 6. Download Result
```http
GET /results/{jobId}/{filename}

Response: 200 OK
Content-Type: video/mp4
Content-Disposition: attachment; filename="video.mp4"

[binary data]

Error Responses:
  404 Not Found (job not found or result expired)
```

### Admin Endpoints

#### 7. Queue Status
```http
GET /admin/queue

Response: 200 OK
{
    "apis": [
        {
            "apiId": "text-to-video-v1",
            "queueLength": 3,
            "activeJobs": 1,
            "queue": [
                {
                    "queueCode": "abc123",
                    "position": 1,
                    "walletAddress": "BxU7...",
                    "createdAt": "2026-02-01T12:25:00Z",
                    "expiresAt": "2026-02-01T12:26:00Z"
                }
            ]
        }
    ]
}
```

#### 8. Earnings
```http
GET /admin/earnings

Response: 200 OK
{
    "total": 15.5,
    "byApi": [
        {
            "apiId": "text-to-video-v1",
            "totalEarnings": 10.0,
            "callCount": 20
        },
        {
            "apiId": "image-gen-v2",
            "totalEarnings": 5.5,
            "callCount": 55
        }
    ],
    "recent": [
        {
            "jobId": "job-xyz789",
            "apiId": "text-to-video-v1",
            "amount": 0.5,
            "transactionSignature": "5x7K9m...",
            "earnedAt": "2026-02-01T12:25:00Z"
        }
    ]
}
```

---

## Consumer Mode Operations

### 1. Search APIs

**CLI**: `bob-client search --category ml --tags video --max-price 1.0`

**Flow**:
1. Query all configured aggregators in parallel
2. Merge results
3. Filter duplicates
4. Sort by price/rating
5. Display results

**Output**:
```
Found 5 API(s):

1. Text to Video Generator (text-to-video-v1)
   Provider: https://provider1.example.com
   Price: 0.5 BOB per call
   Queue: 3 waiting, ~15 min wait
   Category: ml, video
   Tags: stable-diffusion, video, generation

2. Stable Diffusion XL (image-gen-v2)
   Provider: https://provider2.example.com
   Price: 0.1 BOB per call
   Queue: 1 waiting, ~2 min wait
   Category: ml, image
   Tags: sdxl, image, generation
```

### 2. Check API Status

**CLI**: `bob-client status text-to-video-v1`

**Flow**:
1. Get API details from aggregator
2. Query provider's `/api/{id}/status` endpoint
3. Display current availability

**Output**:
```
API: Text to Video Generator
Status: Available
Queue: 3 waiting
Estimated wait: 15 minutes
Price: 0.5 BOB
Provider: https://provider1.example.com
```

### 3. Request Queue Position

**CLI**: `bob-client queue text-to-video-v1`

**Flow**:
1. Send POST to provider's `/api/{id}/queue`
2. Receive queue code + price
3. Save locally for next step
4. Display to user

**Output**:
```
Queue position reserved!

Queue Code: abc123xyz
Position: 4
Price: 0.5 BOB
Expires: 2026-02-01 12:35:00 (60 seconds)
Estimated start: 2026-02-01 12:30:00

Next: Make payment and execute API
  bob-client execute text-to-video-v1 --queue-code abc123xyz --body '{"prompt":"..."}'
```

### 4. Execute API (Pay + Call)

**CLI**: `bob-client execute text-to-video-v1 --queue-code abc123xyz --body '{"prompt":"sunset over mountains","duration":15}'`

**Flow**:
1. Load queue code details (price, provider endpoint)
2. Create Solana transaction:
   - Transfer `price` tokens to provider wallet
   - Wait for confirmations
3. Get transaction signature
4. Call provider's `/api/{id}/execute`:
   - Headers: queue code, transaction sig, caller address, expected amount
   - Body: API parameters
5. Receive job ID
6. Save job ID locally
7. Display to user

**Output**:
```
Making payment: 0.5 BOB to 7xK9mPQ...
Transaction sent: 5x7K9mWq...
Waiting for confirmation... ✓ (3 confirmations)

Executing API...
Job created: job-xyz789
Status: queued
Estimated completion: 2026-02-01 12:35:00

Poll for results:
  bob-client job job-xyz789
```

### 5. Poll Job Status

**CLI**: `bob-client job job-xyz789`

**Flow**:
1. Query provider's `/api/jobs/{jobId}` endpoint
2. Display status + progress
3. If complete, show result
4. Optionally download result

**Output (in progress)**:
```
Job: job-xyz789
API: Text to Video Generator
Status: processing
Progress: 45%
Message: Generating frame 135...
Estimated completion: 2026-02-01 12:33:00
```

**Output (complete)**:
```
Job: job-xyz789
Status: ✓ Completed
Result:
  Video URL: https://provider1.example.com/results/job-xyz789/video.mp4
  Duration: 15 seconds
  Resolution: 1024x576

Download:
  bob-client download job-xyz789 --output video.mp4
```

### 6. Download Result

**CLI**: `bob-client download job-xyz789 --output video.mp4`

**Flow**:
1. Get job details (result URLs)
2. Download files from provider
3. Save to specified path

**Output**:
```
Downloading from https://provider1.example.com/results/job-xyz789/video.mp4...
Progress: [====================] 100% (15.2 MB)
Saved to: video.mp4
```

---

## Database Schema (Provider Mode)

### SQLite Schema

```sql
-- Queue codes issued to consumers
CREATE TABLE queue_codes (
    code TEXT PRIMARY KEY,
    api_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    price REAL NOT NULL,
    token_mint TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT 0
);

CREATE INDEX idx_queue_api ON queue_codes(api_id);
CREATE INDEX idx_queue_expires ON queue_codes(expires_at);
CREATE INDEX idx_queue_wallet ON queue_codes(wallet_address);

-- Jobs (API executions)
CREATE TABLE jobs (
    job_id TEXT PRIMARY KEY,
    api_id TEXT NOT NULL,
    queue_code TEXT,
    caller_address TEXT NOT NULL,
    transaction_signature TEXT UNIQUE NOT NULL,

    -- Request
    request_params TEXT NOT NULL,  -- JSON

    -- Execution
    status TEXT DEFAULT 'queued',  -- queued | processing | completed | failed
    progress INTEGER DEFAULT 0,
    progress_message TEXT,

    -- Result
    result_data TEXT,  -- JSON
    result_files TEXT,  -- JSON array of file paths
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP,  -- When result files will be deleted

    FOREIGN KEY (queue_code) REFERENCES queue_codes(code)
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_api ON jobs(api_id);
CREATE INDEX idx_jobs_created ON jobs(created_at);

-- Used transaction signatures (replay protection)
CREATE TABLE used_transactions (
    transaction_signature TEXT PRIMARY KEY,
    job_id TEXT,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

-- Earnings tracking
CREATE TABLE earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    amount REAL NOT NULL,
    token_mint TEXT NOT NULL,
    transaction_signature TEXT NOT NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

CREATE INDEX idx_earnings_api ON earnings(api_id);
CREATE INDEX idx_earnings_earned ON earnings(earned_at);

-- API statistics
CREATE TABLE api_stats (
    api_id TEXT PRIMARY KEY,
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    failed_calls INTEGER DEFAULT 0,
    total_earnings REAL DEFAULT 0,
    avg_execution_time INTEGER DEFAULT 0,  -- seconds
    last_called TIMESTAMP
);
```

---

## Business Logic

### Queue Management

**Queue Code Generation**:
1. Consumer requests queue position
2. Provider checks:
   - API exists
   - Queue not full (queueLength < queueMax)
   - Wallet not rate-limited
3. Generate unique queue code (UUID or random string)
4. Calculate position = current queue length + 1
5. Set expiry = now + queueTimeout seconds
6. Insert into queue_codes table
7. Return code, position, price, expiry

**Queue Processing**:
1. Jobs are processed in FIFO order
2. When slot available (activeJobs < concurrent):
   - Select oldest job with status = 'queued'
   - Set status = 'processing'
   - Execute handler function
   - Update progress during execution
   - Save result files
   - Set status = 'completed'
   - Calculate expiry = now + resultRetention

**Queue Code Expiry**:
- Background job runs every 10 seconds
- Delete queue codes where:
  - expires_at < now
  - AND used = false
- This frees up queue positions

### Payment Verification

**Process**:
1. Extract headers from execute request:
   - X-Queue-Code
   - X-Transaction-Signature
   - X-Caller-Address
   - X-Expected-Amount
   - X-Token-Mint

2. Validate queue code:
   - Exists in database
   - Not expired (expires_at > now)
   - Not used (used = false)
   - Matches caller wallet address

3. Verify transaction on-chain:
   ```javascript
   const tx = await connection.getTransaction(signature, {
       commitment: 'confirmed'
   });

   // Check confirmations
   if (tx.slot + config.confirmations > currentSlot) {
       return false;
   }

   // Check amount, recipient, token
   // Parse transfer instruction from tx
   const transfer = parseTransferInstruction(tx);

   if (transfer.amount < expectedAmount) return false;
   if (transfer.recipient !== providerWallet) return false;
   if (transfer.tokenMint !== config.tokenMint) return false;
   ```

4. Check replay (transaction not already used):
   ```sql
   SELECT * FROM used_transactions
   WHERE transaction_signature = ?
   ```

5. If all valid:
   - Mark queue code as used
   - Insert into used_transactions
   - Create job record
   - Record earning
   - Return job ID

### Job Execution

**Async Execution Flow**:
1. Job created with status = 'queued'
2. Queue processor picks up job when slot available
3. Load API handler module
4. Validate request params against schema
5. Call handler function:
   ```javascript
   const context = {
       jobId,
       updateProgress: async (pct, msg) => {
           await db.updateJobProgress(jobId, pct, msg);
       },
       saveResult: async (filePath, filename) => {
           const resultPath = path.join(resultsDir, jobId, filename);
           await fs.copy(filePath, resultPath);
           return `${publicEndpoint}/results/${jobId}/${filename}`;
       }
   };

   const result = await handler(params, context);
   ```
6. Validate result against response schema
7. Save result to database
8. Set status = 'completed'
9. Set expires_at = now + resultRetention

**Error Handling**:
- If handler throws:
  - Set status = 'failed'
  - Save error message
  - Do NOT refund automatically (manual process)

### Result Storage & Cleanup

**Storage**:
- Results saved to `{storagePath}/{jobId}/`
- Files can be images, videos, JSON, etc.
- URLs returned in result

**Cleanup**:
- Background job runs every hour
- Delete jobs where:
  - status = 'completed'
  - expires_at < now
- Delete associated files from storage

### Rate Limiting

**Queue Requests**:
- Per wallet: max 10 queue requests per minute
- Prevents queue squatting attacks
- Track in-memory (sliding window)

**API Calls**:
- Limited by queue system (cannot bypass queue)
- No additional rate limiting needed

---

## Security

### Attack Vectors & Mitigations

#### 1. Payment Replay
**Attack**: Reuse same transaction for multiple jobs

**Mitigation**:
- Store all used transaction signatures
- Check before accepting payment
- Return 402 if already used

#### 2. Queue Squatting
**Attack**: Request many queue codes to DOS

**Mitigation**:
- Rate limit queue requests per wallet
- Queue codes expire quickly (60s)
- Require small deposit for queue reservation (Phase 2)

#### 3. Front-Running
**Attack**: Monitor mempool, steal queue position

**Mitigation**:
- Queue code tied to specific wallet address
- Only matching wallet can use code
- Signature verification on execute

#### 4. Price Manipulation
**Attack**: Provider changes price after queue code issued

**Mitigation**:
- Price locked in queue code
- Execute request includes expected amount
- If mismatch, reject

#### 5. Invalid Params
**Attack**: Send malicious input to exploit handler

**Mitigation**:
- Validate all params against JSON schema
- Sanitize inputs
- Sandbox handler execution (Phase 2)

#### 6. Result Tampering
**Attack**: Provider returns fake results

**Mitigation**:
- Results can be hashed and verified (Phase 2)
- Reputation system tracks quality (Phase 2)

---

## CLI Commands

### Provider Mode

```bash
# Start provider
bob-client provide --config config.json --apis api.json

# Register APIs with aggregator
bob-client register --config config.json --aggregator https://aggregator.com

# Send heartbeat to aggregator
bob-client heartbeat --config config.json

# View queue status
bob-client queue-status --config config.json

# View earnings
bob-client earnings --config config.json

# View job history
bob-client jobs --config config.json --limit 20

# Clear expired results
bob-client cleanup --config config.json
```

### Consumer Mode

```bash
# Search APIs
bob-client search --config config.json --category ml --tags video

# Get API info
bob-client info <api-id> --config config.json

# Check API status
bob-client status <api-id> --config config.json

# Request queue position
bob-client queue <api-id> --config config.json

# Execute API (pay + call)
bob-client execute <api-id> \
  --queue-code abc123xyz \
  --body '{"prompt":"sunset"}' \
  --config config.json

# Check job status
bob-client job <job-id> --config config.json

# Download result
bob-client download <job-id> --output result.mp4 --config config.json

# Check wallet balance
bob-client balance --config config.json
```

---

## Testing

### Unit Tests
- Config loading/validation
- API definition parsing
- Queue code generation
- Payment verification
- Schema validation
- Handler loading

### Integration Tests
- Queue request → execute → poll flow
- Payment verification with mock Solana
- Job execution with mock handlers
- Result storage and cleanup
- Rate limiting

### End-to-End Tests
- Consumer searches APIs
- Consumer requests queue
- Consumer pays and executes
- Provider processes job
- Consumer polls and downloads result

---

## Future Enhancements

### Phase 2
- Escrow payments (automatic refunds)
- Result verification (hashes)
- Sandboxed handler execution
- WebSocket for real-time job updates
- Multi-step jobs (pipelines)

### Phase 3
- Distributed result storage (IPFS)
- Cross-chain payments
- GPU utilization metrics
- Auto-scaling (multiple provider instances)
- Load balancing

---

## Appendix

### Example Handler: Image Generator

```javascript
// handlers/image-generator.js
const { StableDiffusionPipeline } = require('@huggingface/diffusers');

let pipeline = null;

async function loadModel() {
    if (!pipeline) {
        pipeline = await StableDiffusionPipeline.fromPretrained(
            'stabilityai/stable-diffusion-xl-base-1.0',
            { device: 'cuda' }
        );
    }
    return pipeline;
}

module.exports = async function generateImage(params, context) {
    const { prompt, negativePrompt = '', steps = 50, width = 1024, height = 1024 } = params;
    const { jobId, updateProgress, saveResult } = context;

    await updateProgress(10, 'Loading model...');
    const pipe = await loadModel();

    await updateProgress(20, 'Generating image...');

    const result = await pipe.run({
        prompt,
        negativePrompt,
        numInferenceSteps: steps,
        width,
        height,
        onProgress: (step, totalSteps) => {
            const pct = 20 + (step / totalSteps) * 70;
            updateProgress(pct, `Step ${step}/${totalSteps}`);
        }
    });

    await updateProgress(90, 'Saving result...');

    const imagePath = `/tmp/${jobId}.png`;
    await result.images[0].save(imagePath);

    const imageUrl = await saveResult(imagePath, 'image.png');

    await updateProgress(100, 'Complete');

    return {
        imageUrl,
        seed: result.seed
    };
};
```

---

## Support

See main project README for issues, questions, and contributions.
