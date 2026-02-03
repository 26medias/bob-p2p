const { loadConfig } = require('./utils/config');
const AggregatorDatabase = require('./database/memory'); // Using memory db for now
const SolanaManager = require('./solana');
const AggregatorServer = require('./server');
const RelayNode = require('./p2p/relay-node');

async function main() {
    const args = process.argv.slice(2);
    const configIndex = args.indexOf('--config');
    
    if (configIndex === -1) {
        console.error('Usage: node src/index.js --config <path-to-config.json>');
        process.exit(1);
    }
    
    const configPath = args[configIndex + 1];
    
    try {
        console.log('Loading configuration...');
        const config = loadConfig(configPath);

        console.log('Initializing database...');
        const database = new AggregatorDatabase(config);

        console.log('Initializing Solana manager...');
        const solana = new SolanaManager(config);

        // Start P2P relay node if enabled
        let relayNode = null;
        if (config.p2p && config.p2p.enabled !== false) {
            console.log('Starting P2P relay node...');
            relayNode = new RelayNode(config);
            await relayNode.start();
            console.log('\nP2P Relay is ready for bootstrap!');

            const bootstrapAddrs = relayNode.getBootstrapMultiaddrs();
            if (bootstrapAddrs.length > 0) {
                console.log('\nBootstrap addresses for clients:');
                bootstrapAddrs.forEach(addr => console.log(`  ${addr}`));
            }
            console.log();
        }

        console.log('Starting HTTP server...');
        const server = new AggregatorServer(database, solana, config, relayNode);
        server.start();

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\nShutting down gracefully...');
            server.stop();
            if (relayNode) {
                await relayNode.stop();
            }
            database.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };
