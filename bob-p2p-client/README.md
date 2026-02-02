# Bob P2P Client

P2P API Network Client - Supports both Provider and Consumer modes.

## Overview

The Bob P2P Client allows you to:

- **Provider Mode**: Serve APIs to the network and earn tokens
- **Consumer Mode**: Discover and call APIs from other providers

## Installation

```bash
npm install
```

## Configuration

Copy the example config file and edit with your settings:

```bash
cp config.example.json config.json
nano config.json
```

### Required Configuration

- `wallet.address`: Your Solana wallet public key
- `wallet.privateKey`: Your wallet private key in one of three formats:
  - **Mnemonic phrase**: `"word1 word2 word3 ..."` (12 or 24 words) - **Easiest!**
  - **Array format**: `[123, 45, ...]` (from wallet.json)
  - **Base58 string**: `"5Kb8kLf4..."`
- `token.mint`: Token contract address
- `aggregators`: Array of aggregator URLs
- `solana.network`: Network to use (`devnet` or `mainnet-beta`)
- `solana.rpcUrl`: Solana RPC endpoint

**Using Mnemonic (Recommended):**
```json
{
  "wallet": {
    "address": "YourPublicKey...",
    "privateKey": "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
  }
}
```

See [config.mnemonic.example.json](config.mnemonic.example.json) for a complete example.

### Provider Mode Configuration

Additional settings required for provider mode:

- `provider.enabled`: Set to `true`
- `provider.port`: Port to listen on (default: 8000)
- `provider.publicEndpoint`: Your public URL (e.g., `https://your-domain.com`)
- `provider.database`: Database configuration
- `provider.results.storagePath`: Where to store result files

### Consumer Mode Configuration

- `consumer.enabled`: Set to `true` (optional, can use CLI without running a service)

See [config.example.json](config.example.json) for complete example.

## Provider Mode

### Setup

1. Create your config file
2. Create your API definitions file:

```bash
cp api.example.json api.json
nano api.json
```

3. Create handler functions in `handlers/` directory (see examples)

### Start Provider

```bash
npm run provide -- --config config.json --apis api.json
```

This will:
- Start the provider server
- Register APIs with aggregators
- Begin processing jobs

### Provider CLI Commands

**View earnings:**
```bash
npm run earnings -- --config config.json --days 30
```

**View queue status:**
```bash
npm run queue-status -- --config config.json
```

**View job history:**
```bash
npm run jobs -- --config config.json
npm run jobs -- --config config.json --api echo-api-v1
npm run jobs -- --config config.json --status completed
```

## Consumer Mode

### Search for APIs

```bash
npm run search -- --config config.json
npm run search -- --config config.json --category ml
npm run search -- --config config.json --tag image-generation
npm run search -- --config config.json --max-price 1.0
```

### Check API Status

```bash
npm run status echo-api-v1 -- --config config.json --provider http://provider-url
```

### Call an API

**Full workflow (automatic):**

```bash
npm run execute echo-api-v1 -- \
  --config config.json \
  --provider http://provider-url \
  --provider-wallet PROVIDER_WALLET_ADDRESS \
  --body '{"message":"Hello P2P!"}'
```

This will:
1. Request queue position
2. Send payment
3. Execute API
4. Poll for completion
5. Display result

**Manual workflow:**

Step 1 - Request queue:
```bash
npm run queue echo-api-v1 -- \
  --config config.json \
  --provider http://provider-url
```

Step 2 - Send payment (use your own method or Solana CLI)

Step 3 - Execute with queue code:
```bash
npm run execute echo-api-v1 -- \
  --config config.json \
  --provider http://provider-url \
  --queue-code QUEUE_CODE \
  --transaction TRANSACTION_SIGNATURE \
  --body '{"message":"Hello P2P!"}'
```

### Check Job Status

```bash
npm run job JOB_ID -- \
  --config config.json \
  --provider http://provider-url
```

### Download Results

```bash
npm run download JOB_ID -- \
  --config config.json \
  --url http://provider-url/results/file.png \
  --output result.png
```

## Managing Aggregators

The client can connect to multiple aggregators for redundancy and broader API discovery.

### List Aggregators

View all configured aggregators with status:

```bash
npm run aggregator list -- --config config.json
```

### Add Aggregator

Add a new aggregator to your configuration:

```bash
npm run aggregator add https://aggregator.example.com:8080 -- --config config.json
```

The CLI will test connectivity and show aggregator information before adding.

### Remove Aggregator

Remove by index or URL:

```bash
# By index (from list command)
npm run aggregator remove 2 -- --config config.json

# By URL
npm run aggregator remove https://aggregator.example.com:8080 -- --config config.json
```

### Test Connectivity

Test all configured aggregators:

```bash
npm run aggregator test -- --config config.json
```

**How Multi-Aggregator Works:**
- **Provider Mode**: Registers APIs with all aggregators
- **Consumer Mode**: Searches across all aggregators and merges results
- **Changes**: Require restart to take effect

See [AGGREGATOR_MANAGEMENT.md](../AGGREGATOR_MANAGEMENT.md) for detailed guide.

## Creating Custom Handlers

Handlers are Node.js modules that implement your API logic.

### Handler Interface

```javascript
/**
 * @param {object} params - Validated request parameters
 * @param {object} context - Execution context
 * @param {string} context.jobId - Unique job identifier
 * @param {function} context.updateProgress - Update progress (percent, message)
 * @param {function} context.saveResult - Save file to results storage
 * @returns {Promise<object>} - Response matching your response schema
 */
module.exports = async function handler(params, context) {
    const { updateProgress, saveResult, jobId } = context;

    // Update progress
    await updateProgress(50, 'Processing...');

    // Your logic here
    const result = await doWork(params);

    // Save files if needed
    if (needsFile) {
        const url = await saveResult('/tmp/output.png', 'output.png');
        return { imageUrl: url };
    }

    await updateProgress(100, 'Complete');

    return result;
};
```

### Example Handlers

See the `handlers/` directory for examples:
- [echo.js](handlers/echo.js) - Simple echo API
- [image-generator.js](handlers/image-generator.js) - ML model integration example
- [video-generator.js](handlers/video-generator.js) - Long-running job example

## Architecture

```
bob-p2p-client/
├── src/
│   ├── database/        # Database abstraction (SQLite, Postgres, Mongo, MSSQL)
│   ├── solana/          # Solana integration & payment verification
│   ├── queue/           # Queue management system
│   ├── payment/         # Payment verification & earnings tracking
│   ├── jobs/            # Job execution & handler interface
│   ├── provider/        # Provider server & aggregator registration
│   ├── consumer/        # Consumer API client
│   ├── cli/             # CLI commands
│   └── utils/           # Configuration & helpers
├── handlers/            # API handler functions
├── config.example.json  # Configuration template
└── api.example.json     # API definitions template
```

## Security Notes

- **NEVER commit `config.json`** - it contains your private keys
- Always use HTTPS for production deployments
- Keep your private keys secure
- Validate all API inputs in your handlers
- Set appropriate rate limits and capacity

## Troubleshooting

### Payment verification failed

- Ensure wallet has sufficient balance
- Check you're on the correct network (devnet/mainnet)
- Verify transaction signature is correct

### Queue code expired

- Queue codes expire after 60 seconds (or configured timeout)
- Request a new code and execute faster

### API not found

- Ensure provider is running
- Check provider registered with aggregator
- Verify API ID is correct

### Connection refused

- Check provider/aggregator is running
- Verify firewall settings
- Confirm URLs in config are correct

## Support

See full documentation:
- [Quick Start Guide](../QUICK_START.md)
- [Client Specs](specs/CLIENT_SPECS.md)
- [Security Guide](../SECURITY_AND_EDGE_CASES.md)
