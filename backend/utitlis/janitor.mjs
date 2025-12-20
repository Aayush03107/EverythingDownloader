/* backend/utils/janitor.mjs */
import fs from 'fs';
import path from 'path';

/**
 * 🧹 THE JANITOR
 * Scans the download folder and removes old files.
 * * @param {string} rootDir - The root directory of the project
 * @param {number} intervalMinutes - How often to run the check (default 10)
 * @param {number} maxAgeMinutes - How old a file must be to get deleted (default 60)
 */
export const startJanitor = (rootDir, intervalMinutes = 10, maxAgeMinutes = 60) => {
    const downloadFolder = path.join(rootDir, 'downloads');

    // 1. Ensure folder exists so we don't crash scanning nothing
    if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder, { recursive: true });
    }

    console.log(`[Janitor] Daemon started. Scanning every ${intervalMinutes}m. Deleting files older than ${maxAgeMinutes}m.`);

    // 2. Start the Timer
    setInterval(() => {
        fs.readdir(downloadFolder, (err, files) => {
            if (err) {
                console.error('[Janitor] Failed to read directory:', err);
                return;
            }

            const now = Date.now();
            const maxAgeMs = maxAgeMinutes * 60 * 1000;
            let deletedCount = 0;

            // 3. Check every file
            files.forEach(file => {
                // Ignore hidden files like .DS_Store or .gitkeep
                if (file.startsWith('.')) return;

                const filePath = path.join(downloadFolder, file);
                
                // Get file stats (creation time, modified time, etc.)
                fs.stat(filePath, (err, stats) => {
                    if (err) return;

                    // 4. The Decision: Is it too old?
                    if (now - stats.mtimeMs > maxAgeMs) {
                        // DELETE IT
                        fs.unlink(filePath, (unlinkErr) => {
                            if (!unlinkErr) {
                                console.log(`[Janitor] Cleaned up: ${file}`);
                                deletedCount++;
                            }
                        });
                    }
                });
            });
            
            // Optional: Log only if something happened
            // if (deletedCount > 0) console.log(`[Janitor] Run complete. Deleted ${deletedCount} files.`);
        });
    }, intervalMinutes * 60 * 1000);
};