# Runware API Demo

Self-contained API handlers for Runware AI integration with Bob P2P.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your Runware API key in `.env`:
```bash
echo "RUNWARE_API_KEY=your_actual_api_key_here" > .env
```

## Handlers

### Text-to-Image (`handlers/text-to-image.js`)
Generates images from text prompts using Runware AI.

**Parameters:**
- `prompt` (string, required): Text description of the desired image
- `negativePrompt` (string, optional): What to avoid in the image
- `steps` (number, optional): Inference steps (10-50, default: 20)
- `width` (number, optional): Image width - 512, 768, or 1024 (default: 1024)
- `height` (number, optional): Image height - 512, 768, or 1024 (default: 1024)
- `seed` (number, optional): Random seed for reproducibility

**Returns:**
- `imageUrl`: URL to download the generated image
- `seed`: Seed used for generation
- `cost`: Runware API cost

### Text-to-Video (`handlers/text-to-video.js`)
Generates short videos from text prompts using Runware AI.

**Parameters:**
- `prompt` (string, required): Text description of the desired video
- `duration` (number, optional): Video duration in seconds (2-10, default: 3)
- `fps` (number, optional): Frames per second - 8, 12, or 24 (default: 8)
- `resolution` (string, optional): Video resolution - "512x512" or "768x768" (default: "512x512")
- `seed` (number, optional): Random seed for reproducibility

**Returns:**
- `videoUrl`: URL to download the generated video
- `duration`: Actual video duration
- `resolution`: Video resolution
- `frameCount`: Total frames
- `seed`: Seed used for generation
- `cost`: Runware API cost

## Usage with Bob P2P

These handlers are configured in `/home/julien/Projects/bob-p2p/V2/bob-p2p-client/api.json`:

- **runware-text-to-image-v1**: `/runware/text-to-image`
- **runware-text-to-video-v1**: `/runware/text-to-video`

Make sure to set your `RUNWARE_API_KEY` in `.env` before running the Bob P2P client.

## Notes

- The handlers automatically handle progress updates and result storage
- Results are saved as PNG files (images) or MP4 files (videos)
- Runware API costs are passed through in the response
