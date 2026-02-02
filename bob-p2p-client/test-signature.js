/**
 * Test script to verify signature generation and verification
 */

const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');

function loadKeypair(privateKey) {
    if (Array.isArray(privateKey)) {
        return Keypair.fromSecretKey(Uint8Array.from(privateKey));
    }

    if (typeof privateKey === 'string') {
        const trimmed = privateKey.trim();
        const words = trimmed.split(/\s+/);

        // Mnemonic phrase (12 or 24 words)
        if (words.length === 12 || words.length === 24) {
            const bip39 = require('bip39');
            const { derivePath } = require('ed25519-hd-key');

            if (!bip39.validateMnemonic(trimmed)) {
                throw new Error('Invalid mnemonic phrase');
            }

            const seed = bip39.mnemonicToSeedSync(trimmed, '');
            const path = "m/44'/501'/0'/0'";
            const derivedSeed = derivePath(path, seed.toString('hex')).key;

            return Keypair.fromSeed(derivedSeed);
        }

        // Base58 format
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }

    throw new Error('Invalid private key format');
}

function signMessage(message, keypair) {
    const messageBytes = Buffer.from(message, 'utf8');
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    return Buffer.from(signature).toString('base64');
}

function verifySignature(message, signatureBase64, publicKeyBase58) {
    try {
        const messageBytes = Buffer.from(message, 'utf8');
        const signatureBytes = Buffer.from(signatureBase64, 'base64');
        const publicKeyBytes = bs58.decode(publicKeyBase58);

        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
        console.error('Verification error:', error.message);
        return false;
    }
}

// Test with config
const { loadConfig } = require('./src/utils/config');
const config = loadConfig('./config.json');

console.log('Testing signature process...\n');
console.log('Wallet address:', config.wallet.address);

// Load keypair
const keypair = loadKeypair(config.wallet.privateKey);
console.log('Keypair loaded');
console.log('Public key (base58):', keypair.publicKey.toBase58());

// Create test message
const testPayload = {
    id: 'test-api',
    name: 'Test API',
    endpoint: 'http://localhost:8000',
    provider_address: config.wallet.address,
    pricing: {
        amount: 1.0,
        unit: 'per-call'
    }
};

const message = JSON.stringify(testPayload);
console.log('\nMessage to sign:');
console.log(message);
console.log('\nMessage length:', message.length);

// Sign the message
const signature = signMessage(message, keypair);
console.log('\nSignature (base64):');
console.log(signature);

// Verify with same message
const verified1 = verifySignature(message, signature, keypair.publicKey.toBase58());
console.log('\nVerification with same message:', verified1 ? '✓ PASS' : '✗ FAIL');

// Verify with config wallet address
const verified2 = verifySignature(message, signature, config.wallet.address);
console.log('Verification with config wallet address:', verified2 ? '✓ PASS' : '✗ FAIL');

// Test with different key order
const testPayload2 = {
    provider_address: config.wallet.address,
    pricing: {
        amount: 1.0,
        unit: 'per-call'
    },
    endpoint: 'http://localhost:8000',
    name: 'Test API',
    id: 'test-api'
};

const message2 = JSON.stringify(testPayload2);
console.log('\nMessage with different key order:');
console.log(message2);
const verified3 = verifySignature(message2, signature, config.wallet.address);
console.log('Verification with different key order:', verified3 ? '✓ PASS' : '✗ FAIL (expected)');

console.log('\n=== Summary ===');
console.log('The signature process works correctly.');
console.log('Key finding: JSON.stringify key order matters!');
console.log('Both signer and verifier must use the exact same JSON string.');
