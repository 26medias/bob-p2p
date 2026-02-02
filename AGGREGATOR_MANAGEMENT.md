# Aggregator Management Guide

## Overview

P2P clients can connect to multiple aggregators simultaneously for:
- **Provider Mode**: Register APIs with multiple discovery services
- **Consumer Mode**: Search APIs across multiple aggregator networks

This guide explains how to manage aggregators dynamically.

## How It Works

### Configuration Storage
Aggregators are stored in the `config.json` file:

```json
{
    "aggregators": [
        "http://localhost:8080",
        "https://aggregator1.example.com",
        "https://aggregator2.example.com"
    ]
}
```

### Provider Behavior
When a provider starts, it:
1. Registers all APIs with **all** configured aggregators
2. Sends heartbeats to **all** aggregators every 60 seconds
3. Continues functioning even if some aggregators are offline

### Consumer Behavior
When searching for APIs, the consumer:
1. Queries **all** configured aggregators in parallel
2. Merges results from all sources
3. Deduplicates by API ID and provider address
4. Returns unified search results

## CLI Management

### List Aggregators

View all configured aggregators and their status:

```bash
npm run aggregator list -- --config config.json
```

Output:
```
=== Configured Aggregators ===

1. http://localhost:8080
   Status: ✓ Online
   Name: Bob P2P Aggregator
   Version: 2.0.0
   Access Type: free
   Total APIs: 3

2. https://aggregator2.example.com
   Status: ✗ Offline (connect ECONNREFUSED)
```

### Add Aggregator

Add a new aggregator to the configuration:

```bash
npm run aggregator add <url> -- --config config.json
```

Example:
```bash
npm run aggregator add https://aggregator.example.com:8080 -- --config config.json
```

The CLI will:
1. Validate the URL format
2. Test connectivity to the aggregator
3. Display aggregator information
4. Add to config if successful

### Remove Aggregator

Remove an aggregator by URL or index:

```bash
# By index (from list command)
npm run aggregator remove 2 -- --config config.json

# By URL
npm run aggregator remove https://aggregator.example.com:8080 -- --config config.json
```

### Test Connectivity

Test connectivity to all configured aggregators:

```bash
npm run aggregator test -- --config config.json
```

Output:
```
=== Testing All Aggregators ===

✓ http://localhost:8080 - Online
✗ https://aggregator2.example.com - Offline (connect ECONNREFUSED)

1/2 aggregators online
```

## Runtime vs Config-Based Management

### Current Implementation: Config-Based
- Aggregators are loaded at startup from `config.json`
- Changes require **restart** of provider/consumer
- Safe and predictable behavior
- No risk of losing aggregators on crash

### Future: Runtime Management (Not Implemented)
If runtime management is needed, the system would need:
1. Hot-reload of aggregator list
2. Dynamic registration/deregistration
3. State persistence to disk
4. Graceful handling of in-flight requests

For now, use config-based management and restart when adding/removing aggregators.

## Multi-Aggregator Strategies

### Strategy 1: Local + Public Aggregators
Best for development and production:

```json
{
    "aggregators": [
        "http://localhost:8080",              // Local test aggregator
        "https://aggregator.bobp2p.network"   // Public production aggregator
    ]
}
```

### Strategy 2: Multiple Public Aggregators
For maximum API discovery:

```json
{
    "aggregators": [
        "https://aggregator1.bobp2p.network",
        "https://aggregator2.bobp2p.network",
        "https://community-aggregator.example.com"
    ]
}
```

### Strategy 3: Private Network Only
For closed networks:

```json
{
    "aggregators": [
        "http://192.168.1.100:8080",
        "http://192.168.1.101:8080"
    ]
}
```

## Best Practices

### 1. Always Test After Adding
After adding an aggregator, test connectivity:

```bash
npm run aggregator add <url> -- --config config.json
npm run aggregator test -- --config config.json
```

### 2. Monitor Aggregator Health
Periodically check aggregator status:

```bash
npm run aggregator list -- --config config.json
```

### 3. Use HTTPS in Production
For public aggregators, always use HTTPS:

```json
{
    "aggregators": [
        "https://aggregator.example.com"  // ✓ Secure
    ]
}
```

Avoid HTTP for production:
```json
{
    "aggregators": [
        "http://aggregator.example.com"   // ✗ Insecure for public networks
    ]
}
```

### 4. Keep Backup Aggregators
Configure at least 2 aggregators for redundancy:

```json
{
    "aggregators": [
        "https://primary.example.com",
        "https://backup.example.com"
    ]
}
```

### 5. Remove Offline Aggregators
Remove consistently offline aggregators to improve startup time:

```bash
npm run aggregator remove <url> -- --config config.json
```

## Aggregator Selection Criteria

When choosing aggregators, consider:

1. **Uptime**: Check historical availability
2. **Latency**: Test response times
3. **API Coverage**: Number of indexed APIs
4. **Access Type**: Free vs paid
5. **Network**: Mainnet vs devnet vs testnet
6. **Trust**: Reputation of operator

## Troubleshooting

### Aggregator Shows Offline
1. Check network connectivity:
   ```bash
   curl http://aggregator.example.com:8080/health
   ```

2. Verify firewall rules allow outbound connections

3. Check aggregator is actually running

### Provider Fails to Register
1. Check aggregator logs for errors
2. Verify signature verification is working
3. Test with `npm run aggregator test`

### Consumer Can't Find APIs
1. Verify aggregators are online: `npm run aggregator list`
2. Check APIs are registered: `curl http://aggregator.example.com:8080/api/search`
3. Verify network connectivity

## API Integration

### Programmatic Access

The aggregator management module can be used programmatically:

```javascript
const { loadConfig, saveConfig, testAggregator } = require('./src/cli/aggregator-manage.js');

// Load config
const config = loadConfig('./config.json');

// Add aggregator
config.aggregators.push('https://new-aggregator.example.com');
saveConfig('./config.json', config);

// Test aggregator
const result = await testAggregator('https://aggregator.example.com');
console.log(result.success ? 'Online' : 'Offline');
```

### Consumer Search Across Aggregators

The consumer automatically queries all aggregators:

```javascript
const consumer = new Consumer(config, solanaClient);

// Searches across all configured aggregators
const results = await consumer.searchApis({
    category: 'ml',
    tags: 'image-generation'
});

// Results are merged and deduplicated
console.log(`Found ${results.length} APIs across all aggregators`);
```

## Security Considerations

### 1. Aggregator Trust
Only add aggregators you trust:
- Aggregators can see your search queries
- Malicious aggregators could return fake API listings

### 2. HTTPS for Public Networks
Always use HTTPS for aggregators on public internet:
- Prevents man-in-the-middle attacks
- Protects API search queries

### 3. Signature Verification
Providers sign all registration requests:
- Aggregators verify provider identity
- Prevents unauthorized API registration

### 4. No Credentials in Aggregator List
Aggregators are public endpoints:
- No authentication credentials needed
- Access control is at the API level, not aggregator level

## Future Enhancements

Potential future features:
1. **Hot-reload**: Change aggregators without restart
2. **Health monitoring**: Automatic removal of dead aggregators
3. **Load balancing**: Distribute searches across aggregators
4. **Caching**: Cache aggregator responses
5. **Priority**: Prefer certain aggregators over others
6. **Rate limiting**: Limit requests per aggregator

## Summary

Aggregator management is:
- **Config-based**: Stored in `config.json`
- **Multi-aggregator**: Connect to unlimited aggregators
- **CLI-managed**: Add/remove/test via npm scripts
- **Restart-required**: Changes need provider/consumer restart
- **Fail-safe**: System works even if some aggregators are offline

For most users, 1-2 reliable aggregators are sufficient.
