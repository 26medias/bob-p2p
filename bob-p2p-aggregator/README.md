# Bob P2P Aggregator

Discovery service for the Bob P2P API marketplace. The aggregator indexes available APIs from providers and provides search/discovery functionality to consumers.

## Overview

The aggregator serves as a central registry where:
- **API Providers** register their APIs to make them discoverable
- **API Consumers** search for and discover available APIs
- **Health monitoring** tracks provider uptime and availability

The aggregator does **not** handle API execution - all API calls are direct P2P between consumer and provider.

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **Solana Wallet**: A wallet with some SOL for transaction fees (if using paid access model)
- **Operating System**: Linux, macOS, or Windows

## Installation

### Option 1: NPM Install (Coming Soon)

```bash
npm install -g @bob-p2p/aggregator
```

### Option 2: From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/bob-p2p.git
cd bob-p2p/bob-p2p-aggregator

# Install dependencies
npm install
```

## Configuration

### 1. Create Configuration File

Copy the example configuration and customize it:

```bash
cp config.example.json config.json
```

### 2. Configure Your Wallet

The aggregator needs a Solana wallet for:
- Receiving registration fees (if using paid access)
- Verifying provider signatures

**Supported Key Formats**:

**Mnemonic** (recommended for development):
```json
{
    "wallet": {
        "address": "YOUR_WALLET_ADDRESS_HERE",
        "privateKey": "your twelve word seed phrase goes here"
    }
}
```

**Array** (from Solana CLI wallet):
```json
{
    "wallet": {
        "address": "YOUR_WALLET_ADDRESS_HERE",
        "privateKey": [123, 45, 67, 89, ...]
    }
}
```

**Base58** (from some wallet exports):
```json
{
    "wallet": {
        "address": "YOUR_WALLET_ADDRESS_HERE",
        "privateKey": "5Kb8kLf4CfNNJQ8..."
    }
}
```

### 3. Configure Access Model

**Free Access** (anyone can search and discover):
```json
{
    "access": {
        "type": "free",
        "fee": 0,
        "validityDays": 0
    }
}
```

**Paid Access** (requires payment to search):
```json
{
    "access": {
        "type": "paid",
        "fee": 1.0,
        "validityDays": 30
    }
}
```

### 4. Configure Network

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

### 5. Complete Configuration Example

```json
{
    "wallet": {
        "address": "YOUR_WALLET_ADDRESS_HERE",
        "privateKey": "your twelve word seed phrase goes here"
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
        "host": "0.0.0.0",
        "cors": {
            "enabled": true,
            "origins": ["*"]
        }
    },
    "access": {
        "type": "free",
        "fee": 0,
        "validityDays": 0
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

## Running the Aggregator

### Start the Server

```bash
node src/index.js --config config.json
```

Or using npm:

```bash
npm start -- --config config.json
```

### Expected Output

```
Loading configuration...
Configuration validated successfully
Initializing database...
Initializing Solana manager...
Solana client initialized
Wallet: YOUR_WALLET_ADDRESS_HERE
Network: devnet
Starting server...
Aggregator server listening on http://0.0.0.0:8080
Access Type: free
Health check interval: 300 seconds
Starting health checker...

✓ Aggregator ready!
```

### Run in Background

**Using screen:**
```bash
screen -S bob-aggregator
node src/index.js --config config.json
# Press Ctrl+A, then D to detach
```

**Using nohup:**
```bash
nohup node src/index.js --config config.json > aggregator.log 2>&1 &
```

**Using systemd** (recommended for production):
```bash
# Create service file
sudo nano /etc/systemd/system/bob-aggregator.service
```

```ini
[Unit]
Description=Bob P2P Aggregator
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/bob-p2p-aggregator
ExecStart=/usr/bin/node src/index.js --config config.json
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable bob-aggregator
sudo systemctl start bob-aggregator

# Check status
sudo systemctl status bob-aggregator

# View logs
sudo journalctl -u bob-aggregator -f
```

## API Endpoints

### Health Check

```http
GET /health

Response: 200 OK
{
    "status": "ok",
    "uptime": 3600,
    "timestamp": 1738454400000
}
```

### Aggregator Info

```http
GET /info

Response: 200 OK
{
    "name": "Bob P2P Aggregator",
    "version": "2.0.0",
    "wallet": "YOUR_WALLET_ADDRESS_HERE",
    "accessType": "free",
    "stats": {
        "totalApis": 15,
        "activeProviders": 8,
        "totalCalls": 1234
    }
}
```

### Search APIs

```http
GET /search?category=ml&tags=image&maxPrice=1.0

Response: 200 OK
{
    "results": [
        {
            "id": "text-to-image-v1",
            "name": "Text to Image Generator",
            "provider": "http://provider1.example.com",
            "providerWallet": "PROVIDER_WALLET_ADDRESS_EXAMPLE",
            "price": 0.5,
            "category": ["ml", "image"],
            "tags": ["stable-diffusion", "image", "generation"],
            "status": "online",
            "lastSeen": 1738454400000
        }
    ],
    "count": 1
}
```

### Register API (Provider)

```http
POST /register

Headers:
  Content-Type: application/json
  X-Provider-Address: PROVIDER_WALLET_ADDRESS_EXAMPLE
  X-Signature: base58-encoded-signature

Body:
{
    "apis": [
        {
            "id": "text-to-image-v1",
            "name": "Text to Image Generator",
            "description": "Generate images from text prompts",
            "version": "1.0.0",
            "pricing": {
                "amount": 0.5,
                "unit": "per-call"
            },
            "category": ["ml", "image"],
            "tags": ["stable-diffusion"]
        }
    ],
    "endpoint": "http://localhost:8000"
}

Response: 201 Created
{
    "success": true,
    "registered": 1,
    "message": "APIs registered successfully"
}
```

## CLI Tools

### View Statistics

```bash
npm run stats -- --config config.json
```

Output:
```
=== Bob P2P Aggregator Stats ===

Total APIs: 15
Active Providers: 8
Total API Calls: 1,234

Top APIs by Calls:
1. text-to-image-v1 - 450 calls
2. text-to-video-v1 - 320 calls
3. image-gen-v2 - 280 calls

Recent Activity:
- text-to-image-v1 called 2 minutes ago
- text-to-video-v1 called 5 minutes ago
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 8080
sudo lsof -i :8080

# Kill the process
sudo kill -9 <PID>

# Or change the port in config.json
{
    "server": {
        "port": 8081
    }
}
```

### Database Issues

```bash
# Check if database file exists
ls -la /home/user/.bob-aggregator/aggregator.db

# Delete and recreate (will lose data)
rm /home/user/.bob-aggregator/aggregator.db
node src/index.js --config config.json
```

### Connection Issues

```bash
# Test if server is accessible
curl http://localhost:8080/health

# Check firewall
sudo ufw status
sudo ufw allow 8080/tcp

# Check if process is running
ps aux | grep "node src/index.js"
```

### Solana RPC Issues

If you're experiencing slow responses or timeouts:

```json
{
    "solana": {
        "rpcUrl": "https://api.mainnet-beta.solana.com",
        "_alternative_rpcs": [
            "https://solana-api.projectserum.com",
            "https://rpc.ankr.com/solana",
            "https://solana-mainnet.phantom.tech"
        ]
    }
}
```

## Security Considerations

### File Permissions

Protect your config file containing private keys:

```bash
chmod 600 config.json
```

### Firewall Configuration

If running on a public server:

```bash
# Allow only necessary ports
sudo ufw enable
sudo ufw allow 8080/tcp  # Aggregator API
sudo ufw allow 22/tcp    # SSH
```

### Rate Limiting

The aggregator includes built-in rate limiting:

```json
{
    "security": {
        "rateLimit": {
            "enabled": true,
            "requestsPerMinute": 100,
            "requestsPerHour": 5000
        }
    }
}
```

### CORS Configuration

For production, restrict CORS origins:

```json
{
    "server": {
        "cors": {
            "enabled": true,
            "origins": ["https://your-frontend.com", "https://api.your-domain.com"]
        }
    }
}
```

## Monitoring

### Health Checks

The aggregator automatically monitors registered providers:

- Pings provider `/health` endpoint every 5 minutes
- Marks as offline after 3 consecutive failures
- Automatically reactivates when provider comes back online

### Logs

Monitor aggregator logs for issues:

```bash
# If using systemd
sudo journalctl -u bob-aggregator -f

# If using nohup
tail -f aggregator.log

# If using screen
screen -r bob-aggregator
```

## Updating

### Pull Latest Changes

```bash
cd /path/to/bob-p2p-aggregator
git pull origin main
npm install
```

### Restart Service

```bash
# If using systemd
sudo systemctl restart bob-aggregator

# If using screen
screen -r bob-aggregator
# Ctrl+C to stop, then restart
node src/index.js --config config.json
```

## Development

### Run in Development Mode

```bash
# With auto-reload (requires nodemon)
npm install -g nodemon
nodemon src/index.js -- --config config.json
```

### Enable Debug Logging

```bash
DEBUG=* node src/index.js --config config.json
```

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/yourusername/bob-p2p/issues
- Documentation: See main project [README.md](../README.md)

## License

TBD
