require('dotenv').config();
const { RunwareClient } = require('../lib/runware');
const fs = require('fs');
const path = require('path');

module.exports = async function textToImageHandler(params, context) {
    const { prompt, negativePrompt, steps = 20, width = 1024, height = 1024, seed } = params;
    
    const apiKey = process.env.RUNWARE_API_KEY;
    if (!apiKey) {
        throw new Error('RUNWARE_API_KEY not configured in .env file');
    }

    const client = new RunwareClient({ apiKey });

    await context.updateProgress(10, 'Initializing image generation...');

    try {
        await context.updateProgress(30, 'Sending request to Runware API...');
        
        const result = await client.textToImage({
            prompt,
            negativePrompt,
            steps,
            width,
            height,
            seed,
            numberResults: 1
        });

        await context.updateProgress(70, 'Downloading generated image...');
        
        const imageURL = result.images[0].imageURL;
        const imageSeed = result.images[0].seed;
        const imageBuffer = await client.downloadImage(imageURL);

        await context.updateProgress(90, 'Saving result...');

        const filename = `image-${imageSeed}.png`;
        const tempPath = path.join('/tmp', filename);
        fs.writeFileSync(tempPath, imageBuffer);

        const resultFilename = await context.saveResult(tempPath, filename);

        await context.updateProgress(100, 'Image generation complete');

        return {
            filename: resultFilename,
            seed: imageSeed,
            cost: result.totalCost,
            prompt,
            width,
            height
        };
    } catch (error) {
        throw new Error(`Image generation failed: ${error.message}`);
    }
};
