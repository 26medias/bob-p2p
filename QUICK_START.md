# Quick Start Guide - Bob P2P API Network V2

**Get up and running in 5 minutes**

---

## Prerequisites

1. **Node.js 18+**
   ```bash
   node --version  # Should be 18.x or higher
   ```

2. **Solana Wallet**
   - Create with: `solana-keygen new --outfile wallet.json`
   - Or use existing wallet
   - Get public key: `solana-keygen pubkey wallet.json`

3. **SOL Tokens** (for testing)
   ```bash
   # Set to devnet
   solana config set --url https://api.devnet.solana.com

   # Airdrop SOL
   solana airdrop 2 <your-wallet-address>
   ```

---

## Option 1: Run Aggregator (Discovery Service)

### Step 1: Copy Config Template

```bash
cd /home/julien/Projects/bob-p2p/V2/bob-p2p-aggregator
cp config.example.json config.json
```

### Step 2: Edit Config

```bash
nano config.json
```

**Required changes**:
- `wallet.address`: Your Solana wallet public key
- `wallet.privateKey`: Your wallet private key (see below for format)
- `database.path`: Where to store the database (e.g., `$HOME/.bob-aggregator/aggregator.db`)

**Get private key in correct format**:
```bash
# Your wallet.json contains the private key as an array
cat wallet.json

# Example output: [174,47,154,16,73,...]
# Copy this entire array into config.json wallet.privateKey
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Start Aggregator

```bash
npm start -- --config config.json
```

**Expected output**:
```
Bob P2P Aggregator starting...
Database: SQLite at /home/user/.bob-aggregator/aggregator.db
Access type: free
Server listening on http://0.0.0.0:8080
```

### Step 5: Test Aggregator

```bash
# In another terminal
curl http://localhost:8080/health
curl http://localhost:8080/info
```

✅ **Aggregator is running!**

---

## Option 2: Run Client (Provider Mode - Serve APIs)

### Step 1: Copy Config Templates

```bash
cd /home/julien/Projects/bob-p2p/V2/bob-p2p-client
cp config.example.json config.json
cp api.example.json api.json
```

### Step 2: Edit Config

```bash
nano config.json
```

**Required changes**:
- `wallet.address`: Your wallet public key
- `wallet.privateKey`: Your wallet private key (array format)
- `provider.publicEndpoint`: Your public URL (e.g., `https://your-domain.com` or `http://your-ip:8000`)
- `provider.database.path`: Database location (e.g., `$HOME/.bob-client/provider.db`)
- `provider.results.storagePath`: Where to store results (e.g., `$HOME/.bob-client/results`)
- `aggregators`: Aggregator URLs to register with (e.g., `["http://localhost:8080"]`)

### Step 3: Edit API Definitions (Optional)

The `api.json` file defines which APIs you're providing. The example includes:
- Echo API (simple test)
- Image Generator (Stable Diffusion example)
- Video Generator (text-to-video example)

You can:
- Remove APIs you don't want to provide
- Modify pricing, capacity, etc.
- Add your own APIs

**For testing, keep the Echo API** - it works without any ML models.

### Step 4: Install Dependencies

```bash
npm install
```

### Step 5: Start Provider

```bash
npm run provide -- --config config.json --apis api.json
```

**Expected output**:
```
Bob P2P Client (Provider Mode) starting...
Loading APIs from api.json...
Registered 3 API(s):
  - echo-api-v1 (Echo API)
  - text-to-image-v1 (Stable Diffusion Image Generator)
  - text-to-video-v1 (Text to Video Generator)

Provider server listening on http://0.0.0.0:8000
Public endpoint: http://your-domain.com
Wallet: 7xK9mPQvN8wR5tL2cH6eF3jD4gB1sA9uY8vC2xE5pM3

Registering with aggregator: http://localhost:8080...
✓ APIs registered with aggregator
```

### Step 6: Test Provider

```bash
# In another terminal
curl http://localhost:8000/health
curl http://localhost:8000/api/echo-api-v1/status
```

✅ **Provider is running!**

---

## Option 3: Run Client (Consumer Mode - Call APIs)

### Step 1: Copy Config

```bash
cd /home/julien/Projects/bob-p2p/V2/bob-p2p-client
cp config.example.json config.json
```

### Step 2: Edit Config

```bash
nano config.json
```

**Required changes**:
- `wallet.address`: Your wallet public key
- `wallet.privateKey`: Your wallet private key
- `aggregators`: Aggregator URLs (e.g., `["http://localhost:8080"]`)
- `provider.enabled`: Set to `false` (consumer mode only)
- `consumer.enabled`: Set to `true`

**Or simply**:
```json
{
    "wallet": { "address": "...", "privateKey": [...] },
    "token": { "symbol": "BOB", "mint": "F5k1hJjTsMpw8ATJQ1Nba9dpRNSvVFGRaznjiCNUvghH" },
    "aggregators": ["http://localhost:8080"],
    "solana": { "network": "devnet", "rpcUrl": "https://api.devnet.solana.com" },
    "provider": { "enabled": false },
    "consumer": { "enabled": true }
}
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Search for APIs

```bash
npm run search -- --config config.json
```

**Expected output**:
```
Searching for APIs...

Found 3 API(s):

1. Echo API (echo-api-v1)
   Provider: http://localhost:8000
   Price: 0.01 BOB per call
   Queue: 0 waiting
   Category: testing, utility
   Tags: echo, test, simple

2. Stable Diffusion Image Generator (text-to-image-v1)
   Provider: http://localhost:8000
   Price: 0.1 BOB per call
   Queue: 0 waiting
   Category: ml, image, ai
   Tags: stable-diffusion, sdxl, image-generation
```

### Step 5: Call an API

**Test with Echo API** (simplest):

```bash
# Check status
npm run status echo-api-v1 -- --config config.json

# Request queue position
npm run queue echo-api-v1 -- --config config.json

# Output: Queue Code: abc123xyz, Price: 0.01 BOB

# Execute (pay + call)
npm run execute echo-api-v1 -- \
  --queue-code abc123xyz \
  --body '{"message":"Hello P2P!"}' \
  --config config.json
```

**Expected flow**:
```
Requesting queue position for echo-api-v1...
Queue Code: abc123xyz
Position: 1
Price: 0.01 BOB
Expires: 60 seconds

Making payment: 0.01 BOB to 7xK9mPQ...
Transaction sent: 5x7K9mWq2k...
Waiting for confirmation... ✓

Executing API...
Job created: job-xyz789
Status: processing

Polling for result...
Job complete!

Result:
{
  "echo": "Hello P2P!",
  "timestamp": "2026-02-01T12:30:00.000Z"
}
```

✅ **You just called a P2P API!**

---

## Full Test Flow

### Terminal 1: Start Aggregator

```bash
cd bob-p2p-aggregator
npm start -- --config config.json
```

### Terminal 2: Start Provider

```bash
cd bob-p2p-client
npm run provide -- --config config.json --apis api.json
```

### Terminal 3: Use Consumer

```bash
cd bob-p2p-client

# Search
npm run search -- --config consumer-config.json

# Call echo API
npm run execute echo-api-v1 -- \
  --body '{"message":"Testing P2P!"}' \
  --config consumer-config.json
```

---

## Configuration Tips

### Wallet Private Key Format

The `privateKey` field supports **3 formats**:

**Option 1: Mnemonic Phrase (Easiest)**
```json
{
    "wallet": {
        "address": "7xK9mPQvN8wR5tL2cH6eF3jD4gB1sA9uY8vC2xE5pM3",
        "privateKey": "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
    }
}
```

**Option 2: Array Format (from wallet.json)**
```json
{
    "wallet": {
        "address": "7xK9mPQvN8wR5tL2cH6eF3jD4gB1sA9uY8vC2xE5pM3",
        "privateKey": [174,47,154,16,73,0,234,90,137,203,...]
    }
}
```

**Option 3: Base58 String**
```json
{
    "wallet": {
        "address": "7xK9mPQvN8wR5tL2cH6eF3jD4gB1sA9uY8vC2xE5pM3",
        "privateKey": "5Kb8kLf4o49H..."
    }
}
```

The system automatically detects which format you're using!

**⚠️ Security**: Never commit config files with private keys to git!

```bash
# Add to .gitignore
echo "config.json" >> .gitignore
echo "*.json" >> .gitignore
echo "!*.example.json" >> .gitignore
```

### Multiple Wallets

**Aggregator wallet**: Receives access fees (if paid access)
**Provider wallet**: Receives API call payments
**Consumer wallet**: Pays for API calls

You can use different wallets for each role.

### Devnet vs Mainnet

**Devnet** (testing):
```json
{
    "solana": {
        "network": "devnet",
        "rpcUrl": "https://api.devnet.solana.com",
        "confirmations": 1
    }
}
```

**Mainnet** (production):
```json
{
    "solana": {
        "network": "mainnet-beta",
        "rpcUrl": "https://api.mainnet-beta.solana.com",
        "confirmations": 3
    }
}
```

---

## Common Issues

### Issue: "Payment verification failed"

**Solution**:
1. Check wallet has sufficient balance:
   ```bash
   solana balance <your-address>
   ```
2. Airdrop more SOL (devnet):
   ```bash
   solana airdrop 2 <your-address>
   ```
3. Verify you're using correct network (devnet/mainnet)

### Issue: "Queue code expired"

**Solution**:
- Queue codes expire after 60 seconds
- Request new queue code
- Execute faster after requesting

### Issue: "API not found"

**Solution**:
1. Make sure provider is running
2. Make sure provider registered with aggregator
3. Check aggregator can reach provider endpoint
4. Verify API ID is correct

### Issue: "Connection refused"

**Solution**:
1. Check aggregator/provider is running
2. Verify ports are open (8080 for aggregator, 8000 for provider)
3. Check firewall settings
4. Verify URLs in config are correct

---

## Next Steps

1. **Customize APIs**:
   - Edit `api.json` to define your APIs
   - Create handler functions in `handlers/`
   - Set appropriate pricing and capacity

2. **Deploy Provider**:
   - Get public domain/IP
   - Set up HTTPS (SSL certificate)
   - Update `publicEndpoint` in config
   - Open firewall ports

3. **Deploy Aggregator**:
   - Use PostgreSQL for production (not SQLite)
   - Set up HTTPS
   - Configure paid access (optional)
   - Set up monitoring

4. **Integrate ML Models**:
   - Install ML frameworks (PyTorch, TensorFlow, etc.)
   - Load models in handlers
   - Optimize for GPU usage
   - Set realistic capacity limits

5. **Monitor & Scale**:
   - Track earnings via CLI
   - Monitor queue status
   - Adjust pricing based on demand
   - Add more APIs

---

## CLI Reference

### Aggregator
```bash
npm start -- --config config.json        # Start aggregator
npm run stats -- --config config.json    # View statistics
npm run revenue -- --config config.json  # View revenue (paid access)
```

### Provider
```bash
npm run provide -- --config config.json --apis api.json  # Start provider
npm run earnings -- --config config.json                 # View earnings
npm run queue-status -- --config config.json             # View queue
npm run jobs -- --config config.json                     # View job history
```

### Consumer
```bash
npm run search -- --config config.json                   # Search APIs
npm run status <api-id> -- --config config.json          # Check API status
npm run queue <api-id> -- --config config.json           # Request queue
npm run execute <api-id> -- --body '{...}' --config config.json  # Execute API
npm run job <job-id> -- --config config.json             # Check job status
npm run download <job-id> -- --output file.mp4           # Download result
```

---

## Support

- Read full specs: `README.md`, `AGGREGATOR_SPECS.md`, `CLIENT_SPECS.md`
- Security guide: `SECURITY_AND_EDGE_CASES.md`
- Example handlers: `handlers/`

**Happy building! 🚀**
