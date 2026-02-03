# Aggregator Deployment Options: Cloud Functions vs Always-On VM

## TL;DR

**The aggregator CAN run as a Cloud Function**, but an always-on VM is recommended for production due to cost and performance.

---

## Aggregator Architecture Analysis

### What the Aggregator Does

The aggregator is a **stateless HTTP API server** that:

1. **Receives Provider Registrations** - `POST /api/register`
2. **Provides Search API** - `GET /api/search`
3. **Receives Heartbeats** - `POST /api/:apiId/heartbeat` (every 60 seconds from each provider)
4. **Serves API Info** - `GET /api/:apiId`
5. **Handles Updates/Deletes** - `PUT/DELETE /api/:apiId`

### Background Tasks

**None!** The aggregator has:
- ❌ No `setInterval` or `setTimeout`
- ❌ No background job processors
- ❌ No continuous loops
- ✅ Only HTTP request handlers

This makes it a **perfect candidate** for serverless deployment from a technical standpoint.

---

## Deployment Option 1: Google Cloud Functions

### Technical Feasibility: ✅ YES

The aggregator can run as a Cloud Function because:

1. **Stateless**: No in-memory state between requests
2. **Event-Driven**: Only runs when handling HTTP requests
3. **No Background Tasks**: Pure request/response pattern
4. **Database**: Using MongoDB (external) means state is persisted

### Implementation Requirements

#### 1. Database Connection
Replace the in-memory database with MongoDB:

```javascript
// src/database/mongodb.js
const { MongoClient } = require('mongodb');

class AggregatorDatabase {
    constructor(config) {
        this.client = new MongoClient(config.database.url, {
            maxPoolSize: 10,
            minPoolSize: 2,
            serverSelectionTimeoutMS: 5000
        });
        this.db = null;
    }

    async connect() {
        if (!this.db) {
            await this.client.connect();
            this.db = this.client.db(config.database.name);
        }
        return this.db;
    }

    async registerApi(apiData) {
        const db = await this.connect();
        await db.collection('apis').updateOne(
            { id: apiData.id, provider_address: apiData.provider_address },
            { $set: { ...apiData, lastSeen: new Date() } },
            { upsert: true }
        );
    }

    async searchApis(filters) {
        const db = await this.connect();
        const query = {};

        if (filters.category) {
            query.category = { $in: filters.category };
        }
        if (filters.tags) {
            query.tags = { $in: filters.tags };
        }
        if (filters.maxPrice) {
            query['pricing.amount'] = { $lte: filters.maxPrice };
        }

        return await db.collection('apis')
            .find(query)
            .limit(filters.limit || 20)
            .skip(filters.offset || 0)
            .toArray();
    }
}
```

#### 2. Cloud Function Entry Point

```javascript
// index.js for Cloud Functions
const express = require('express');
const { loadConfig } = require('./src/utils/config');
const AggregatorDatabase = require('./src/database/mongodb');
const SolanaManager = require('./src/solana');
const AggregatorServer = require('./src/server');

// Initialize once (cached between invocations)
let server;

async function initialize() {
    if (!server) {
        const config = loadConfig(process.env.CONFIG_PATH || './config.json');
        const database = new AggregatorDatabase(config);
        await database.connect();
        const solana = new SolanaManager(config);
        server = new AggregatorServer(database, solana, config);
    }
    return server;
}

// Cloud Function HTTP entry point
exports.aggregator = async (req, res) => {
    const srv = await initialize();
    srv.app(req, res);
};
```

#### 3. Deployment

```bash
gcloud functions deploy bob-aggregator \
    --runtime nodejs18 \
    --trigger-http \
    --allow-unauthenticated \
    --memory 512MB \
    --timeout 60s \
    --min-instances 0 \
    --max-instances 10 \
    --entry-point aggregator \
    --set-env-vars MONGODB_URL="mongodb+srv://...",CONFIG_PATH="config.json"
```

### Pros of Cloud Functions

✅ **No Infrastructure Management**
- No VM to maintain
- Automatic scaling
- No patching or updates

✅ **Cost Efficient for Low Traffic**
- Pay only for invocations
- No cost when idle
- Free tier: 2M invocations/month

✅ **Built-in Reliability**
- Automatic retries
- Multi-region deployment
- Health checks included

### Cons of Cloud Functions

❌ **Cold Start Latency**
- First request after idle: 1-3 seconds delay
- Problem for user-facing search
- Heartbeats from providers would keep it warm, but not guaranteed

❌ **Higher Cost at Scale**
- Heartbeats from 100 providers = 144,000 invocations/day
- Search requests add more
- Could exceed $50-100/month quickly

❌ **Connection Limits**
- MongoDB Atlas has connection limits
- Cloud Functions spawn new instances
- Need careful connection pooling

❌ **Debugging Complexity**
- Harder to debug production issues
- Can't SSH in
- Limited logging visibility

❌ **Timeout Constraints**
- Max 60 seconds per request (configurable up to 540s for 2nd gen)
- Not an issue for aggregator, but good to know

---

## Deployment Option 2: Always-On VM (Recommended)

### Why VM is Better for Production

#### Cost Comparison

**Cloud Functions** (100 providers, 100 searches/hour):
- Heartbeats: 144,000 invocations/day × 30 days = 4.3M invocations/month
- Searches: 2,400 invocations/day × 30 days = 72K invocations/month
- Total: ~4.4M invocations/month
- Cost: ~$15-30/month (depending on memory/CPU time)
- **Plus** MongoDB Atlas: $9-57/month

**e2-micro VM** (Google Cloud):
- 0.25 vCPU, 1GB RAM
- Cost: ~$7.50/month
- MongoDB on same VM: Free (self-hosted)
- **OR** MongoDB Atlas: $9-57/month
- **Total**: $7.50-64.50/month (with external DB)
- **Total**: $7.50/month (with local SQLite or MongoDB)

#### Performance Comparison

| Metric | Cloud Functions | VM |
|--------|----------------|-----|
| **Cold Start** | 1-3 seconds | 0ms |
| **Warm Request** | 10-50ms | 5-20ms |
| **Consistency** | Variable | Predictable |
| **Connection Pooling** | Complex | Simple |

#### Operational Comparison

| Aspect | Cloud Functions | VM |
|--------|----------------|-----|
| **Setup** | Complex (serverless config) | Simple (npm start) |
| **Debugging** | Harder (logs only) | Easier (SSH, logs, metrics) |
| **Updates** | Redeploy function | Git pull, restart |
| **Monitoring** | Cloud Logging | Your choice |
| **Control** | Limited | Full |

### Recommended VM Setup

#### Option A: Google Cloud e2-micro (Free Tier Eligible)

```bash
# Create VM
gcloud compute instances create bob-aggregator \
    --machine-type e2-micro \
    --image-family ubuntu-2204-lts \
    --image-project ubuntu-os-cloud \
    --boot-disk-size 10GB \
    --zone us-central1-a

# SSH and setup
gcloud compute ssh bob-aggregator

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
cd /opt
sudo git clone https://github.com/yourrepo/bob-p2p.git
cd bob-p2p/bob-p2p-aggregator
sudo npm install

# Setup systemd service
sudo nano /etc/systemd/system/bob-aggregator.service
```

**Service file** (`/etc/systemd/system/bob-aggregator.service`):
```ini
[Unit]
Description=Bob P2P Aggregator
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/bob-p2p/bob-p2p-aggregator
ExecStart=/usr/bin/node src/index.js --config config.json
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
# Start service
sudo systemctl enable bob-aggregator
sudo systemctl start bob-aggregator
sudo systemctl status bob-aggregator
```

**Cost**: Free tier includes 1 e2-micro instance per month

#### Option B: MongoDB Atlas + Small VM

- **VM**: e2-small ($13/month) or e2-micro (free tier)
- **MongoDB Atlas**: M0 cluster (free tier, 512MB)
- **Total**: $0-13/month

---

## Hybrid Approach: Cloud Run (Best of Both Worlds)

### What is Cloud Run?

- Managed containerized applications
- Scales to zero (like Cloud Functions)
- Always-on option available
- Faster cold starts than Cloud Functions
- Better for HTTP services

### Cloud Run Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8080

CMD ["node", "src/index.js", "--config", "config.json"]
```

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT_ID/bob-aggregator
gcloud run deploy bob-aggregator \
    --image gcr.io/PROJECT_ID/bob-aggregator \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --min-instances 1 \
    --max-instances 10 \
    --memory 512Mi \
    --cpu 1
```

### Cloud Run Pricing

- **Min instances = 0**: Pay per request (like Cloud Functions)
- **Min instances = 1**: $10-15/month for always-on
- Better cold starts than Cloud Functions
- More flexible than VMs

---

## Recommendation Matrix

| Use Case | Recommended Deployment |
|----------|----------------------|
| **Development/Testing** | Local (npm start) |
| **Small Production (<10 providers)** | e2-micro VM (free tier) + SQLite |
| **Medium Production (10-100 providers)** | e2-small VM + MongoDB Atlas M0 (free) |
| **Large Production (100+ providers)** | Cloud Run (min-instances=1) + MongoDB Atlas M2+ |
| **Enterprise (1000+ providers)** | Kubernetes + PostgreSQL + Redis |

---

## Decision Factors

### Choose Cloud Functions If:
- You want **zero infrastructure management**
- Traffic is **very low and unpredictable**
- You're comfortable with **cold starts**
- You already have **MongoDB Atlas**

### Choose Always-On VM If:
- You want **predictable performance**
- You want **lowest cost for constant traffic**
- You want **full control** and easy debugging
- You want to use **SQLite** or self-hosted DB

### Choose Cloud Run If:
- You want **best of both worlds**
- You want **containerized deployment**
- You want **option to scale to zero OR always-on**
- You want **better cold starts than Cloud Functions**

---

## Final Recommendation

**For your use case (MongoDB on separate server):**

### Best Option: Cloud Run with Min Instances = 1

**Why:**
1. **No cold starts** (min-instances=1)
2. **Easy deployment** (containerized)
3. **Scales automatically** if traffic grows
4. **Reasonable cost** (~$10-15/month)
5. **Works perfectly with external MongoDB**
6. **Better than Cloud Functions** for your traffic pattern
7. **Better than VM** for ease of management

### Second Best: e2-micro VM

**Why:**
1. **Cheapest** (free tier)
2. **Simple setup**
3. **Full control**
4. **Perfect for learning/testing**

---

## Summary

**Your Question**: Can I deploy aggregator as Google Cloud Function with MongoDB?

**Answer**:
- ✅ **Technically: YES** - The aggregator has no background tasks and can run serverless
- ⚠️ **Practically: NOT RECOMMENDED** - Cold starts and cost make it suboptimal
- ✅ **Best Choice: Cloud Run (min-instances=1)** - Same benefits without the downsides
- ✅ **Budget Choice: e2-micro VM** - Free tier, predictable, simple

The aggregator's architecture is serverless-friendly, but the constant heartbeat traffic from providers means an always-warm service (Cloud Run or VM) is more cost-effective and performant.
