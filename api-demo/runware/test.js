require('dotenv').config();
const { RunwareClient, RunwareError } = require('./lib/runware');
const textToImageHandler = require('./handlers/text-to-image');
const textToVideoHandler = require('./handlers/text-to-video');

console.log('🧪 Running Runware API tests...\n');

// Test 1: Module imports
console.log('✓ Module imports successful');
console.log('  - RunwareClient class loaded');
console.log('  - RunwareError class loaded');
console.log('  - textToImageHandler loaded');
console.log('  - textToVideoHandler loaded\n');

// Test 2: Environment configuration
const apiKey = process.env.RUNWARE_API_KEY;
if (!apiKey || apiKey === 'your_runware_api_key_here') {
    console.log('⚠️  API key not configured');
    console.log('  Set RUNWARE_API_KEY in .env file to run live API tests\n');
} else {
    console.log('✓ API key configured\n');
}

// Test 3: RunwareClient instantiation
try {
    if (apiKey && apiKey !== 'your_runware_api_key_here') {
        const client = new RunwareClient({ apiKey });
        console.log('✓ RunwareClient instantiated successfully');
        console.log(`  Base URL: ${client.baseURL}\n`);
    } else {
        console.log('⊘ Skipping RunwareClient instantiation (no valid API key)\n');
    }
} catch (error) {
    console.error('✗ RunwareClient instantiation failed:', error.message);
    process.exit(1);
}

// Test 4: Handler structure validation
try {
    if (typeof textToImageHandler !== 'function') {
        throw new Error('textToImageHandler is not a function');
    }
    if (typeof textToVideoHandler !== 'function') {
        throw new Error('textToVideoHandler is not a function');
    }
    console.log('✓ Handler functions validated');
    console.log('  - textToImageHandler is a function');
    console.log('  - textToVideoHandler is a function\n');
} catch (error) {
    console.error('✗ Handler validation failed:', error.message);
    process.exit(1);
}

// Test 5: RunwareError class
try {
    const testError = new RunwareError({
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Test error' },
        method: 'POST',
        url: 'https://api.runware.ai/v1/',
        requestId: 'test-123'
    });

    if (!(testError instanceof Error)) {
        throw new Error('RunwareError is not an Error instance');
    }
    if (testError.status !== 404) {
        throw new Error('RunwareError status not set correctly');
    }

    console.log('✓ RunwareError class validated');
    console.log('  - Extends Error class');
    console.log('  - Properties set correctly\n');
} catch (error) {
    console.error('✗ RunwareError validation failed:', error.message);
    process.exit(1);
}

// Test 6: Live API test (if API key is configured)
async function runLiveTests() {
    if (!apiKey || apiKey === 'your_runware_api_key_here') {
        console.log('⊘ Skipping live API tests (no valid API key)');
        console.log('\n📋 Test Summary:');
        console.log('  - Code structure: ✓ Valid');
        console.log('  - Module imports: ✓ Working');
        console.log('  - Error handling: ✓ Implemented');
        console.log('  - Live API tests: ⊘ Skipped (configure API key to run)');
        console.log('\n💡 To run live tests, set a valid RUNWARE_API_KEY in .env');
        return;
    }

    console.log('🔴 Running live API test (text-to-image)...');

    try {
        const client = new RunwareClient({ apiKey });

        // Mock context for handler
        const mockContext = {
            updateProgress: async (percent, message) => {
                console.log(`  [${percent}%] ${message}`);
            },
            saveResult: async (tempPath, filename) => {
                console.log(`  Saved: ${filename}`);
                return `file://${tempPath}`;
            }
        };

        // Test with a simple prompt
        const result = await textToImageHandler({
            prompt: 'a simple test image',
            width: 512,
            height: 512,
            steps: 10
        }, mockContext);

        console.log('\n✓ Live API test successful!');
        console.log(`  Image URL: ${result.imageUrl}`);
        console.log(`  Seed: ${result.seed}`);
        console.log(`  Cost: ${result.cost}`);
        console.log('\n📋 Test Summary:');
        console.log('  - Code structure: ✓ Valid');
        console.log('  - Module imports: ✓ Working');
        console.log('  - Error handling: ✓ Implemented');
        console.log('  - Live API tests: ✓ Passed');
        console.log('\n✅ All tests passed!');
    } catch (error) {
        console.error('\n✗ Live API test failed:', error.message);
        console.log('\n📋 Test Summary:');
        console.log('  - Code structure: ✓ Valid');
        console.log('  - Module imports: ✓ Working');
        console.log('  - Error handling: ✓ Implemented');
        console.log('  - Live API tests: ✗ Failed');
        console.log('\n⚠️  Check your API key and network connection');
        process.exit(1);
    }
}

runLiveTests().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
