# Bob P2P Network - Setup Instructions

## Configuration Updated for Full P2P (No HTTP)

All configuration files have been updated to use **P2P-only mode** with HTTP disabled.

## Step-by-Step Setup

### 1. Deploy or Start Aggregator

#### Option A: Cloud Run (HTTP API + Limited P2P)

```bash
cd bob-p2p-aggregator
./deploy-cloud-run.sh
```

**Note**: Cloud Run only supports HTTP/WebSocket. For full TCP P2P support, use Option B.

#### Option B: VM or Local (Full P2P Support - Recommended)

```bash
cd bob-p2p-aggregator

# Install dependencies
npm install

# Start aggregator
node src/index.js --config config.json
```

### 2. Get Bootstrap Addresses

The aggregator will print bootstrap addresses on startup:

```
Bootstrap addresses for clients:
  /ip4/34.x.x.x/tcp/4001/p2p/QmAggregatorPeerId...
```

**Copy this address!** You'll need it for the next step.

Alternatively, query the aggregator:

```bash
# If deployed to Cloud Run
curl https://bob-aggregator-uv67ojrpvq-uc.a.run.app/p2p/bootstrap

# If running locally
curl http://localhost:8080/p2p/bootstrap
```

Response:
```json
{
  "peerId": "QmPeerId...",
  "bootstrap": [
    "/ip4/34.x.x.x/tcp/4001/p2p/QmPeerId..."
  ],
  "multiaddrs": [...]
}
```

### 3. Update Client Configurations

Update the bootstrap addresses in **both** client config files:

**[bob-p2p-client/config.json](bob-p2p-client/config.json)**:
```json
{
  "aggregators": [
    "https://bob-aggregator-uv67ojrpvq-uc.a.run.app"
  ],
  "p2p": {
    "enabled": true,
    "port": 4001,
    "wsPort": 4002,
    "bootstrap": [
      "/ip4/34.x.x.x/tcp/4001/p2p/QmAggregatorPeerId..."
    ]
  },
  "provider": {
    "httpDisabled": true
  }
}
```

**[bob-p2p-client/config-user.json](bob-p2p-client/config-user.json)**:
```json
{
  "aggregators": [
    "https://bob-aggregator-uv67ojrpvq-uc.a.run.app"
  ],
  "p2p": {
    "enabled": true,
    "port": 4001,
    "wsPort": 4002,
    "bootstrap": [
      "/ip4/34.x.x.x/tcp/4001/p2p/QmAggregatorPeerId..."
    ]
  },
  "provider": {
    "httpDisabled": true
  }
}
```

Replace:
- `UPDATE_WITH_AGGREGATOR_BOOTSTRAP_ADDRESS` → Actual bootstrap multiaddr
- Aggregator URL if different

### 4. Start Provider

```bash
cd bob-p2p-client

# Install dependencies (first time only)
npm install

# Start provider (using config.json)
npm run provide -- --config config.json --apis api.json

# Or using config-user.json
npm run provide -- --config config-user.json --apis api-user.json
```

**Expected Output**:
```
Starting P2P Provider Server...
P2P node started!
Peer ID: QmProviderPeerId...
Listening on multiaddrs:
  /ip4/0.0.0.0/tcp/4001/p2p/QmProviderPeerId...
  /ip4/0.0.0.0/tcp/4002/ws/p2p/QmProviderPeerId...
P2P Provider Server started!

Registering with aggregators...
Registering P2P multiaddrs:
  /ip4/192.168.1.5/tcp/4001/p2p/QmProviderPeerId...
✓ Registered with: https://bob-aggregator-uv67ojrpvq-uc.a.run.app

✓ Provider ready!
```

**Notice**: No HTTP server starts (it's disabled)!

### 5. Test with Consumer

On a **different machine** or in a **different terminal**:

```bash
cd bob-p2p-client

# Update config with same bootstrap addresses

# Search for APIs
npm run search -- echo-api-v1

# Execute API call
npm run execute -- echo-api-v1 --message "Hello P2P!"
```

**Expected Output**:
```
Using P2P transport
Endpoint: /ip4/192.168.1.5/tcp/4001/p2p/QmProviderPeerId...

Step 1: Sending payment...
Transaction: 5abc...xyz

Step 2: Sending API request over P2P...
Dialing peer: /ip4/192.168.1.5/tcp/4001/p2p/QmProviderPeerId...
Connected to: QmProviderPeerId...
Job ID: uuid-123-456
Status: queued

Step 3: Waiting for completion...
Job completed!

Result: {"echo": "Hello P2P!", "timestamp": "..."}
```

## Configuration Summary

### Files Updated

All configuration files have been updated for **P2P-only mode**:

1. ✅ **[bob-p2p-aggregator/config.json](bob-p2p-aggregator/config.json)**
   - P2P relay enabled
   - Ports: 4001 (TCP), 4002 (WebSocket)

2. ✅ **[bob-p2p-client/config.json](bob-p2p-client/config.json)**
   - `httpDisabled: true` (HTTP server disabled)
   - `p2p.enabled: true`
   - Bootstrap addresses: **UPDATE REQUIRED**

3. ✅ **[bob-p2p-client/config-user.json](bob-p2p-client/config-user.json)**
   - `httpDisabled: true` (HTTP server disabled)
   - `p2p.enabled: true`
   - Bootstrap addresses: **UPDATE REQUIRED**

4. ✅ **[bob-p2p-client/api.json](bob-p2p-client/api.json)** - No changes needed (API definitions)

5. ✅ **[bob-p2p-client/api-user.json](bob-p2p-client/api-user.json)** - No changes needed (API definitions)

### Key Settings

**P2P Enabled**:
```json
{
  "p2p": {
    "enabled": true,
    "port": 4001,
    "wsPort": 4002,
    "bootstrap": ["..."]
  }
}
```

**HTTP Disabled**:
```json
{
  "provider": {
    "httpDisabled": true
  }
}
```

## Verification Checklist

✅ **Aggregator Running**
```bash
curl https://bob-aggregator-uv67ojrpvq-uc.a.run.app/health
curl https://bob-aggregator-uv67ojrpvq-uc.a.run.app/p2p/bootstrap
```

✅ **Bootstrap Addresses Updated**
- Check both config.json and config-user.json
- Should have actual multiaddr, not placeholder

✅ **Provider Starts with P2P**
- Logs show "P2P Provider Server started!"
- Logs show "Registering P2P multiaddrs"
- No HTTP server starts

✅ **Provider Registered**
```bash
curl https://bob-aggregator-uv67ojrpvq-uc.a.run.app/api/search
# Should show APIs with P2P endpoints
```

✅ **Consumer Can Connect**
- Logs show "Using P2P transport"
- Logs show "Connected to: QmProviderPeerId..."
- API call succeeds

## Troubleshooting

### "UPDATE_WITH_AGGREGATOR_BOOTSTRAP_ADDRESS" in config

**Problem**: Bootstrap placeholder not replaced

**Fix**:
1. Get bootstrap address from aggregator
2. Replace placeholder in config files
3. Restart provider

### Provider Not Starting P2P Server

**Check**:
- Is `p2p.enabled: true`?
- Are libp2p packages installed? (`npm install`)
- Check logs for errors

**Fix**:
```bash
cd bob-p2p-client
npm install  # Reinstall dependencies
```

### Consumer Using HTTP Instead of P2P

**Problem**: Search results show HTTP endpoints

**Causes**:
1. Provider didn't register P2P endpoints
2. Provider not connected to bootstrap
3. Bootstrap addresses wrong

**Check Provider Logs**:
```
Registering P2P multiaddrs:  <-- Should see this
  /ip4/x.x.x.x/tcp/4001/p2p/QmProvider...
✓ Registered with aggregator
```

**Fix**:
1. Verify bootstrap addresses correct
2. Check provider connected to aggregator
3. Restart provider

### "P2P relay not enabled" Error

**Problem**: Aggregator doesn't have P2P enabled

**Fix**: Update aggregator config.json:
```json
{
  "p2p": {
    "enabled": true,
    "relay": {
      "port": 4001,
      "wsPort": 4002
    }
  }
}
```

Then restart aggregator.

### Can't Connect to Provider

**Symptoms**: Consumer hangs or times out

**Causes**:
1. Firewall blocking P2P ports
2. NAT traversal failed
3. Relay not working

**Debug**:
```bash
# Check provider is running
# Check provider logs for "Connected to peer" messages
# Verify bootstrap reachable from consumer machine
```

**Workaround**: Deploy dedicated relay nodes for better NAT traversal

## Network Ports

Make sure these ports are accessible:

**Aggregator**:
- 8080 (HTTP API) - Must be public
- 4001 (P2P TCP) - Should be public for best relay
- 4002 (P2P WebSocket) - Should be public for best relay

**Provider/Consumer**:
- 4001 (P2P TCP) - Outbound connections (usually not blocked)
- 4002 (P2P WebSocket) - Outbound connections (usually not blocked)
- No inbound ports required! (NAT traversal handles it)

## Quick Commands

```bash
# Get bootstrap addresses
curl https://bob-aggregator-uv67ojrpvq-uc.a.run.app/p2p/bootstrap | jq .bootstrap

# Check provider registered
curl https://bob-aggregator-uv67ojrpvq-uc.a.run.app/api/search | jq '.apis[].endpoints'

# Start provider
cd bob-p2p-client
npm run provide -- --config config.json --apis api.json

# Test consumer
npm run search -- echo-api-v1
npm run execute -- echo-api-v1 --message "Test"
```

## Next Steps

1. ✅ Deploy/start aggregator
2. ✅ Get bootstrap addresses
3. ✅ Update client configs
4. ✅ Start providers
5. ✅ Test with consumer
6. 🚀 Deploy AI agents with P2P!

## Documentation

- **[QUICK_START_P2P.md](QUICK_START_P2P.md)** - 5-minute quick start
- **[P2P_DEPLOYMENT_GUIDE.md](P2P_DEPLOYMENT_GUIDE.md)** - Complete deployment guide
- **[P2P_IMPLEMENTATION_SUMMARY.md](P2P_IMPLEMENTATION_SUMMARY.md)** - Technical details

## Support

If you encounter issues:

1. Check all configs have correct bootstrap addresses
2. Verify aggregator is running and accessible
3. Check provider logs for P2P connection messages
4. Test with curl commands above
5. Review troubleshooting section

Your network is now configured for **true peer-to-peer operation**! No exposed ports or public IPs required for providers and consumers.
