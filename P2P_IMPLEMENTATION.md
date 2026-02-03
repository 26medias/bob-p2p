# Pure P2P Implementation with libp2p

## Problem Statement

Current architecture uses HTTP with `localhost` endpoints:
```json
{
  "provider": {
    "endpoint": "http://localhost:8080"
  }
}
```

**Why this doesn't work:**
- Providers behind NAT/firewalls are unreachable
- `localhost` only works on the same machine
- Requires public IP + port forwarding OR tunneling
- SSL certificates needed for HTTPS
- Not true peer-to-peer networking

## Solution: libp2p

Use **libp2p** for true P2P networking with automatic NAT traversal.

### Why libp2p?
- ✅ Battle-tested (IPFS, Ethereum, Polkadot)
- ✅ Built-in NAT traversal (AutoNAT, Circuit Relay, Hole Punching)
- ✅ Multiple transports (TCP, WebSocket, WebRTC, QUIC)
- ✅ Peer discovery (mDNS, DHT, Bootstrap nodes)
- ✅ Encrypted by default (Noise protocol)
- ✅ No public endpoints required
- ✅ Multiplexing and streaming

## Architecture

### Current (HTTP)
```
Consumer → HTTP GET → http://localhost:8080 (Provider)
                           ↓
                      ❌ UNREACHABLE
```

### New (libp2p)
```
                    ┌──────────────────┐
                    │    Aggregator    │
                    │  (Bootstrap +    │
                    │   Relay Node)    │
                    └──────────────────┘
                            ↓
                  Initial Discovery Only
                            ↓
┌─────────────┐                        ┌─────────────┐
│  Provider   │◄──────libp2p──────────►│  Consumer   │
│ (P2P Node)  │   Direct Connection    │ (P2P Node)  │
│             │   + NAT Traversal      │             │
└─────────────┘                        └─────────────┘
```

### Connection Flow
1. Provider starts libp2p node
2. Provider connects to aggregator (bootstrap node)
3. Provider joins DHT
4. Provider registers APIs with **peer multiaddr** (not HTTP URL)
5. Consumer queries aggregator → Gets provider multiaddr
6. Consumer dials provider **directly** via libp2p
7. Direct P2P connection (with relay fallback if NAT blocks)
8. API requests sent over encrypted P2P stream

## Implementation Plan

### Phase 1: Add Dependencies

```bash
cd bob-p2p-client
npm install libp2p \
  @libp2p/tcp \
  @libp2p/websockets \
  @chainsafe/libp2p-noise \
  @libp2p/mplex \
  @libp2p/kad-dht \
  @libp2p/circuit-relay-v2 \
  @libp2p/bootstrap \
  @multiformats/multiaddr
```

```bash
cd bob-p2p-aggregator
npm install libp2p \
  @libp2p/tcp \
  @libp2p/websockets \
  @chainsafe/libp2p-noise \
  @libp2p/mplex \
  @libp2p/circuit-relay-v2
```

### Phase 2: Create P2P Node Module

**File: `bob-p2p-client/src/p2p/node.js`**

```javascript
const { createLibp2p } = require('libp2p');
const { tcp } = require('@libp2p/tcp');
const { webSockets } = require('@libp2p/websockets');
const { noise } = require('@chainsafe/libp2p-noise');
const { mplex } = require('@libp2p/mplex');
const { kadDHT } = require('@libp2p/kad-dht');
const { circuitRelayTransport } = require('@libp2p/circuit-relay-v2');
const { bootstrap } = require('@libp2p/bootstrap');

class P2PNode {
  constructor(config) {
    this.config = config;
    this.libp2p = null;
  }

  async start() {
    this.libp2p = await createLibp2p({
      addresses: {
        listen: [
          '/ip4/0.0.0.0/tcp/0',           // Random TCP port
          '/ip4/0.0.0.0/tcp/0/ws'         // WebSocket
        ]
      },
      transports: [
        tcp(),
        webSockets(),
        circuitRelayTransport({
          discoverRelays: 1               // Use 1 relay for NAT traversal
        })
      ],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      peerDiscovery: [
        bootstrap({
          list: this.config.p2p.bootstrap  // Aggregator + relay nodes
        })
      ],
      services: {
        dht: kadDHT({
          clientMode: false
        }),
        relay: circuitRelayV2({
          enabled: true,
          hop: {
            enabled: false,                // Don't relay for others (only aggregator does this)
            active: true                   // Use relay to connect through
          }
        })
      }
    });

    await this.libp2p.start();
    console.log('P2P Node started');
    console.log('PeerId:', this.libp2p.peerId.toString());
    console.log('Multiaddrs:', this.libp2p.getMultiaddrs().map(ma => ma.toString()));

    return this.libp2p;
  }

  async stop() {
    await this.libp2p.stop();
  }

  /**
   * Register a protocol handler
   */
  async registerProtocol(protocolId, handler) {
    await this.libp2p.handle(protocolId, handler);
  }

  /**
   * Dial a peer by their multiaddr
   */
  async dial(multiaddr) {
    return await this.libp2p.dial(multiaddr);
  }

  /**
   * Get this node's multiaddrs (for registration)
   */
  getMultiaddrs() {
    return this.libp2p.getMultiaddrs();
  }

  /**
   * Get peer ID
   */
  getPeerId() {
    return this.libp2p.peerId.toString();
  }
}

module.exports = P2PNode;
```

### Phase 3: Create API Protocol Handler

**File: `bob-p2p-client/src/p2p/protocols.js`**

```javascript
const { pipe } = require('it-pipe');
const lp = require('it-length-prefixed');
const { fromString, toString } = require('uint8arrays');

const BOB_API_PROTOCOL = '/bob-api/1.0.0';

/**
 * Handle incoming API requests over P2P stream
 */
async function handleApiRequest(jobExecutor) {
  return async ({ stream }) => {
    try {
      await pipe(
        stream,
        lp.decode(),
        async function (source) {
          for await (const msg of source) {
            const request = JSON.parse(toString(msg));
            console.log('Received API request:', request);

            // Execute job (same as HTTP handler)
            const result = await jobExecutor.executeJob(
              request.apiId,
              request.payload,
              request.payment
            );

            // Send response
            const response = {
              success: true,
              result: result
            };

            await pipe(
              [fromString(JSON.stringify(response))],
              lp.encode(),
              stream
            );
          }
        }
      );
    } catch (error) {
      console.error('API request error:', error);
      const errorResponse = {
        success: false,
        error: error.message
      };
      await pipe(
        [fromString(JSON.stringify(errorResponse))],
        lp.encode(),
        stream
      );
    }
  };
}

/**
 * Call API on remote peer
 */
async function callRemoteApi(p2pNode, peerMultiaddr, apiId, payload, payment) {
  // Dial peer
  const connection = await p2pNode.dial(peerMultiaddr);

  // Open stream with API protocol
  const stream = await connection.newStream(BOB_API_PROTOCOL);

  // Send request
  const request = {
    apiId,
    payload,
    payment
  };

  let response;
  await pipe(
    [fromString(JSON.stringify(request))],
    lp.encode(),
    stream,
    lp.decode(),
    async function (source) {
      for await (const msg of source) {
        response = JSON.parse(toString(msg));
      }
    }
  );

  return response;
}

module.exports = {
  BOB_API_PROTOCOL,
  handleApiRequest,
  callRemoteApi
};
```

### Phase 4: Update Provider

**File: `bob-p2p-client/src/provider/server.js`**

Replace HTTP server with P2P node:

```javascript
const P2PNode = require('../p2p/node');
const { BOB_API_PROTOCOL, handleApiRequest } = require('../p2p/protocols');

class ProviderServer {
  constructor(jobExecutor, config) {
    this.jobExecutor = jobExecutor;
    this.config = config;
    this.p2pNode = new P2PNode(config);
  }

  async start() {
    // Start P2P node
    await this.p2pNode.start();

    // Register API protocol handler
    await this.p2pNode.registerProtocol(
      BOB_API_PROTOCOL,
      handleApiRequest(this.jobExecutor)
    );

    console.log('✓ Provider P2P server started');
    console.log('  PeerId:', this.p2pNode.getPeerId());
    console.log('  Listening on:', this.p2pNode.getMultiaddrs().map(ma => ma.toString()).join('\n              '));
  }

  async stop() {
    await this.p2pNode.stop();
  }

  /**
   * Get multiaddrs for registration with aggregator
   */
  getEndpoints() {
    return this.p2pNode.getMultiaddrs().map(ma => ma.toString());
  }
}

module.exports = ProviderServer;
```

**File: `bob-p2p-client/src/provider/registrar.js`**

Update registration to send multiaddrs:

```javascript
async registerWithAggregator(aggregatorUrl, apis, providerServer) {
  const providerAddress = this.getProviderAddress();
  const endpoints = providerServer.getEndpoints(); // Get multiaddrs

  for (const api of apis) {
    const apiPayload = {
      ...api,
      endpoint: endpoints[0],              // Primary multiaddr
      endpoints: endpoints,                // All multiaddrs
      provider_address: providerAddress
    };

    // Sign and send (same as before)
    const message = JSON.stringify(apiPayload);
    const signature = nacl.sign.detached(
      Buffer.from(message),
      this.keypair.secretKey
    );

    await axios.post(
      `${aggregatorUrl}/api/register`,
      apiPayload,
      {
        headers: {
          'X-Provider-Address': providerAddress,
          'X-Signature': Buffer.from(signature).toString('base64'),
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
```

### Phase 5: Update Consumer

**File: `bob-p2p-client/src/consumer/client.js`**

Replace HTTP calls with P2P dial:

```javascript
const P2PNode = require('../p2p/node');
const { callRemoteApi } = require('../p2p/protocols');
const { multiaddr } = require('@multiformats/multiaddr');

class ConsumerClient {
  constructor(config) {
    this.config = config;
    this.p2pNode = new P2PNode(config);
  }

  async start() {
    await this.p2pNode.start();
    console.log('✓ Consumer P2P client started');
  }

  async callApi(api, payload, payment) {
    try {
      // Parse provider's multiaddr
      const peerMultiaddr = multiaddr(api.endpoint);

      // Call API over P2P
      const response = await callRemoteApi(
        this.p2pNode,
        peerMultiaddr,
        api.id,
        payload,
        payment
      );

      return response;
    } catch (error) {
      console.error('P2P API call failed:', error);
      throw error;
    }
  }

  async stop() {
    await this.p2pNode.stop();
  }
}

module.exports = ConsumerClient;
```

### Phase 6: Update Aggregator (Relay + Bootstrap)

**File: `bob-p2p-aggregator/src/p2p/relay.js`**

```javascript
const { createLibp2p } = require('libp2p');
const { tcp } = require('@libp2p/tcp');
const { webSockets } = require('@libp2p/websockets');
const { noise } = require('@chainsafe/libp2p-noise');
const { mplex } = require('@libp2p/mplex');
const { circuitRelayServer } = require('@libp2p/circuit-relay-v2');

async function createRelayNode(config) {
  const libp2p = await createLibp2p({
    addresses: {
      listen: [
        '/ip4/0.0.0.0/tcp/4001',
        '/ip4/0.0.0.0/tcp/4002/ws'
      ]
    },
    transports: [
      tcp(),
      webSockets()
    ],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      relay: circuitRelayServer({
        reservations: {
          maxReservations: 100           // Support 100 peers using relay
        }
      })
    }
  });

  await libp2p.start();

  console.log('🔄 Relay node started');
  console.log('   PeerId:', libp2p.peerId.toString());
  console.log('   Multiaddrs:', libp2p.getMultiaddrs().map(ma => ma.toString()));

  return libp2p;
}

module.exports = { createRelayNode };
```

**File: `bob-p2p-aggregator/src/index.js`**

Start relay alongside HTTP server:

```javascript
const { createRelayNode } = require('./p2p/relay');

async function main() {
  const config = loadConfig(configPath);

  // Start P2P relay node
  const relayNode = await createRelayNode(config);

  // Start HTTP server (for discovery)
  const database = new AggregatorDatabase(config);
  const solana = new SolanaManager(config);
  const server = new AggregatorServer(database, solana, config, relayNode);
  server.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    server.stop();
    await relayNode.stop();
    database.close();
    process.exit(0);
  });
}
```

**File: `bob-p2p-aggregator/src/server/index.js`**

Add relay info endpoint:

```javascript
handleInfo(req, res) {
  const stats = this.db.getStats();
  const categories = this.db.getCategories();

  res.json({
    name: 'Bob P2P Aggregator',
    version: '2.0.0',
    accessType: this.config.access.type,
    token: this.config.token,
    walletAddress: this.config.wallet.address,
    // Add P2P relay info
    p2p: {
      peerId: this.relayNode.peerId.toString(),
      multiaddrs: this.relayNode.getMultiaddrs().map(ma => ma.toString())
    },
    stats: {
      totalAPIs: stats.total,
      activeAPIs: stats.active,
      categories: categories.map(c => c.name)
    }
  });
}
```

### Phase 7: Update Configurations

**File: `bob-p2p-client/config.json`**

```json
{
  "wallet": { ... },
  "token": { ... },
  "aggregators": [
    "https://bob-aggregator-uv67ojrpvq-uc.a.run.app"
  ],
  "p2p": {
    "enabled": true,
    "bootstrap": [
      "/dns4/bob-aggregator-uv67ojrpvq-uc.a.run.app/tcp/4001/p2p/QmAggregatorPeerId"
    ]
  },
  "provider": {
    "enabled": true
  },
  "consumer": {
    "enabled": false
  }
}
```

**Note:** Get aggregator's PeerId from `/info` endpoint after deploying relay.

### Phase 8: Update Aggregator Database Schema

**File: `bob-p2p-aggregator/src/database/memory.js`**

Support multiaddr endpoints:

```javascript
registerApi(apiData) {
  const api = {
    ...apiData,
    endpoint: apiData.endpoint,        // Primary multiaddr
    endpoints: apiData.endpoints || [apiData.endpoint], // All multiaddrs
    status: apiData.status || 'active',
    registered_at: new Date().toISOString(),
    last_seen: new Date().toISOString()
  };

  this.apis.set(apiData.id, api);
}
```

## Testing Plan

### 1. Local Testing (Same Machine)

```bash
# Terminal 1: Start aggregator with relay
cd bob-p2p-aggregator
npm install  # Install libp2p dependencies
node src/index.js --config config.json

# Terminal 2: Get relay multiaddr
curl https://bob-aggregator-uv67ojrpvq-uc.a.run.app/info | jq .p2p

# Update bob-p2p-client/config.json with relay multiaddr

# Terminal 3: Start provider
cd bob-p2p-client
npm install  # Install libp2p dependencies
npm run provide -- --config config.json --apis api.json

# Terminal 4: Test consumer
npm run consume -- search echo
npm run consume -- call echo-api-v1 '{"message":"test"}'
```

### 2. NAT Traversal Testing (Different Networks)

Test P2P between two different networks:

**Provider (Home Network behind NAT):**
```bash
npm run provide -- --config config.json --apis api.json
# Should connect via relay
```

**Consumer (Mobile Hotspot / Different Network):**
```bash
npm run consume -- call echo-api-v1 '{"message":"hello"}'
# Should connect via relay, then attempt hole-punching
```

**Check logs for:**
- `Direct connection established` (ideal)
- `Using circuit relay` (fallback, still works)

### 3. Verify No Public Endpoints Needed

**Provider runs on completely private network:**
- No port forwarding
- No public IP
- Behind CGNAT
- Should still work via relay

## NAT Traversal Strategies

libp2p automatically tries these in order:

1. **Direct Connection** - If peer has public IP
   - Fastest, lowest latency
   - Works ~30% of time

2. **Hole Punching (DCUtR)** - NAT traversal
   - Establishes direct connection through NATs
   - Works ~50% of time
   - Low latency after successful punch

3. **Circuit Relay** - Fallback through relay node
   - Always works (if relay available)
   - Higher latency
   - Uses relay's bandwidth

## Migration Strategy

### Hybrid Mode (Support Both HTTP and P2P)

Allow gradual migration:

```javascript
// Provider starts both
const httpServer = new HTTPServer(config);  // Old
const p2pServer = new P2PServer(config);    // New

// Register both endpoints
{
  "endpoints": [
    "http://example.com:8080",                    // HTTP (legacy)
    "/ip4/34.x.x.x/tcp/4001/p2p/QmProvider"      // P2P (new)
  ]
}

// Consumer tries P2P first, falls back to HTTP
try {
  return await callP2PAPI(api);
} catch (error) {
  return await callHTTPAPI(api);
}
```

## Security

### libp2p Security Features
- ✅ **Encrypted by default** - Noise protocol (post-quantum resistant)
- ✅ **Peer authentication** - PeerId cryptographic identity
- ✅ **No plain HTTP** - All connections encrypted
- ✅ **Connection upgrades** - Automatic security negotiation

### Still Need
- ✅ Payment verification (existing Solana logic)
- ✅ Rate limiting per peer
- ✅ API access control (existing signature verification)

## Cost Estimate

### Development Time
- Phase 1-2: Create P2P modules - **2 days**
- Phase 3-5: Update provider/consumer - **2 days**
- Phase 6: Update aggregator relay - **1 day**
- Phase 7-8: Config and testing - **2 days**
- **Total: ~1-1.5 weeks**

### Infrastructure Cost
- Aggregator relay node: **$5-10/month** (existing Cloud Run)
- Optional: Additional relay nodes: **$5/month each**
- Provider/consumer: **$0** (no hosting needed!)

### Maintenance
- **Low** - libp2p is battle-tested
- Relay monitoring (uptime)
- No SSL certificate management
- No per-provider infrastructure

## Deployment

### Deploy Updated Aggregator

```bash
cd bob-p2p-aggregator
npm install  # Install libp2p deps

# Update Dockerfile to expose P2P port
# Add: EXPOSE 4001

# Redeploy
./deploy-cloud-run.sh

# Verify relay is running
curl https://bob-aggregator-uv67ojrpvq-uc.a.run.app/info | jq .p2p
```

### Update Firewall (Cloud Run)

```bash
# Allow P2P port 4001
gcloud run services update bob-aggregator \
  --port=8080,4001 \
  --region=us-central1
```

### Run Providers Anywhere

```bash
# No deployment needed!
# Run on laptop, desktop, Raspberry Pi, etc.
npm run provide -- --config config.json --apis api.json
```

## Monitoring

### Check P2P Connections

```javascript
// Log connection events
libp2p.addEventListener('peer:connect', (evt) => {
  console.log('Peer connected:', evt.detail.toString());
});

libp2p.addEventListener('peer:disconnect', (evt) => {
  console.log('Peer disconnected:', evt.detail.toString());
});
```

### Check NAT Status

```javascript
// AutoNAT status
const autonat = libp2p.services.autonat;
console.log('NAT status:', autonat.getNATStatus());
// Returns: 'public', 'private', or 'unknown'
```

### Monitor Relay Usage

```bash
# In aggregator logs
Relay reservation: QmPeerId123...
Active relay connections: 5
```

## Troubleshooting

### "Cannot connect to peer"
1. Check relay is running: `curl .../info | jq .p2p`
2. Verify bootstrap multiaddr in config
3. Check libp2p logs for errors

### "Connection via relay only"
- Normal for NATs that block hole-punching
- Relay provides fallback
- Consider deploying more relay nodes for redundancy

### "DHT not responding"
- Wait 30-60 seconds for DHT bootstrap
- Ensure at least 1 bootstrap node reachable

## Next Steps

1. ✅ Read this implementation plan
2. Install libp2p dependencies (both repos)
3. Create `src/p2p/` modules (node.js, protocols.js)
4. Update provider server (replace Express with P2P)
5. Update consumer client (replace axios with P2P)
6. Add relay to aggregator
7. Test locally
8. Deploy aggregator with relay
9. Test across networks
10. Celebrate true P2P! 🎉

## References

- [libp2p Documentation](https://docs.libp2p.io/)
- [js-libp2p Examples](https://github.com/libp2p/js-libp2p/tree/master/examples)
- [NAT Traversal in libp2p](https://docs.libp2p.io/concepts/nat/)
- [Circuit Relay](https://docs.libp2p.io/concepts/nat/circuit-relay/)
