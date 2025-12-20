/* backend/routes/playlist.mjs */
import express from 'express';
import { exec } from 'child_process';

const router = express.Router();

// Get playlist metadata without downloading
router.get('/', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // --flat-playlist: extract info without downloading the videos
    // -J: Dump JSON for easy parsing
    const command = `yt-dlp --flat-playlist -J "${url}"`;

    // Increased buffer to 50MB for very large playlists
    exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
        if (error) {
            console.error("Playlist Scan Error:", error);
            return res.status(500).json({ error: "Failed to scan playlist. Ensure it is public." });
        }
        
        try {
            const data = JSON.parse(stdout);
            
            // Map the entries to a clean list for the frontend
            const videos = data.entries.map(v => ({
                id: v.id,
                title: v.title,
                url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
                uploader: v.uploader || data.uploader
            }));

            res.json({ 
                playlistTitle: data.title, 
                videoCount: videos.length,
                videos 
            });
        } catch (e) {
            res.status(500).json({ error: "Could not parse playlist metadata" });
        }
    });
});

export default router;