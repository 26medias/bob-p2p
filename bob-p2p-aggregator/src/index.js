const { loadConfig } = require('./utils/config');
const AggregatorDatabase = require('./database/memory'); // Using memory db for now
const SolanaManager = require('./solana');
const AggregatorServer = require('./server');

function main() {
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
        
        console.log('Starting server...');
        const server = new AggregatorServer(database, solana, config);
        server.start();
        
        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nShutting down gracefully...');
            server.stop();
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
