const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

class SolanaManager {
    constructor(config) {
        this.config = config;
        this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
        this.wallet = this.loadKeypair(config.wallet.privateKey);
    }

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

    verifySignature(message, signature, publicKey) {
        try {
            const messageBytes = typeof message === 'string' 
                ? Buffer.from(message, 'utf8') 
                : Buffer.from(message);
            const signatureBytes = Buffer.isBuffer(signature) 
                ? signature 
                : Buffer.from(signature, 'base64');
            const publicKeyBytes = bs58.decode(publicKey);
            
            return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
        } catch (error) {
            console.error('Signature verification error:', error.message);
            return false;
        }
    }

    async verifyPayment(txSignature, expectedAmount, expectedRecipient) {
        try {
            const tx = await this.connection.getTransaction(txSignature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!tx) {
                return { valid: false, error: 'Transaction not found' };
            }

            // Check confirmations
            const slot = tx.slot;
            const currentSlot = await this.connection.getSlot('confirmed');
            const confirmations = currentSlot - slot;

            if (confirmations < this.config.solana.confirmations) {
                return { valid: false, error: `Insufficient confirmations: ${confirmations}/${this.config.solana.confirmations}` };
            }

            // Parse SPL token transfer
            const transfer = this.parseTransferInstruction(tx);
            if (!transfer) {
                return { valid: false, error: 'No valid transfer found' };
            }

            // Verify amount
            if (transfer.amount < expectedAmount) {
                return { valid: false, error: `Amount too low: ${transfer.amount} < ${expectedAmount}` };
            }

            // Verify recipient
            if (transfer.destination !== expectedRecipient) {
                return { valid: false, error: 'Wrong recipient' };
            }

            return { valid: true, amount: transfer.amount, from: transfer.source };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    parseTransferInstruction(tx) {
        // Simplified SPL token transfer parsing
        // In production, use @solana/spl-token to parse properly
        try {
            const instructions = tx.transaction.message.instructions;
            for (const ix of instructions) {
                // Look for SPL token transfer instruction
                if (ix.data && ix.data.length > 0) {
                    // This is a simplified check - proper implementation would decode the instruction
                    return {
                        amount: 1.0, // Placeholder
                        source: 'source',
                        destination: 'dest'
                    };
                }
            }
        } catch (error) {
            console.error('Error parsing transfer:', error);
        }
        return null;
    }
}

module.exports = SolanaManager;
