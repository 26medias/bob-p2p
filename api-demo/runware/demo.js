require('dotenv').config();
const { RunwareClient } = require('./lib/runware');
const fs = require('fs');
const path = require('path');

async function generateImage() {
    console.log('🎨 Runware Image Generation Demo\n');

    const apiKey = process.env.RUNWARE_API_KEY;
    if (!apiKey || apiKey === 'your_runware_api_key_here') {
        console.error('❌ Please set RUNWARE_API_KEY in .env file');
        process.exit(1);
    }

    const client = new RunwareClient({ apiKey });

    // Demo parameters - customize these!
    const params = {
        prompt: 'A majestic dragon perched on a mountain peak at sunset, highly detailed, fantasy art, cinematic lighting, 8k',
        negativePrompt: 'blurry, low quality, distorted, ugly, bad anatomy',
        width: 1024,
        height: 1024,
        steps: 25,
        CFGScale: 7,
        scheduler: 'Euler',
        seed: Math.floor(Math.random() * 4294967295), // Random seed
        numberResults: 1
    };

    console.log('Parameters:');
    console.log(`  Prompt: ${params.prompt}`);
    console.log(`  Negative Prompt: ${params.negativePrompt}`);
    console.log(`  Size: ${params.width}x${params.height}`);
    console.log(`  Steps: ${params.steps}`);
    console.log(`  CFG Scale: ${params.CFGScale}`);
    console.log(`  Scheduler: ${params.scheduler}`);
    console.log(`  Seed: ${params.seed}\n`);

    try {
        console.log('⏳ Generating image...');

        const result = await client.textToImage(params);

        console.log('\n✅ Image generated successfully!');
        console.log(`  Image URL: ${result.images[0].imageURL}`);
        console.log(`  Seed used: ${result.images[0].seed}`);
        console.log(`  Cost: $${result.totalCost}`);

        // Download and save the image
        console.log('\n📥 Downloading image...');
        const imageBuffer = await client.downloadImage(result.images[0].imageURL);

        const filename = `demo-image-${result.images[0].seed}.png`;
        const filepath = path.join(__dirname, filename);
        fs.writeFileSync(filepath, imageBuffer);

        console.log(`✅ Image saved to: ${filepath}`);
        console.log(`\n💡 To regenerate the same image, use seed: ${result.images[0].seed}`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

generateImage();
