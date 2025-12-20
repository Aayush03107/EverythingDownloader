import express from 'express';
import cors from 'cors';
import youtubeRoutes from './routes/youtube.mjs'; // Import the routes
import { startJanitor } from './utitlis/janitor.mjs';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Mount the routes at the root path ('/')
// This means requests will still be 'http://localhost:3000/info' 
// and 'http://localhost:3000/convert'

startJanitor(__dirname, 10, 30);
app.use('/', youtubeRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});