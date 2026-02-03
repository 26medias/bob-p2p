/**
 * P2P Relay Node for Aggregator
 *
 * Provides:
 * - Bootstrap node for peer discovery
 * - Circuit relay for NAT traversal
 * - DHT node for distributed peer discovery
 */

// Use dynamic imports for ESM packages
let libp2pModules = null;

async function loadLibp2pModules() {
    if (libp2pModules) return libp2pModules;

    const [
        { createLibp2p },
        { noise },
        { mplex },
        { tcp },
        { webSockets },
        { kadDHT },
        { identify },
        { circuitRelayServer },
        { ping }
    ] = await Promise.all([
        import('libp2p'),
        import('@chainsafe/libp2p-noise'),
        import('@libp2p/mplex'),
        import('@libp2p/tcp'),
        import('@libp2p/websockets'),
        import('@libp2p/kad-dht'),
        import('@libp2p/identify'),
        import('@libp2p/circuit-relay-v2'),
        import('@libp2p/ping')
    ]);

    libp2pModules = {
        createLibp2p,
        noise,
        mplex,
        tcp,
        webSockets,
        kadDHT,
        identify,
        circuitRelayServer,
        ping
    };

    return libp2pModules;
}

class RelayNode {
    constructor(config) {
        this.config = config;
        this.libp2p = null;
    }

    /**
     * Start the relay node
     */
    async start() {
        console.log('Starting P2P Relay Node...');

        // Load libp2p modules dynamically
        const {
            createLibp2p,
            noise,
            mplex,
            tcp,
            webSockets,
            kadDHT,
            identify,
            circuitRelayServer,
            ping
        } = await loadLibp2pModules();

        const relayConfig = this.config.p2p?.relay || {};
        const port = relayConfig.port || 4001;
        const wsPort = relayConfig.wsPort || 4002;

        this.libp2p = await createLibp2p({
            addresses: {
                listen: [
                    `/ip4/0.0.0.0/tcp/${port}`,
                    `/ip4/0.0.0.0/tcp/${wsPort}/ws`
                ]
            },
            transports: [
                tcp(),
                webSockets()
            ],
            connectionEncrypters: [
                noise()
            ],
            streamMuxers: [
                mplex()
            ],
            services: {
                identify: identify(),
                ping: ping(),
                dht: kadDHT({
                    clientMode: false, // Act as DHT server
                    validators: {},
                    selectors: {}
                }),
                relay: circuitRelayServer({
                    reservations: {
                        maxReservations: 100 // Allow up to 100 peers to use as relay
                    }
                })
            }
        });

        await this.libp2p.start();

        const peerId = this.libp2p.peerId.toString();
        const addrs = this.libp2p.getMultiaddrs();

        console.log('P2P Relay Node started!');
        console.log(`Peer ID: ${peerId}`);
        console.log('Listening on:');
        addrs.forEach(addr => console.log(`  ${addr.toString()}`));

        // Listen for connections
        this.libp2p.addEventListener('peer:connect', (evt) => {
            const connection = evt.detail;
            console.log(`Peer connected: ${connection.remotePeer.toString()}`);
        });

        this.libp2p.addEventListener('peer:disconnect', (evt) => {
            const connection = evt.detail;
            console.log(`Peer disconnected: ${connection.remotePeer.toString()}`);
        });

        return this.libp2p;
    }

    /**
     * Stop the relay node
     */
    async stop() {
        if (this.libp2p) {
            console.log('Stopping P2P Relay Node...');
            await this.libp2p.stop();
            console.log('P2P Relay Node stopped');
        }
    }

    /**
     * Get peer ID
     */
    getPeerId() {
        return this.libp2p?.peerId?.toString();
    }

    /**
     * Get all multiaddresses
     */
    getMultiaddrs() {
        if (!this.libp2p) {
            return [];
        }
        return this.libp2p.getMultiaddrs().map(addr => addr.toString());
    }

    /**
     * Get public multiaddresses (for bootstrapping)
     */
    getPublicMultiaddrs() {
        const addrs = this.getMultiaddrs();

        // Filter to get public addresses
        // In production, you'd use the actual public IP
        // For now, return all non-localhost addresses
        return addrs.filter(addr => {
            return !addr.includes('127.0.0.1') && !addr.includes('localhost');
        });
    }

    /**
     * Get bootstrap multiaddresses to give to clients
     * These include the peer ID for direct connection
     */
    getBootstrapMultiaddrs() {
        if (!this.libp2p) {
            return [];
        }

        const peerId = this.getPeerId();
        const addrs = this.getMultiaddrs();

        // Check if EXTERNAL_IP is provided (for cloud deployments)
        const externalIP = process.env.EXTERNAL_IP;

        // Add peer ID to multiaddrs for bootstrap
        let bootstrapAddrs = addrs
            .filter(addr => !addr.includes('127.0.0.1') && !addr.includes('localhost'))
            .map(addr => {
                // If addr doesn't already include peer ID, add it
                if (!addr.includes('/p2p/')) {
                    return `${addr}/p2p/${peerId}`;
                }
                return addr;
            });

        // If external IP is provided, replace internal IPs with external IP
        if (externalIP) {
            bootstrapAddrs = bootstrapAddrs.map(addr => {
                // Replace internal IP with external IP (assumes GCP internal IP pattern)
                return addr.replace(/\/ip4\/10\.\d+\.\d+\.\d+\//, `/ip4/${externalIP}/`);
            });
        }

        return bootstrapAddrs;
    }

    /**
     * Get connected peers
     */
    getConnectedPeers() {
        if (!this.libp2p) {
            return [];
        }

        const connections = this.libp2p.getConnections();
        return connections.map(conn => ({
            peerId: conn.remotePeer.toString(),
            remoteAddr: conn.remoteAddr.toString(),
            status: conn.status
        }));
    }
}

module.exports = RelayNode;
