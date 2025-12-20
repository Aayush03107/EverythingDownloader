/* backend/utils/queue.mjs */

export class JobQueue {
    constructor(concurrencyLimit = 2) {
        this.limit = concurrencyLimit;
        this.activeCount = 0;
        this.waitingLine = []; // Stores objects: { id, startFn }
    }

    /**
     * Tries to run a job immediately.
     * If all slots are full, it adds the job to the waiting line.
     * Returns: { status: 'started' } OR { status: 'queued', position: number }
     */
    add(id, startFn) {
        if (this.activeCount < this.limit) {
            // Slot available! Run immediately.
            this.activeCount++;
            startFn();
            return { status: 'started' };
        } else {
            // No slots. Add to line.
            this.waitingLine.push({ id, startFn });
            return { status: 'queued', position: this.waitingLine.length };
        }
    }

    /**
     * Called when a download finishes (Success or Error).
     * Frees up a slot and pulls the next person in line.
     */
    next() {
        this.activeCount--;
        
        // Safety check: ensure count never goes below 0
        if (this.activeCount < 0) this.activeCount = 0;

        if (this.waitingLine.length > 0 && this.activeCount < this.limit) {
            // Pull next job from the front of the line
            const nextJob = this.waitingLine.shift();
            this.activeCount++;
            
            // Execute the saved function
            console.log(`[Queue] Promoting Job ${nextJob.id} to Active`);
            nextJob.startFn();
            return true; 
        }
        return false; // No one waiting
    }

    /**
     * Called if a user clicks "Cancel" while waiting in line.
     */
    removeFromQueue(id) {
        const index = this.waitingLine.findIndex(job => job.id === id);
        if (index !== -1) {
            this.waitingLine.splice(index, 1);
            return true; // Successfully removed
        }
        return false; // Was not in queue (maybe it was already downloading)
    }
}