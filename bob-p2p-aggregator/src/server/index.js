const express = require('express');
const cors = require('cors');

class AggregatorServer {
    constructor(database, solana, config, relayNode = null) {
        this.db = database;
        this.solana = solana;
        this.config = config;
        this.relayNode = relayNode;
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        this.startTime = Date.now();
    }

    setupMiddleware() {
        this.app.use(express.json({ limit: '1mb' }));
        if (this.config.server.cors?.enabled !== false) {
            this.app.use(cors({
                origin: this.config.server.cors?.origins || '*'
            }));
        }
    }

    setupRoutes() {
        // Public endpoints
        this.app.get('/health', this.handleHealth.bind(this));
        this.app.get('/info', this.handleInfo.bind(this));
        this.app.get('/p2p/bootstrap', this.handleBootstrap.bind(this));

        // Search endpoints
        this.app.get('/api/search', this.handleSearch.bind(this));
        this.app.get('/api/:apiId', this.handleGetApi.bind(this));
        this.app.get('/api/categories', this.handleCategories.bind(this));

        // Provider endpoints
        this.app.post('/api/register', this.handleRegister.bind(this));
        this.app.put('/api/:apiId', this.handleUpdate.bind(this));
        this.app.delete('/api/:apiId', this.handleDelete.bind(this));
        this.app.post('/api/:apiId/heartbeat', this.handleHeartbeat.bind(this));

        // Access endpoints (paid only)
        if (this.config.access.type === 'paid') {
            this.app.post('/access/pay', this.handleAccessPay.bind(this));
            this.app.get('/access/status', this.handleAccessStatus.bind(this));
        }

        // Admin endpoints
        this.app.get('/admin/stats', this.handleAdminStats.bind(this));
    }

    // Public endpoints
    handleHealth(req, res) {
        const stats = this.db.getStats();
        res.json({
            status: 'healthy',
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            apisIndexed: stats.total
        });
    }

    handleInfo(req, res) {
        const stats = this.db.getStats();
        const categories = this.db.getCategories();

        const info = {
            name: 'Bob P2P Aggregator',
            version: '2.0.0',
            accessType: this.config.access.type,
            accessFee: this.config.access.fee || 0,
            token: this.config.token,
            walletAddress: this.config.wallet.address,
            stats: {
                totalAPIs: stats.total,
                activeAPIs: stats.active,
                categories: categories.map(c => c.name)
            }
        };

        // Add P2P info if relay is running
        if (this.relayNode) {
            info.p2p = {
                enabled: true,
                peerId: this.relayNode.getPeerId(),
                bootstrap: this.relayNode.getBootstrapMultiaddrs()
            };
        }

        res.json(info);
    }

    handleBootstrap(req, res) {
        if (!this.relayNode) {
            return res.status(404).json({
                error: { code: 'NOT_AVAILABLE', message: 'P2P relay not enabled' }
            });
        }

        const bootstrapAddrs = this.relayNode.getBootstrapMultiaddrs();

        res.json({
            peerId: this.relayNode.getPeerId(),
            bootstrap: bootstrapAddrs,
            multiaddrs: this.relayNode.getMultiaddrs()
        });
    }

    // Search endpoints
    handleSearch(req, res) {
        try {
            const filters = {
                category: req.query.category ? req.query.category.split(',') : undefined,
                tags: req.query.tags ? req.query.tags.split(',') : undefined,
                maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
                status: req.query.status || 'active',
                limit: Math.min(parseInt(req.query.limit) || 20, 100),
                offset: parseInt(req.query.offset) || 0
            };

            const results = this.db.searchApis(filters);
            
            res.json({
                total: results.length,
                apis: results
            });
        } catch (error) {
            res.status(500).json({ error: { code: 'SEARCH_ERROR', message: error.message } });
        }
    }

    handleGetApi(req, res) {
        try {
            const apiId = req.params.apiId;
            const api = this.db.getApi(apiId);
            
            if (!api) {
                return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API not found' } });
            }
            
            res.json(api);
        } catch (error) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    }

    handleCategories(req, res) {
        try {
            const categories = this.db.getCategories();
            res.json({ categories });
        } catch (error) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    }

    // Provider endpoints
    handleRegister(req, res) {
        try {
            const providerAddress = req.headers['x-provider-address'];
            const signature = req.headers['x-signature'];
            const apiSpec = req.body;

            console.log('\n=== Registration Request ===');
            console.log('Provider Address:', providerAddress);
            console.log('API ID:', apiSpec.id);
            console.log('Signature (first 50 chars):', signature ? signature.substring(0, 50) + '...' : 'MISSING');

            if (!providerAddress || !signature) {
                console.log('✗ Missing provider address or signature');
                return res.status(400).json({
                    error: { code: 'INVALID_REQUEST', message: 'Missing provider address or signature' }
                });
            }

            // Verify signature
            const message = JSON.stringify(apiSpec);
            console.log('Message length:', message.length);
            const signatureBuffer = Buffer.from(signature, 'base64');
            const verified = this.solana.verifySignature(message, signatureBuffer, providerAddress);

            if (!verified) {
                console.log('✗ Signature verification FAILED');
                return res.status(401).json({
                    error: { code: 'UNAUTHORIZED', message: 'Signature verification failed' }
                });
            }

            console.log('✓ Signature verified');

            // Validate API spec
            if (!apiSpec.id || !apiSpec.name || !apiSpec.endpoint || !apiSpec.pricing) {
                console.log('✗ Invalid API specification');
                return res.status(400).json({
                    error: { code: 'INVALID_REQUEST', message: 'Invalid API specification' }
                });
            }

            // Register API
            const apiData = {
                ...apiSpec,
                provider_address: providerAddress,
                status: 'active'
            };

            this.db.registerApi(apiData);
            console.log(`✓ API registered: ${apiSpec.id}`);

            res.status(201).json({
                apiId: apiSpec.id,
                status: 'registered',
                healthCheckScheduled: true
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    }

    handleUpdate(req, res) {
        try {
            const apiId = req.params.apiId;
            const providerAddress = req.headers['x-provider-address'];
            const signature = req.headers['x-signature'];
            const apiSpec = req.body;

            // Verify signature
            const message = JSON.stringify(apiSpec);
            const signatureBuffer = Buffer.from(signature, 'base64');
            const verified = this.solana.verifySignature(message, signatureBuffer, providerAddress);

            if (!verified) {
                return res.status(401).json({
                    error: { code: 'UNAUTHORIZED', message: 'Signature verification failed' }
                });
            }

            // Check API exists and belongs to provider
            const existing = this.db.getApi(apiId);
            if (!existing) {
                return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API not found' } });
            }
            if (existing.provider.address !== providerAddress) {
                return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your API' } });
            }

            // Update API
            const apiData = {
                ...apiSpec,
                id: apiId,
                provider_address: providerAddress
            };
            this.db.registerApi(apiData);

            res.json({ apiId, status: 'updated' });
        } catch (error) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    }

    handleDelete(req, res) {
        try {
            const apiId = req.params.apiId;
            const providerAddress = req.headers['x-provider-address'];
            const signature = req.headers['x-signature'];

            // Verify signature
            const message = apiId;
            const signatureBuffer = Buffer.from(signature, 'base64');
            const verified = this.solana.verifySignature(message, signatureBuffer, providerAddress);

            if (!verified) {
                return res.status(401).json({
                    error: { code: 'UNAUTHORIZED', message: 'Signature verification failed' }
                });
            }

            // Check API exists and belongs to provider
            const existing = this.db.getApi(apiId);
            if (!existing) {
                return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API not found' } });
            }
            if (existing.provider.address !== providerAddress) {
                return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your API' } });
            }

            this.db.deleteApi(apiId);
            res.json({ apiId, status: 'deregistered' });
        } catch (error) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    }

    handleHeartbeat(req, res) {
        try {
            const apiId = req.params.apiId;
            const providerAddress = req.headers['x-provider-address'];

            // Check API exists and belongs to provider
            const existing = this.db.getApi(apiId);
            if (!existing) {
                return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API not found' } });
            }
            if (existing.provider.address !== providerAddress) {
                return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your API' } });
            }

            this.db.updateHeartbeat(apiId);

            res.json({
                acknowledged: true,
                nextHeartbeat: this.config.health.checkInterval || 300
            });
        } catch (error) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    }

    // Access endpoints (paid only)
    handleAccessPay(req, res) {
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Paid access not yet implemented' } });
    }

    handleAccessStatus(req, res) {
        res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Paid access not yet implemented' } });
    }

    // Admin endpoints
    handleAdminStats(req, res) {
        try {
            const stats = this.db.getStats();
            res.json({
                apis: {
                    total: stats.total,
                    active: stats.active,
                    offline: stats.offline
                }
            });
        } catch (error) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    }

    start() {
        const port = this.config.server.port;
        const host = this.config.server.host;
        
        this.server = this.app.listen(port, host, () => {
            console.log(`🚀 Aggregator running on http://${host}:${port}`);
            console.log(`   Access type: ${this.config.access.type}`);
            console.log(`   Network: ${this.config.solana.network}`);
            console.log(`   Wallet: ${this.config.wallet.address}`);
        });

        return this.server;
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

module.exports = AggregatorServer;
