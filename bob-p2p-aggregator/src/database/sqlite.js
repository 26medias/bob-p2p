const Database = require('better-sqlite3');

class AggregatorDatabase {
    constructor(config) {
        const dbPath = config.database.path;
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.initTables();
    }

    initTables() {
        // APIs table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS apis (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                version TEXT NOT NULL,
                provider_address TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                api_spec TEXT NOT NULL,
                pricing_amount REAL NOT NULL,
                pricing_unit TEXT NOT NULL,
                capacity_concurrent INTEGER,
                capacity_queue_max INTEGER,
                capacity_queue_timeout INTEGER,
                exec_estimated_duration INTEGER,
                exec_max_duration INTEGER,
                exec_result_retention INTEGER,
                category TEXT,
                tags TEXT,
                status TEXT DEFAULT 'pending',
                last_heartbeat TIMESTAMP,
                failure_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_apis_category ON apis(category);
            CREATE INDEX IF NOT EXISTS idx_apis_status ON apis(status);
            CREATE INDEX IF NOT EXISTS idx_apis_provider ON apis(provider_address);
        `);

        // Access payments
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS access_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet_address TEXT NOT NULL,
                transaction_signature TEXT UNIQUE NOT NULL,
                amount REAL NOT NULL,
                token_mint TEXT NOT NULL,
                valid_until TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_access_wallet ON access_payments(wallet_address);
            CREATE INDEX IF NOT EXISTS idx_access_valid ON access_payments(valid_until);
        `);

        // API stats
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS api_stats (
                api_id TEXT PRIMARY KEY,
                total_calls INTEGER DEFAULT 0,
                successful_calls INTEGER DEFAULT 0,
                failed_calls INTEGER DEFAULT 0,
                total_response_time INTEGER DEFAULT 0,
                last_called TIMESTAMP,
                FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE
            );
        `);

        // Search logs
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS search_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet_address TEXT,
                search_query TEXT,
                results_count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Health checks
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS health_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_id TEXT NOT NULL,
                status TEXT NOT NULL,
                response_time INTEGER,
                error_message TEXT,
                checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (api_id) REFERENCES apis(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_health_api ON health_checks(api_id);
            CREATE INDEX IF NOT EXISTS idx_health_checked ON health_checks(checked_at);
        `);
    }

    // API operations
    registerApi(apiData) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO apis (
                id, name, description, version, provider_address, endpoint,
                api_spec, pricing_amount, pricing_unit,
                capacity_concurrent, capacity_queue_max, capacity_queue_timeout,
                exec_estimated_duration, exec_max_duration, exec_result_retention,
                category, tags, status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        return stmt.run(
            apiData.id,
            apiData.name,
            apiData.description,
            apiData.version,
            apiData.provider_address,
            apiData.endpoint,
            JSON.stringify(apiData.api),
            apiData.pricing.amount,
            apiData.pricing.unit,
            apiData.capacity?.concurrent,
            apiData.capacity?.queueMax,
            apiData.capacity?.queueTimeout,
            apiData.execution?.estimatedDuration,
            apiData.execution?.maxDuration,
            apiData.execution?.resultRetention,
            JSON.stringify(apiData.category || []),
            JSON.stringify(apiData.tags || []),
            apiData.status || 'pending'
        );
    }

    getApi(apiId) {
        const stmt = this.db.prepare('SELECT * FROM apis WHERE id = ?');
        const row = stmt.get(apiId);
        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            description: row.description,
            version: row.version,
            provider: {
                address: row.provider_address,
                endpoint: row.endpoint
            },
            api: JSON.parse(row.api_spec),
            pricing: {
                amount: row.pricing_amount,
                unit: row.pricing_unit
            },
            capacity: {
                concurrent: row.capacity_concurrent,
                queueMax: row.capacity_queue_max,
                queueTimeout: row.capacity_queue_timeout
            },
            execution: {
                estimatedDuration: row.exec_estimated_duration,
                maxDuration: row.exec_max_duration,
                resultRetention: row.exec_result_retention
            },
            category: JSON.parse(row.category || '[]'),
            tags: JSON.parse(row.tags || '[]'),
            status: row.status,
            lastSeen: row.last_heartbeat,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    searchApis(filters = {}) {
        let query = 'SELECT * FROM apis WHERE status = ?';
        const params = [filters.status || 'active'];

        if (filters.category) {
            const categories = Array.isArray(filters.category) ? filters.category : [filters.category];
            const catConditions = categories.map(() => 'category LIKE ?').join(' OR ');
            query += ` AND (${catConditions})`;
            categories.forEach(cat => params.push(`%${cat}%`));
        }

        if (filters.tags) {
            const tags = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
            const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ');
            query += ` AND (${tagConditions})`;
            tags.forEach(tag => params.push(`%${tag}%`));
        }

        if (filters.maxPrice !== undefined) {
            query += ' AND pricing_amount <= ?';
            params.push(filters.maxPrice);
        }

        query += ' ORDER BY last_heartbeat DESC LIMIT ? OFFSET ?';
        params.push(filters.limit || 20, filters.offset || 0);

        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params);

        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            provider: {
                address: row.provider_address,
                endpoint: row.endpoint
            },
            pricing: {
                amount: row.pricing_amount,
                unit: row.pricing_unit
            },
            category: JSON.parse(row.category || '[]'),
            tags: JSON.parse(row.tags || '[]'),
            status: row.status,
            lastSeen: row.last_heartbeat
        }));
    }

    updateApiStatus(apiId, status) {
        const stmt = this.db.prepare('UPDATE apis SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        return stmt.run(status, apiId);
    }

    updateHeartbeat(apiId) {
        const stmt = this.db.prepare(`
            UPDATE apis 
            SET last_heartbeat = CURRENT_TIMESTAMP, 
                failure_count = 0, 
                status = 'active',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        return stmt.run(apiId);
    }

    incrementFailureCount(apiId) {
        const stmt = this.db.prepare('UPDATE apis SET failure_count = failure_count + 1 WHERE id = ?');
        return stmt.run(apiId);
    }

    deleteApi(apiId) {
        const stmt = this.db.prepare('DELETE FROM apis WHERE id = ?');
        return stmt.run(apiId);
    }

    // Access operations
    recordAccess(walletAddress, txSignature, amount, tokenMint, validUntil) {
        const stmt = this.db.prepare(`
            INSERT INTO access_payments (wallet_address, transaction_signature, amount, token_mint, valid_until)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(walletAddress, txSignature, amount, tokenMint, validUntil);
    }

    checkAccess(walletAddress) {
        const stmt = this.db.prepare(`
            SELECT * FROM access_payments
            WHERE wallet_address = ? AND valid_until > datetime('now')
            ORDER BY valid_until DESC LIMIT 1
        `);
        return stmt.get(walletAddress);
    }

    // Stats
    getStats() {
        const total = this.db.prepare('SELECT COUNT(*) as count FROM apis').get().count;
        const active = this.db.prepare("SELECT COUNT(*) as count FROM apis WHERE status = 'active'").get().count;
        const offline = this.db.prepare("SELECT COUNT(*) as count FROM apis WHERE status = 'offline'").get().count;
        
        return { total, active, offline };
    }

    getCategories() {
        const apis = this.db.prepare("SELECT category FROM apis WHERE status = 'active'").all();
        const catCount = {};
        apis.forEach(api => {
            const cats = JSON.parse(api.category || '[]');
            cats.forEach(cat => {
                catCount[cat] = (catCount[cat] || 0) + 1;
            });
        });
        return Object.entries(catCount).map(([name, count]) => ({ name, count }));
    }

    close() {
        this.db.close();
    }
}

module.exports = AggregatorDatabase;
