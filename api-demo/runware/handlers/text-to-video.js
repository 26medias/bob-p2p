require('dotenv').config();
const { RunwareClient } = require('../lib/runware');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports = async function textToVideoHandler(params, context) {
    const { prompt, duration = 3, fps = 8, resolution = '512x512', seed } = params;
    
    const apiKey = process.env.RUNWARE_API_KEY;
    if (!apiKey) {
        throw new Error('RUNWARE_API_KEY not configured in .env file');
    }

    const client = new RunwareClient({ apiKey });

    await context.updateProgress(10, 'Initializing video generation...');

    try {
        // Parse resolution
        const [width, height] = resolution.split('x').map(Number);

        await context.updateProgress(30, 'Sending request to Runware API (this may take a while)...');
        
        const result = await client.textToVideo({
            prompt,
            duration,
            fps,
            width,
            height,
            seed
        });

        await context.updateProgress(80, 'Downloading generated video...');
        
        const videoURL = result.videoURL;
        const videoSeed = result.seed;
        
        // Download video
        const response = await axios.get(videoURL, { responseType: 'arraybuffer' });
        const videoBuffer = Buffer.from(response.data);

        await context.updateProgress(95, 'Saving result...');

        const filename = `video-${videoSeed}.mp4`;
        const tempPath = path.join('/tmp', filename);
        fs.writeFileSync(tempPath, videoBuffer);

        const resultUrl = await context.saveResult(tempPath, filename);

        await context.updateProgress(100, 'Video generation complete');

        return {
            videoUrl: resultUrl,
            seed: videoSeed,
            cost: result.cost,
            prompt,
            duration: result.duration,
            fps: result.fps,
            resolution,
            frameCount: result.numFrames
        };
    } catch (error) {
        throw new Error(`Video generation failed: ${error.message}`);
    }
};
