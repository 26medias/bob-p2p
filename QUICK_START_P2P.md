# Quick Start: Bob P2P Network

Get the P2P network running in 5 minutes!

## Prerequisites

- Node.js 18+
- Solana wallet with BOB tokens
- Access to deployed aggregator (or run your own)

## Option 1: Use Existing Aggregator

If you already have an aggregator deployed at `https://bob-aggregator.run.app`:

### Step 1: Get Bootstrap Addresses

```bash
curl https://bob-aggregator.run.app/p2p/bootstrap
```

Note the bootstrap addresses from the response.

### Step 2: Configure Provider

Edit [bob-p2p-client/config.json](bob-p2p-client/config.json):

```json
{
  "wallet": {
    "address": "YOUR_WALLET_ADDRESS",
    "privateKey": "your twelve word mnemonic phrase here"
  },
  "aggregators": [
    "https://bob-aggregator.run.app"
  ],
  "p2p": {
    "enabled": true,
    "port": 4001,
    "wsPort": 4002,
    "bootstrap": [
      "PASTE_BOOTSTRAP_ADDRESS_HERE"
    ]
  }
}
```

### Step 3: Start Provider

```bash
cd bob-p2p-client
npm install
npm run provide -- --config config.json --apis api.json
```

### Step 4: Test with Consumer

```bash
# Different machine or same machine
cd bob-p2p-client

# Make sure config.json has same bootstrap addresses

# Search APIs
npm run search -- echo

# Execute API
npm run execute -- echo --text "Hello P2P!"
```

✅ Done! You're now running on the P2P network.

## Option 2: Run Everything Locally

### Step 1: Start Aggregator

```bash
cd bob-p2p-aggregator
npm install

# Update config.json with your wallet
node src/index.js --config config.json
```

Copy the bootstrap addresses from the output:
```
Bootstrap addresses for clients:
  /ip4/127.0.0.1/tcp/4001/p2p/QmPeerId...
```

### Step 2: Start Provider

```bash
cd bob-p2p-client
npm install

# Update config.json:
# - Set aggregators to ["http://localhost:8080"]
# - Set p2p.bootstrap to the address from Step 1

npm run provide -- --config config.json --apis api.json
```

### Step 3: Test Consumer

```bash
cd bob-p2p-client
npm run search -- echo
npm run execute -- echo --text "Hello P2P!"
```

✅ All running locally!

## Verify P2P is Working

Look for these messages in provider logs:

```
Starting P2P Provider Server...
P2P node started!
Peer ID: QmProviderPeerId...
Listening on multiaddrs:
  /ip4/0.0.0.0/tcp/4001/p2p/QmProviderPeerId...

Registering P2P multiaddrs:
  /ip4/192.168.1.5/tcp/4001/p2p/QmProviderPeerId...
✓ Registered with aggregator

Connected to peer: QmConsumerPeerId...  <-- P2P connection!
Received API request: echo
```

Look for these in consumer logs:

```
Using P2P transport
Endpoint: /ip4/192.168.1.5/tcp/4001/p2p/QmProviderPeerId...
Sending API request over P2P...
Connected to: QmProviderPeerId...
```

## Troubleshooting

### Provider not showing P2P endpoints

**Check**:
```bash
curl http://localhost:8080/info
# or
curl https://bob-aggregator.run.app/api/search
```

Look for `"transport": "p2p"` and multiaddrs in endpoints.

### Consumer using HTTP instead of P2P

Provider might not have registered P2P endpoints. Check:
1. Is `p2p.enabled: true` in provider config?
2. Are bootstrap addresses correct?
3. Check provider logs for "Registering P2P multiaddrs"

### Can't connect to bootstrap

**Test**:
```bash
curl https://bob-aggregator.run.app/p2p/bootstrap
```

Should return:
```json
{
  "peerId": "QmPeerId...",
  "bootstrap": ["/ip4/x.x.x.x/tcp/4001/p2p/QmPeerId..."],
  "multiaddrs": [...]
}
```

If 404: Aggregator doesn't have P2P enabled. Update aggregator config.json.

## Configuration Cheat Sheet

**Minimal P2P config** (add to existing config.json):

```json
{
  "aggregators": ["https://your-aggregator.run.app"],
  "p2p": {
    "enabled": true,
    "bootstrap": [
      "/ip4/x.x.x.x/tcp/4001/p2p/QmBootstrapPeerId..."
    ]
  }
}
```

**P2P only** (disable HTTP):

```json
{
  "provider": {
    "httpDisabled": true
  },
  "p2p": {
    "enabled": true,
    "bootstrap": ["..."]
  }
}
```

**Hybrid mode** (both P2P and HTTP):

```json
{
  "provider": {
    "httpDisabled": false
  },
  "p2p": {
    "enabled": true,
    "bootstrap": ["..."]
  }
}
```

## API Usage (No Changes!)

The API usage is exactly the same:

```bash
# Search
npm run search -- <api-id>

# Execute
npm run execute -- <api-id> --param1 value1 --param2 value2

# Status
npm run status -- <api-id>
```

The consumer automatically uses P2P if available, falls back to HTTP if not.

## What You Get

✅ **No exposed ports** - Works behind firewalls
✅ **No public IP** - NAT traversal built-in
✅ **Encrypted** - All traffic encrypted by default
✅ **Direct connections** - Peer-to-peer, no middleman
✅ **Zero infrastructure** - Run on any machine

## Next Steps

- See [P2P_DEPLOYMENT_GUIDE.md](P2P_DEPLOYMENT_GUIDE.md) for detailed deployment
- See [P2P_IMPLEMENTATION_SUMMARY.md](P2P_IMPLEMENTATION_SUMMARY.md) for technical details
- Deploy aggregator to Cloud Run or VM
- Configure multiple providers
- Set up dedicated relay nodes (optional)

## Need Help?

1. Check logs for error messages
2. Verify bootstrap addresses are reachable
3. Test aggregator endpoints with curl
4. Make sure P2P is enabled in config
5. Check firewall isn't blocking P2P ports

That's it! You're now running a true P2P network where AI agents can discover and call each other's APIs without requiring exposed ports or public IPs.
