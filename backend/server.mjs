/* backend/server.mjs */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url'; // <--- 1. Import this

// Import Routes
import youtubeRoutes from './routes/youtube.mjs';
import playlistRoutes from './routes/playlist.mjs'
import { startJanitor } from './utitlis/janitor.mjs';

// --- 2. FIX: Define __dirname manually ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Start Janitor
// Scan every 10 mins. Delete files older than 30 mins.
startJanitor(__dirname, 10, 30);

app.use('/api/playlist', playlistRoutes);
app.use('/', youtubeRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
