const axios = require('axios');

class RunwareError extends Error {
    constructor({ status, statusText, data, method, url, requestId, code }) {
        const brief = typeof data === 'string' ? data : (data?.error ?? data?.message ?? data?.errors ?? data);
        const body = typeof brief === 'string' ? brief : JSON.stringify(brief);
        super(`[${status ?? 'ERR'} ${statusText ?? code ?? ''}] ${method ?? ''} ${url ?? ''}${requestId ? ` (request-id: ${requestId})` : ''}\n${body}`);
        this.name = 'RunwareError';
        this.status = status;
        this.statusText = statusText;
        this.data = data;
        this.method = method;
        this.url = url;
        this.requestId = requestId;
        this.code = code;
    }
    static fromAxios(err) {
        if (err && err.response) {
            const { status, statusText, headers, data, config } = err.response;
            const requestId = headers?.['x-request-id'] || headers?.['x-runware-request-id'];
            return new RunwareError({
                status, statusText, data,
                method: (config?.method || 'post').toUpperCase(),
                url: config?.url,
                requestId
            });
        }
        if (err && err.request) {
            return new RunwareError({
                code: err.code || 'NO_RESPONSE',
                statusText: err.message,
                data: { hint: 'Network error or timeout' }
            });
        }
        return new RunwareError({
            code: 'CLIENT_ERROR',
            statusText: err?.message || 'Unknown error',
            data: err
        });
    }
}

class RunwareClient {
    constructor({ apiKey, baseURL = 'https://api.runware.ai/v1', timeout = 180000 } = {}) {
        if (!apiKey) throw new Error('RUNWARE_API_KEY is missing');
        this.apiKey = apiKey;
        this.baseURL = baseURL;
        this.http = axios.create({
            baseURL, timeout,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            validateStatus: s => s >= 200 && s < 300
        });
        this.http.interceptors.response.use(res => res, err => Promise.reject(RunwareError.fromAxios(err)));
    }

    async api(data) {
        if (!Array.isArray(data) || data.length === 0) throw new Error('api(data) requires a non-empty array');
        const res = await this.http.post('/', data);
        return res.data;
    }

    async downloadImage(url) {
        const maxRetries = 3;
        let attempt = 0, delay = 800;
        while (attempt < maxRetries) {
            try {
                const res = await axios.get(url, { responseType: 'arraybuffer', validateStatus: s => s >= 200 && s < 300 });
                return Buffer.from(res.data);
            } catch (err) {
                attempt++;
                if (attempt >= maxRetries) throw RunwareError.fromAxios(err);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 1.5;
            }
        }
    }

    async textToImage({ prompt, negativePrompt, model = 'civitai:101055@128078', width = 1024, height = 1024, steps = 20, CFGScale = 7, scheduler = 'Euler', numberResults = 1, outputFormat = 'PNG', seed }) {
        const { v4: uuidv4 } = require('uuid');
        const task = { taskType: 'imageInference', taskUUID: uuidv4(), model, positivePrompt: prompt, width, height, steps, CFGScale, scheduler, numberResults, outputFormat, includeCost: true, checkNSFW: true, outputType: ['URL'] };
        if (negativePrompt) task.negativePrompt = negativePrompt;
        if (Number.isFinite(seed)) task.seed = seed;
        const json = await this.api([task]);
        if (!json?.data?.length) throw new RunwareError({ status: 'NO_DATA', statusText: 'No image data returned', data: json });
        const images = json.data.map(item => ({ imageURL: item.imageURL, seed: item.seed, cost: item.cost || 0, taskUUID: item.taskUUID, imageUUID: item.imageUUID }));
        return { images, totalCost: images.reduce((sum, img) => sum + img.cost, 0), data: json.data };
    }

    async textToVideo({ prompt, model = 'civitai:101055@128078', duration = 3, fps = 8, width = 512, height = 512, steps = 20, CFGScale = 7, scheduler = 'Euler', outputFormat = 'MP4', seed }) {
        const { v4: uuidv4 } = require('uuid');
        const numFrames = Math.ceil(duration * fps);
        const task = { taskType: 'videoInference', taskUUID: uuidv4(), model, positivePrompt: prompt, width, height, steps, CFGScale, scheduler, outputFormat, includeCost: true, checkNSFW: true, outputType: ['URL'], numFrames, fps };
        if (Number.isFinite(seed)) task.seed = seed;
        const json = await this.api([task]);
        if (!json?.data?.length) throw new RunwareError({ status: 'NO_DATA', statusText: 'No video data returned', data: json });
        const video = json.data[0];
        return { videoURL: video.videoURL, seed: video.seed, cost: video.cost || 0, taskUUID: video.taskUUID, videoUUID: video.videoUUID, duration, fps, numFrames, data: json.data };
    }
}

module.exports = { RunwareClient, RunwareError };
