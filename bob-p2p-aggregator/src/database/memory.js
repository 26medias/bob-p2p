// Simple in-memory database for testing
class MemoryDatabase {
    constructor(config) {
        this.apis = new Map();
        this.accessPayments = [];
        this.stats = { total: 0, active: 0, offline: 0 };
    }

    initTables() {
        // No-op for memory db
    }

    registerApi(apiData) {
        this.apis.set(apiData.id, {
            ...apiData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_heartbeat: new Date().toISOString(),
            failure_count: 0,
            status: apiData.status || 'active'
        });
        this.stats.total = this.apis.size;
        this.stats.active = Array.from(this.apis.values()).filter(a => a.status === 'active').length;
        return { changes: 1 };
    }

    getApi(apiId) {
        const api = this.apis.get(apiId);
        if (!api) return null;
        
        return {
            id: api.id,
            name: api.name,
            description: api.description,
            version: api.version,
            provider: {
                address: api.provider_address,
                endpoint: api.endpoint
            },
            api: api.api,
            pricing: api.pricing,
            capacity: api.capacity,
            execution: api.execution,
            category: api.category || [],
            tags: api.tags || [],
            status: api.status,
            lastSeen: api.last_heartbeat
        };
    }

    searchApis(filters = {}) {
        let results = Array.from(this.apis.values());
        
        results = results.filter(api => api.status === (filters.status || 'active'));
        
        if (filters.category) {
            const cats = Array.isArray(filters.category) ? filters.category : [filters.category];
            results = results.filter(api => 
                cats.some(cat => (api.category || []).includes(cat))
            );
        }
        
        if (filters.tags) {
            const tags = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
            results = results.filter(api =>
                tags.some(tag => (api.tags || []).includes(tag))
            );
        }
        
        if (filters.maxPrice !== undefined) {
            results = results.filter(api => api.pricing.amount <= filters.maxPrice);
        }
        
        results.sort((a, b) => new Date(b.last_heartbeat) - new Date(a.last_heartbeat));
        
        const offset = filters.offset || 0;
        const limit = filters.limit || 20;
        results = results.slice(offset, offset + limit);
        
        return results.map(api => ({
            id: api.id,
            name: api.name,
            description: api.description,
            provider: {
                address: api.provider_address,
                endpoint: api.endpoint
            },
            pricing: api.pricing,
            category: api.category,
            tags: api.tags,
            status: api.status,
            lastSeen: api.last_heartbeat
        }));
    }

    updateApiStatus(apiId, status) {
        const api = this.apis.get(apiId);
        if (api) {
            api.status = status;
            api.updated_at = new Date().toISOString();
            this.stats.active = Array.from(this.apis.values()).filter(a => a.status === 'active').length;
        }
        return { changes: api ? 1 : 0 };
    }

    updateHeartbeat(apiId) {
        const api = this.apis.get(apiId);
        if (api) {
            api.last_heartbeat = new Date().toISOString();
            api.failure_count = 0;
            api.status = 'active';
            api.updated_at = new Date().toISOString();
            this.stats.active = Array.from(this.apis.values()).filter(a => a.status === 'active').length;
        }
        return { changes: api ? 1 : 0 };
    }

    incrementFailureCount(apiId) {
        const api = this.apis.get(apiId);
        if (api) {
            api.failure_count++;
        }
        return { changes: api ? 1 : 0 };
    }

    deleteApi(apiId) {
        const deleted = this.apis.delete(apiId);
        if (deleted) {
            this.stats.total = this.apis.size;
            this.stats.active = Array.from(this.apis.values()).filter(a => a.status === 'active').length;
        }
        return { changes: deleted ? 1 : 0 };
    }

    recordAccess(walletAddress, txSignature, amount, tokenMint, validUntil) {
        this.accessPayments.push({
            wallet_address: walletAddress,
            transaction_signature: txSignature,
            amount,
            token_mint: tokenMint,
            valid_until: validUntil,
            created_at: new Date().toISOString()
        });
        return { changes: 1 };
    }

    checkAccess(walletAddress) {
        const now = new Date();
        const valid = this.accessPayments
            .filter(p => p.wallet_address === walletAddress && new Date(p.valid_until) > now)
            .sort((a, b) => new Date(b.valid_until) - new Date(a.valid_until))[0];
        return valid || null;
    }

    getStats() {
        return {
            total: this.apis.size,
            active: Array.from(this.apis.values()).filter(a => a.status === 'active').length,
            offline: Array.from(this.apis.values()).filter(a => a.status === 'offline').length
        };
    }

    getCategories() {
        const catCount = {};
        Array.from(this.apis.values())
            .filter(api => api.status === 'active')
            .forEach(api => {
                (api.category || []).forEach(cat => {
                    catCount[cat] = (catCount[cat] || 0) + 1;
                });
            });
        return Object.entries(catCount).map(([name, count]) => ({ name, count }));
    }

    close() {
        // No-op for memory db
    }
}

module.exports = MemoryDatabase;
