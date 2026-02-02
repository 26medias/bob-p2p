#!/usr/bin/env node

/**
 * Provider CLI - Start provider server
 *
 * Usage: npm run provide -- --config config.json --apis api.json
 */

const minimist = require('minimist');
const { loadConfig, loadApiDefinitions } = require('../utils/config');
const Database = require('../database');
const SolanaClient = require('../solana');
const QueueManager = require('../queue');
const PaymentVerifier = require('../payment');
const JobExecutor = require('../jobs');
const ProviderServer = require('../provider/server');
const AggregatorRegistrar = require('../provider/registrar');

async function main() {
    const args = minimist(process.argv.slice(2));

    console.log('Bob P2P Client (Provider Mode) starting...\n');

    try {
        // Load configuration
        if (!args.config) {
            console.error('Error: --config argument required');
            console.log('Usage: npm run provide -- --config config.json --apis api.json');
            process.exit(1);
        }

        const config = loadConfig(args.config);

        // Check provider is enabled
        if (!config.provider || !config.provider.enabled) {
            console.error('Error: Provider mode not enabled in config');
            process.exit(1);
        }

        // Load API definitions
        if (!args.apis) {
            console.error('Error: --apis argument required');
            console.log('Usage: npm run provide -- --config config.json --apis api.json');
            process.exit(1);
        }

        const apiDefinitions = loadApiDefinitions(args.apis);

        console.log(`Loading APIs from ${args.apis}...`);
        console.log(`Registered ${apiDefinitions.apis.length} API(s):`);
        for (const api of apiDefinitions.apis) {
            console.log(`  - ${api.id} (${api.name})`);
        }
        console.log();

        // Initialize database
        console.log('Initializing database...');
        const database = new Database(config);
        await database.connect();

        // Initialize Solana client
        console.log('Initializing Solana client...');
        const solana = new SolanaClient(config);

        // Initialize queue manager
        console.log('Initializing queue manager...');
        const queueManager = new QueueManager(database, config);

        // Register APIs
        for (const api of apiDefinitions.apis) {
            queueManager.registerApi(api);
        }

        // Initialize payment verifier
        console.log('Initializing payment verifier...');
        const paymentVerifier = new PaymentVerifier(database, solana, config);

        // Initialize job executor
        console.log('Initializing job executor...');
        const jobExecutor = new JobExecutor(database, config);

        // Register handlers
        for (const api of apiDefinitions.apis) {
            await jobExecutor.registerHandler(api);
        }

        // Create and start server
        console.log('Starting provider server...');
        const server = new ProviderServer(config, queueManager, paymentVerifier, jobExecutor);
        server.start();

        console.log(`\nProvider server listening on http://0.0.0.0:${config.provider.port}`);
        console.log(`Public endpoint: ${config.provider.publicEndpoint}`);
        console.log(`Wallet: ${config.wallet.address}\n`);

        // Register with aggregators
        if (config.aggregators && config.aggregators.length > 0) {
            console.log('Registering with aggregators...');
            const registrar = new AggregatorRegistrar(config, queueManager);
            await registrar.registerAll();
            console.log();
        }

        console.log('✓ Provider ready!\n');

    } catch (error) {
        console.error('Error starting provider:', error.message);
        process.exit(1);
    }
}

main();
