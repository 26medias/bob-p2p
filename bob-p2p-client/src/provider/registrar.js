/**
 * Aggregator Registration Module
 *
 * Handles registration and heartbeat with aggregators
 */

const axios = require('axios');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');

class AggregatorRegistrar {
    constructor(config, queueManager) {
        this.config = config;
        this.queue = queueManager;
        this.aggregators = config.aggregators || [];

        // Load keypair for signing
        this.keypair = this.loadKeypair(config.wallet.privateKey);

        this.registered = false;
    }

    /**
     * Load keypair from various formats (mnemonic, array, base58)
     */
    loadKeypair(privateKey) {
        if (Array.isArray(privateKey)) {
            return Keypair.fromSecretKey(Uint8Array.from(privateKey));
        }

        if (typeof privateKey === 'string') {
            const trimmed = privateKey.trim();
            const words = trimmed.split(/\s+/);

            // Mnemonic phrase (12 or 24 words)
            if (words.length === 12 || words.length === 24) {
                return this.keypairFromMnemonic(trimmed);
            }

            // Base58 format
            return Keypair.fromSecretKey(bs58.decode(trimmed));
        }

        throw new Error('Invalid private key format');
    }

    /**
     * Create keypair from mnemonic phrase
     */
    keypairFromMnemonic(mnemonic) {
        const bip39 = require('bip39');
        const { derivePath } = require('ed25519-hd-key');

        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error('Invalid mnemonic phrase');
        }

        const seed = bip39.mnemonicToSeedSync(mnemonic, '');
        const path = "m/44'/501'/0'/0'";
        const derivedSeed = derivePath(path, seed.toString('hex')).key;

        return Keypair.fromSeed(derivedSeed);
    }

    /**
     * Get provider wallet address (from keypair, not config)
     */
    getProviderAddress() {
        return this.keypair.publicKey.toBase58();
    }

    /**
     * Register all APIs with aggregators
     */
    async registerAll() {
        const apis = this.queue.getAllApis();

        if (apis.length === 0) {
            console.log('No APIs to register');
            return;
        }

        console.log(`Registering ${apis.length} API(s) with ${this.aggregators.length} aggregator(s)...`);

        for (const aggregatorUrl of this.aggregators) {
            try {
                await this.registerWithAggregator(aggregatorUrl, apis);
                console.log(`✓ Registered with: ${aggregatorUrl}`);
            } catch (error) {
                console.error(`✗ Failed to register with ${aggregatorUrl}:`, error.message);
            }
        }

        this.registered = true;

        // Start heartbeat
        this.startHeartbeat();
    }

    /**
     * Register with a single aggregator
     */
    async registerWithAggregator(aggregatorUrl, apis) {
        const providerAddress = this.getProviderAddress();

        // For each API, register separately (aggregator expects one API per registration)
        for (const api of apis) {
            const apiPayload = {
                ...api,
                endpoint: this.config.provider.publicEndpoint,
                provider_address: providerAddress
            };

            // Sign payload
            const message = JSON.stringify(apiPayload);
            const messageBytes = Buffer.from(message, 'utf8');
            const signature = nacl.sign.detached(messageBytes, this.keypair.secretKey);
            const signatureBase64 = Buffer.from(signature).toString('base64');

            // Send registration
            await axios.post(
                `${aggregatorUrl}/api/register`,
                apiPayload,
                {
                    headers: {
                        'X-Provider-Address': providerAddress,
                        'X-Signature': signatureBase64,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
        }
    }

    /**
     * Send heartbeat to aggregators
     */
    async sendHeartbeat() {
        if (!this.registered) {
            return;
        }

        const providerAddress = this.getProviderAddress();
        const payload = {
            providerAddress: providerAddress,
            timestamp: Date.now()
        };

        const message = JSON.stringify(payload);
        const messageBytes = Buffer.from(message, 'utf8');
        const signature = nacl.sign.detached(messageBytes, this.keypair.secretKey);
        const signatureBase58 = bs58.encode(signature);

        for (const aggregatorUrl of this.aggregators) {
            try {
                await axios.post(
                    `${aggregatorUrl}/provider/heartbeat`,
                    payload,
                    {
                        headers: {
                            'X-Signature': signatureBase58,
                            'Content-Type': 'application/json'
                        },
                        timeout: 5000
                    }
                );
            } catch (error) {
                console.error(`Heartbeat failed for ${aggregatorUrl}:`, error.message);
            }
        }
    }

    /**
     * Start heartbeat interval
     */
    startHeartbeat() {
        setInterval(() => {
            this.sendHeartbeat().catch(err => {
                console.error('Heartbeat error:', err);
            });
        }, 60000); // Every 60 seconds

        console.log('Heartbeat started (60s interval)');
    }
}

module.exports = AggregatorRegistrar;
