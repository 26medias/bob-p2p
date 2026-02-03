# Cloud Run Deployment

## Why Cloud Run?

**Much faster than VM deployment:**
- VM: 10+ minutes to deploy
- Cloud Run: ~2 minutes to deploy

**Cost effective:**
- Scales to zero when not in use
- Only pay for actual requests
- Free tier: 2M requests/month
- Typical cost: $1-5/month for low traffic

**Easy management:**
- No server maintenance
- Automatic HTTPS
- Built-in load balancing
- Auto-scaling

## Quick Start

### 1. Deploy

```bash
cd /home/julien/Projects/bob-p2p/bob-p2p-aggregator
./deploy-cloud-run.sh
```

That's it! The script will:
1. Authenticate with GCP
2. Enable required APIs
3. Build Docker container
4. Deploy to Cloud Run
5. Give you a public HTTPS URL

### 2. Get Your URL

After deployment, you'll see:
```
Service URL: https://bob-aggregator-xxxxx-uc.a.run.app
```

### 3. Test

```bash
curl https://bob-aggregator-xxxxx-uc.a.run.app/health
curl https://bob-aggregator-xxxxx-uc.a.run.app/info
```

## Configuration

### Option 1: Include config.json in Container

Create `config.json` before deploying:

```bash
cp config.example.json config.json
nano config.json  # Edit with your settings
./deploy-cloud-run.sh
```

The config will be baked into the container.

### Option 2: Use Environment Variables (Advanced)

Update the aggregator code to read from env vars, then:

```bash
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --set-env-vars="WALLET_ADDRESS=xxx,WALLET_PRIVATE_KEY=yyy"
```

### Option 3: Use Secret Manager (Most Secure)

```bash
# Create secret
echo -n "your-private-key" | gcloud secrets create wallet-private-key --data-file=-

# Grant access to Cloud Run
gcloud secrets add-iam-policy-binding wallet-private-key \
    --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Update service to use secret
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --set-secrets="WALLET_PRIVATE_KEY=wallet-private-key:latest"
```

## Management

### View Logs

```bash
# Live logs
gcloud run services logs tail bob-aggregator --region=us-central1

# Recent logs
gcloud run services logs read bob-aggregator --region=us-central1 --limit=100
```

### Update Code

Just run the deploy script again:

```bash
./deploy-cloud-run.sh
```

Cloud Run does zero-downtime deployments automatically.

### Scale Settings

```bash
# Keep always warm (no cold starts, costs more)
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --min-instances=1

# Allow scaling to zero (save money)
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --min-instances=0 \
    --max-instances=10

# Increase max instances
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --max-instances=100
```

### Increase Resources

```bash
# More memory
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --memory=1Gi

# More CPU
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --cpu=2
```

### Custom Domain

```bash
# Map domain
gcloud run services add-iam-policy-binding bob-aggregator \
    --region=us-central1 \
    --member="allUsers" \
    --role="roles/run.invoker"

gcloud run domain-mappings create \
    --service=bob-aggregator \
    --region=us-central1 \
    --domain=aggregator.yourdomain.com
```

Then add DNS records as instructed.

## Monitoring

### Service Status

```bash
# Get service info
gcloud run services describe bob-aggregator --region=us-central1

# List all revisions
gcloud run revisions list --service=bob-aggregator --region=us-central1
```

### Metrics

View in Google Cloud Console:
```
https://console.cloud.google.com/run/detail/us-central1/bob-aggregator/metrics
```

Or use CLI:

```bash
# Request count
gcloud monitoring time-series list \
    --filter='metric.type="run.googleapis.com/request_count"'

# Request latencies
gcloud monitoring time-series list \
    --filter='metric.type="run.googleapis.com/request_latencies"'
```

## Cost Optimization

### Free Tier (Always Free)
- 2 million requests per month
- 360,000 vCPU-seconds per month
- 180,000 GiB-seconds of memory per month
- 1 GB network egress from North America per month

### Staying Within Free Tier

1. **Scale to zero** when not in use:
   ```bash
   gcloud run services update bob-aggregator \
       --region=us-central1 \
       --min-instances=0
   ```

2. **Use lower memory** if possible:
   ```bash
   gcloud run services update bob-aggregator \
       --region=us-central1 \
       --memory=256Mi
   ```

3. **Limit max instances**:
   ```bash
   gcloud run services update bob-aggregator \
       --region=us-central1 \
       --max-instances=10
   ```

### Cost Estimate

Assuming 100K requests/month, avg 500ms response time:

```
Requests: 100K × $0.00002400 = $2.40
vCPU: 50K seconds × $0.00001800 = $0.90
Memory: 25K GiB-seconds × $0.00000200 = $0.05
Total: ~$3.35/month
```

First 2M requests are free, so actual cost would be much lower.

## Comparison: Cloud Run vs VM

| Feature | Cloud Run | E2-micro VM |
|---------|-----------|-------------|
| **Deploy Time** | ~2 minutes | ~10 minutes |
| **Startup** | Instant (or cold start 1-3s) | Always running |
| **Scaling** | Automatic 0-1000+ | Manual |
| **HTTPS** | Automatic | Need nginx + Let's Encrypt |
| **Monitoring** | Built-in | Need PM2/setup |
| **Cost (idle)** | $0 | ~$7/month |
| **Cost (busy)** | Pay per request | Fixed ~$7/month |
| **Maintenance** | Zero | OS updates, PM2 management |
| **SQLite** | Works but loses data on redeploy | Persistent disk |

### When to Use Cloud Run

✅ Perfect for:
- Development and testing
- Low to medium traffic
- Unpredictable traffic patterns
- Don't want to manage servers
- Need fast deployments

⚠️ Consider VM if:
- High constant traffic (may be cheaper)
- Need persistent local storage (SQLite)
- Need very low latency (no cold starts)
- Want full control over environment

## SQLite on Cloud Run

**Important:** Cloud Run containers are **stateless**. The SQLite database is stored in `/app/data/` inside the container, which means:

- Data persists between requests (while container is running)
- Data is lost when container is replaced (on redeploy or scale to zero)

### Solutions for Persistent Data

#### Option 1: Use Cloud SQL (PostgreSQL)

Update aggregator to use PostgreSQL instead of SQLite:

```bash
# Create Cloud SQL instance
gcloud sql instances create bob-aggregator-db \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=us-central1

# Connect Cloud Run to Cloud SQL
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --add-cloudsql-instances=PROJECT_ID:us-central1:bob-aggregator-db
```

#### Option 2: Use Firestore

Update aggregator to use Firestore (NoSQL):

```javascript
// Instead of SQLite
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
```

#### Option 3: Keep SQLite + Cloud Storage Backups

Periodically backup SQLite to Cloud Storage:

```javascript
// In aggregator code
setInterval(async () => {
    await backupToCloudStorage();
}, 60000); // Every minute
```

#### Option 4: Use VM for Stateful, Cloud Run for Stateless

- Deploy aggregator to VM (persistent SQLite)
- Deploy API workers to Cloud Run (stateless)

## Troubleshooting

### Service Won't Start

```bash
# Check logs
gcloud run services logs read bob-aggregator --region=us-central1 --limit=50

# Common issues:
# - Missing config.json
# - Wrong port (must be 8080)
# - Timeout during startup (increase timeout)
```

### Cold Starts Too Slow

```bash
# Keep 1 instance always warm
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --min-instances=1

# Or optimize startup time in code
```

### Out of Memory

```bash
# Increase memory
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --memory=1Gi
```

### Request Timeout

```bash
# Increase timeout (max 3600s)
gcloud run services update bob-aggregator \
    --region=us-central1 \
    --timeout=600
```

## Rollback

```bash
# List revisions
gcloud run revisions list --service=bob-aggregator --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic bob-aggregator \
    --region=us-central1 \
    --to-revisions=bob-aggregator-00002-xxx=100
```

## Delete Service

```bash
# Delete Cloud Run service
gcloud run services delete bob-aggregator --region=us-central1

# Delete container images
gcloud container images delete gcr.io/PROJECT_ID/bob-aggregator --quiet
```

## Summary

**Deploy:**
```bash
./deploy-cloud-run.sh
```

**Update:**
```bash
./deploy-cloud-run.sh
```

**Logs:**
```bash
gcloud run services logs tail bob-aggregator --region=us-central1
```

**Delete:**
```bash
gcloud run services delete bob-aggregator --region=us-central1
```

That's it! Much simpler than VM management.
