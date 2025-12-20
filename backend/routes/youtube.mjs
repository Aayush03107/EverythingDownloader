/* backend/routes/youtube.mjs */
import express from 'express';
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';import { uid } from 'uid';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
//import uid from 'uid-safe';

// --- UTILS ---
import { validateURL } from '../utitlis/security.mjs';
import { Cache, RateLimiter } from '../utitlis/limiter.mjs'; // Phase 2
import { JobQueue } from '../utitlis/queue.mjs';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// --- INIT SYSTEMS ---
const metaCache = new Cache(30); // 30 min TTL
const limiter = new RateLimiter(60, 60); // 60 reqs / 60 secs
const downloadQueue = new JobQueue(2); // Max 2 concurrent downloads

// --- GLOBAL STATE ---
const activeTasks = new Map(); // requestId -> { process, res }
const clients = new Map();     // requestId -> Response (SSE)

// --- HELPERS ---
const isSpotifyUrl = (url) => url.includes('spotify');

const getSpotifyMeta = async (url) => {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        const title = $('meta[property="og:title"]').attr('content') || "Spotify Track";
        const image = $('meta[property="og:image"]').attr('content');
        const description = $('meta[property="og:description"]').attr('content');
        let artist = "";
        if (description) {
            const parts = description.split('·');
            if (parts.length > 1) artist = parts[0].replace(/Listen to .* on Spotify\./, '').trim();
        }
        return {
            title: artist ? `${title} - ${artist}` : title,
            thumbnail: image,
            uploader: "Spotify",
            isSpotify: true,
            searchQuery: `${title} ${artist} audio`
        };
    } catch (e) { return null; }
};

const getOEmbedMeta = async (videoUrl) => {
    try {
        if (!videoUrl.includes('youtube') && !videoUrl.includes('youtu.be') && !videoUrl.includes('vimeo')) return null;
        const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
        const response = await fetch(oEmbedUrl);
        if (!response.ok) throw new Error('oEmbed failed');
        const json = await response.json();
        return {
            title: json.title,
            thumbnail: json.thumbnail_url,
            uploader: json.author_name || "Unknown",
            isSpotify: false
        };
    } catch (e) { return null; }
};

const getUniversalMeta = (url) => {
    return new Promise((resolve) => {
        const command = `yt-dlp --dump-single-json --flat-playlist --playlist-items 1 --no-warnings "${url}"`;
        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
            if (error) return resolve(null);
            try {
                const info = JSON.parse(stdout);
                resolve({
                    title: info.title || "Unknown Title",
                    thumbnail: info.thumbnail || null,
                    uploader: info.uploader || info.extractor_key || "Web Source",
                    isSpotify: false
                });
            } catch (e) { resolve(null); }
        });
    });
};

// --- ROUTES ---

// 1. CANCEL ROUTE (Updated for Queue)
router.post('/cancel', (req, res) => {
    const { requestId } = req.body;
    
    // A. Check Active Downloads
    if (activeTasks.has(requestId)) {
        const task = activeTasks.get(requestId);
        if (task.process) task.process.kill('SIGKILL');
        activeTasks.delete(requestId);
        // Note: The 'close' event in /convert will handle calling queue.next()
        return res.json({ status: 'cancelled_active' });
    }

    // B. Check Waiting Queue
    const wasInQueue = downloadQueue.removeFromQueue(requestId);
    if (wasInQueue) {
        // Manually notify frontend because no process exists to fire 'close'
        const clientRes = clients.get(requestId);
        if (clientRes) {
            clientRes.write(`data: ${JSON.stringify({ status: 'Cancelled' })}\n\n`);
            clientRes.end();
        }
        return res.json({ status: 'cancelled_queue' });
    }

    res.status(404).json({ error: "Task not found" });
});

// 2. SSE ENDPOINT
router.get('/events', (req, res) => {
    const { requestId } = req.query;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.set(requestId, res);

    req.on('close', () => {
        clients.delete(requestId);
        res.end();
    });
});

// 3. META ROUTE (Protected + Cached)
router.get('/meta', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "No URL" });

    // Rate Limit & Security
    if (!limiter.check(req.ip, 1)) return res.status(429).json({ error: "Too many requests" });
    if (!(await validateURL(url))) return res.status(403).json({ error: "Forbidden URL" });

    // Cache Check
    const cached = metaCache.get(url);
    if (cached) return res.json(cached);

    let data = null;
    if (isSpotifyUrl(url)) data = await getSpotifyMeta(url);
    if (!data) data = await getOEmbedMeta(url);
    if (!data) data = await getUniversalMeta(url);

    if (data) {
        metaCache.set(url, data);
        return res.json(data);
    }
    return res.status(500).json({ error: "Link not supported" });
});

// 4. FORMATS ROUTE (Protected + Cached)
router.get('/formats', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.json({ formats: [] });

    // Silent fail checks
    if (!limiter.check(req.ip, 1)) return res.json({ formats: [] });
    if (!(await validateURL(url))) return res.json({ formats: [] });

    // Cache Check
    const cacheKey = `fmt:${url}`;
    const cached = metaCache.get(cacheKey);
    if (cached) return res.json({ formats: cached });

    const command = `yt-dlp --print "%(height)s|%(filesize)s|%(filesize_approx)s|%(playlist_count)s" --playlist-items 1 "${url}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) return res.json({ formats: [] });
        try {
            const lines = stdout.trim().split('\n');
            const formatMap = new Map();
            let playlistCount = 1;

            lines.forEach(line => {
                const [heightStr, sizeStr, approxStr, countStr] = line.split('|');
                const height = parseInt(heightStr, 10);
                let bytes = parseInt(sizeStr, 10);
                if (isNaN(bytes)) bytes = parseInt(approxStr, 10);
                if (isNaN(bytes)) bytes = 0;

                const pCount = parseInt(countStr, 10);
                if (!isNaN(pCount) && pCount > 1) playlistCount = pCount;

                if (!isNaN(height) && height >= 144) {
                    const totalBytes = bytes > 0 ? bytes + 5242880 : 0; 
                    if (!formatMap.has(height) || formatMap.get(height) < totalBytes) {
                        formatMap.set(height, totalBytes);
                    }
                }
            });

            const formats = Array.from(formatMap.entries())
                .sort((a, b) => b[0] - a[0])
                .map(([height, singleBytes]) => {
                    let sizeText = null;
                    if (singleBytes > 0) {
                        const totalListBytes = singleBytes * playlistCount;
                        const mb = totalListBytes / (1024 * 1024);
                        sizeText = mb >= 1024 ? `~${(mb/1024).toFixed(1)} GB` : `~${mb.toFixed(0)} MB`;
                        if (playlistCount > 1) sizeText += ` (Total)`;
                    }
                    return { resolution: height, size: sizeText };
                });

            metaCache.set(cacheKey, formats);
            res.json({ formats });
        } catch (e) { res.json({ formats: [] }); }
    });
});

// 5. CONVERT ROUTE (With Queue Integration)
const getFreeDiskSpace = () => {
    return new Promise((resolve) => {
        // 'df -m' returns disk space in Megabytes
        exec('df -m /', (err, stdout) => {
            if (err) return resolve(1024); // Default to 1GB if check fails
            const lines = stdout.split('\n');
            const parts = lines[1].replace(/\s+/g, ' ').split(' ');
            const availableMB = parseInt(parts[3]);
            resolve(availableMB);
        });
    });
};

router.post('/convert', async (req, res) => {
    const { url, format, quality, requestId } = req.body;
    if (!url) return res.status(400).json({ error: "No URL" });

    // 1. Pre-Check: URL Validation
    if (!(await validateURL(url))) return res.status(403).json({ error: "Forbidden URL" });

    const sendUpdate = (data) => {
        const clientRes = clients.get(requestId);
        if (clientRes) clientRes.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // --- JOB DEFINITION ---
    const startJob = async () => {
        console.log(`[Queue] Starting Job: ${requestId}`);
        sendUpdate({ status: 'Downloading', progress: 0, total: '...', speed: '...' });

        // 2. PRE-CHECK: SIZE AND DISK SPACE
        // Use --get-size to ask YouTube for the file size before downloading
        exec(`yt-dlp --get-size "${url}"`, async (err, stdout) => {
            const freeSpace = await getFreeDiskSpace();
            const isTooLarge = stdout.includes('G') || (stdout.includes('M') && parseFloat(stdout) > 500);

            if (isTooLarge || freeSpace < 200) {
                sendUpdate({ status: 'Error', message: 'File too large or server disk full' });
                if (!res.headersSent) res.status(400).json({ error: "Server Capacity Exceeded" });
                downloadQueue.next(); // Continue to next person in queue
                return;
            }

            const fileId = uid(16);
            const downloadFolder = path.join(rootDir, 'downloads');
            if (!fs.existsSync(downloadFolder)) fs.mkdirSync(downloadFolder);
            const outputTemplate = path.join(downloadFolder, `${fileId}.%(ext)s`);

            // Build Args
            const baseArgs = ['--newline', '--no-warnings', '--max-filesize', '500M']; 
            let args = [];

            if (format === 'mp3') {
                args = [...baseArgs, '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outputTemplate, url];
            } else {
                args = [...baseArgs, '-f', `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`, '--merge-output-format', 'mp4', '-o', outputTemplate, url];
            }

            const ytDlpProcess = spawn('yt-dlp', args);
            activeTasks.set(requestId, { process: ytDlpProcess, res });

            // 3. ATOMIC KILL SWITCH: If user cancels or closes tab
            req.on('close', () => {
                console.log(`[Safety] User cancelled. Killing process ${requestId}`);
                ytDlpProcess.kill('SIGKILL');
                // Cleanup any partial files immediately
                const partialFile = path.join(downloadFolder, `${fileId}.${format}`);
                if (fs.existsSync(partialFile)) fs.unlink(partialFile, () => {});
            });

            let dataBuffer = '';
            const progressRegex = /\[download\]\s+(\d+\.?\d*)%\s+of\s+(~?[\d\.]+\w+)/;

            ytDlpProcess.stdout.on('data', (data) => {
                dataBuffer += data.toString();
                let lines = dataBuffer.split('\n');
                dataBuffer = lines.pop(); 
                lines.forEach(line => {
                    if (!line.includes('[download]')) return;
                    const match = line.match(progressRegex);
                    if (match) {
                        sendUpdate({ 
                            progress: parseFloat(match[1]), 
                            total: match[2], 
                            status: 'Downloading' 
                        });
                    }
                });
            });

            ytDlpProcess.on('close', (code, signal) => {
                downloadQueue.next();
                activeTasks.delete(requestId);

                if (signal === 'SIGKILL' || code !== 0) {
                    if (!res.headersSent) res.status(500).json({ error: "Job Interrupted" });
                    return;
                }

                sendUpdate({ progress: 100, status: 'Complete' });

                const expectedFile = path.join(downloadFolder, `${fileId}.${format}`);
                if (fs.existsSync(expectedFile)) {
                    if (!res.headersSent) {
                        res.download(expectedFile, `download.${format}`, (err) => {
                            // 4. FINAL CLEANUP: Delete file immediately after successful or failed transfer
                            fs.unlink(expectedFile, () => {
                                console.log(`[Cleanup] Deleted ${fileId}`);
                            });
                        });
                    }
                }
            });
        });
    };

    const result = downloadQueue.add(requestId, startJob);
    if (result.status === 'queued') {
        sendUpdate({ status: 'Queued', position: result.position });
    }
});

export default router;