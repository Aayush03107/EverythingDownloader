/* backend/routes/youtube.mjs */
import express from 'express';
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import uid from 'uid-safe'; 

// --- UTILS ---
import { validateURL } from '../utitlis/security.mjs';
import { Cache, RateLimiter } from '../utitlis/limiter.mjs';
import { JobQueue } from '../utitlis/queue.mjs';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// --- SAFETY NET: Prevent Server Crashes ---
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Prevents Crash):', err);
});

// --- INIT SYSTEMS ---
const metaCache = new Cache(30); 
const limiter = new RateLimiter(60, 60); 
const downloadQueue = new JobQueue(2); 

// --- GLOBAL STATE ---
const activeTasks = new Map(); 
const clients = new Map();       
const completedJobs = new Map(); 

// --- HELPERS ---
const isSpotifyUrl = (url) => url.includes('spotify');

const getFreeDiskSpace = () => {
    return new Promise((resolve) => {
        exec('df -m /', (err, stdout) => {
            if (err) return resolve(1024);
            const lines = stdout.split('\n');
            const parts = lines[1].replace(/\s+/g, ' ').split(' ');
            const availableMB = parseInt(parts[3]);
            resolve(availableMB);
        });
    });
};

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
        // Use spawn instead of exec to prevent shell crashes
        const child = spawn('yt-dlp', ['--dump-single-json', '--flat-playlist', '--playlist-items', '1', '--no-warnings', url]);
        
        let stdout = '';
        child.stdout.on('data', (data) => stdout += data.toString());
        
        child.on('error', (err) => {
            console.error("Meta Fetch Spawn Error:", err);
            resolve(null);
        });

        child.on('close', (code) => {
            if (code !== 0) return resolve(null);
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

// 1. CANCEL ROUTE
router.post('/cancel', (req, res) => {
    const { requestId } = req.body;
    
    if (activeTasks.has(requestId)) {
        const task = activeTasks.get(requestId);
        if (task.process) task.process.kill('SIGKILL');
        activeTasks.delete(requestId);
        return res.json({ status: 'cancelled_active' });
    }

    const wasInQueue = downloadQueue.removeFromQueue(requestId);
    if (wasInQueue) {
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

// 3. META ROUTE
router.get('/meta', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "No URL" });
    if (!limiter.check(req.ip, 1)) return res.status(429).json({ error: "Too many requests" });
    if (!(await validateURL(url))) return res.status(403).json({ error: "Forbidden URL" });

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

// 4. FORMATS ROUTE (CRASH FIXED)
router.get('/formats', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.json({ formats: [] });
    if (!limiter.check(req.ip, 1)) return res.json({ formats: [] });
    if (!(await validateURL(url))) return res.json({ formats: [] });

    const cacheKey = `fmt:${url}`;
    const cached = metaCache.get(cacheKey);
    if (cached) return res.json({ formats: cached });

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    const args = [
        '--user-agent', userAgent,
        '--print', '%(height)s|%(filesize)s|%(filesize_approx)s|%(playlist_count)s',
        '--playlist-items', '1',
        url
    ];

    const child = spawn('yt-dlp', args);

    let stdout = '';
    
    child.on('error', (err) => {
        console.error("Format Check Error:", err);
        if (!res.headersSent) res.json({ formats: [] });
    });

    child.stdout.on('data', (data) => stdout += data.toString());

    child.on('close', (code) => {
        if (code !== 0 || !stdout) {
            if (!res.headersSent) res.json({ formats: [] });
            return;
        }
        
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
            if (!res.headersSent) res.json({ formats });
        } catch (e) { 
            if (!res.headersSent) res.json({ formats: [] }); 
        }
    });
});

// 5. CONVERT ROUTE (UPDATED: Handles Render Secrets)
router.post('/convert', async (req, res) => {
    const { url, format, quality, requestId } = req.body;
    if (!url) return res.status(400).json({ error: "No URL" });

    if (!(await validateURL(url))) return res.status(403).json({ error: "Forbidden URL" });

    const sendUpdate = (data) => {
        const clientRes = clients.get(requestId);
        if (clientRes) clientRes.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const startJob = async () => {
        console.log(`[Queue] Starting Job: ${requestId}`);
        sendUpdate({ status: 'Downloading', progress: 0, total: '...', speed: '...' });

        // --- AUTH CHECK: Local vs Render ---
        const localCookies = path.join(rootDir, 'cookies.txt');
        const renderCookies = '/etc/secrets/cookies.txt'; // Render's default secret path

        let activeCookiePath = null;
        
        if (fs.existsSync(localCookies)) {
            activeCookiePath = localCookies;
            console.log(`[Auth] Using LOCAL cookies.txt for ${requestId}`);
        } else if (fs.existsSync(renderCookies)) {
            activeCookiePath = renderCookies;
            console.log(`[Auth] Using RENDER cookies.txt for ${requestId}`);
        }

        // Get size check
        exec(`yt-dlp --get-size "${url}"`, async (err, stdout) => {
            const freeSpace = await getFreeDiskSpace();
            const isTooLarge = stdout && (stdout.includes('G') || (stdout.includes('M') && parseFloat(stdout) > 500));

            if (isTooLarge || freeSpace < 200) {
                sendUpdate({ status: 'Error', message: 'File too large or server disk full' });
                downloadQueue.next(); 
                return;
            }

            const fileId = uid(16);
            const downloadFolder = path.join(rootDir, 'downloads');
            if (!fs.existsSync(downloadFolder)) fs.mkdirSync(downloadFolder);
            const outputTemplate = path.join(downloadFolder, `${fileId}.%(ext)s`);

            const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
            
            const baseArgs = [
                '--newline', 
                '--no-warnings', 
                '--max-filesize', '500M',
                '--user-agent', userAgent,
                '--referer', 'https://www.google.com/',
                '--no-check-certificate', 
                '--geo-bypass' 
            ]; 

            if (activeCookiePath) {
                baseArgs.push('--cookies', activeCookiePath);
            }

            let args = [];
            if (format === 'mp3') {
                args = [...baseArgs, '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outputTemplate, url];
            } else {
                args = [...baseArgs, '-f', `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`, '--merge-output-format', 'mp4', '-o', outputTemplate, url];
            }

            const ytDlpProcess = spawn('yt-dlp', args);
            activeTasks.set(requestId, { process: ytDlpProcess });

            let errorLog = '';

            ytDlpProcess.on('error', (spawnErr) => {
                console.error(`[Spawn Error] ${spawnErr}`);
                sendUpdate({ status: 'Error', message: 'Internal Server Error: Failed to start downloader.' });
                downloadQueue.next();
                activeTasks.delete(requestId);
            });

            ytDlpProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                errorLog += msg; 
                console.error(`[yt-dlp stderr] ${msg}`);
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

                if (signal === 'SIGKILL') {
                    sendUpdate({ status: 'Error', message: 'Download cancelled by user.' });
                    return;
                }

                if (code !== 0) {
                    const cleanError = errorLog.slice(0, 300) || "Unknown error occurred";
                    let userFriendlyError = cleanError;
                    
                    if (cleanError.includes('403') || cleanError.includes('Forbidden')) {
                        userFriendlyError = "Server IP Blocked by YouTube. Please try again later or add cookies.txt to backend.";
                    }

                    console.log(`[Job Failed] Code: ${code} | Log: ${cleanError}`);
                    sendUpdate({ status: 'Error', message: userFriendlyError });
                    return;
                }

                sendUpdate({ progress: 100, status: 'Complete' });

                const actualExt = format === 'mp3' ? 'mp3' : 'mp4';
                const expectedFile = path.join(downloadFolder, `${fileId}.${actualExt}`);
                
                if (fs.existsSync(expectedFile)) {
                    completedJobs.set(requestId, expectedFile);
                    setTimeout(() => {
                        if (completedJobs.has(requestId)) {
                            completedJobs.delete(requestId);
                            fs.unlink(expectedFile, () => {});
                        }
                    }, 5 * 60 * 1000);
                } else {
                     sendUpdate({ status: 'Error', message: 'File not found after download' });
                }
            });
        });
    };

    const result = downloadQueue.add(requestId, startJob);
    if (result.status === 'queued') {
        sendUpdate({ status: 'Queued', position: result.position });
    }
    
    res.json({ message: "Job Started", ticketId: requestId });
});

// 6. DOWNLOAD ROUTE
router.get('/download-file', (req, res) => {
    const { requestId } = req.query;
    const filePath = completedJobs.get(requestId);

    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send("File expired or not found. Please try again.");
    }

    const filename = `download${path.extname(filePath)}`;
    res.download(filePath, filename, (err) => {
        completedJobs.delete(requestId);
        fs.unlink(filePath, () => console.log(`[Cleanup] Delivered & Deleted ${requestId}`));
    });
});

export default router;