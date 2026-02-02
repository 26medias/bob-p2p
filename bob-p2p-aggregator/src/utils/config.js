const fs = require('fs');
const path = require('path');

function loadConfig(configPath) {
    if (!configPath) {
        throw new Error('Config file path is required. Use --config flag.');
    }
    
    const absolutePath = path.resolve(configPath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Config file not found: ${absolutePath}`);
    }
    
    const configStr = fs.readFileSync(absolutePath, 'utf8');
    const config = JSON.parse(configStr);
    
    // Validate required fields
    if (!config.wallet?.address || !config.wallet?.privateKey) {
        throw new Error('Config must contain wallet.address and wallet.privateKey');
    }
    if (!config.token?.symbol || !config.token?.mint) {
        throw new Error('Config must contain token.symbol and token.mint');
    }
    if (!config.database) {
        throw new Error('Config must contain database settings');
    }
    if (!config.server?.port) {
        throw new Error('Config must contain server.port');
    }
    if (!config.solana?.network || !config.solana?.rpcUrl) {
        throw new Error('Config must contain solana.network and solana.rpcUrl');
    }
    
    // Set defaults
    config.server.host = config.server.host || '0.0.0.0';
    config.access = config.access || { type: 'free' };
    config.health = config.health || { checkInterval: 300, timeout: 10, maxFailures: 3 };
    config.security = config.security || { rateLimit: { enabled: true, requestsPerMinute: 100 } };
    config.solana.confirmations = config.solana.confirmations || 1;
    
    return config;
}

module.exports = { loadConfig };
