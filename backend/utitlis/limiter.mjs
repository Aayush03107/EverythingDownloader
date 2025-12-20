/* backend/utils/limiter.mjs */

/**
 * 🧠 IN-MEMORY CACHE
 * Stores data in RAM with a Time-To-Live (TTL).
 * Automatically deletes old entries to save RAM.
 */
export class Cache {
    constructor(ttlMinutes = 30) {
        this.store = new Map();
        this.ttl = ttlMinutes * 60 * 1000; // Convert to ms
        
        // Janitor: Runs every 10 minutes to clear expired items
        setInterval(() => this.cleanup(), 10 * 60 * 1000);
    }

    get(key) {
        const item = this.store.get(key);
        if (!item) return null;

        // Check expiry
        if (Date.now() > item.expiry) {
            this.store.delete(key);
            return null;
        }
        return item.data;
    }

    set(key, data) {
        this.store.set(key, {
            data,
            expiry: Date.now() + this.ttl
        });
    }

    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.store.entries()) {
            if (now > item.expiry) {
                this.store.delete(key);
            }
        }
    }
}

/**
 * 🚦 RATE LIMITER (Token Bucket)
 * Prevents users from spamming the server.
 * - Metadata requests are cheap (1 point).
 * - Download requests are expensive (10 points).
 */
export class RateLimiter {
    constructor(points = 60, durationSeconds = 60) {
        this.limits = new Map();
        this.points = points;
        this.duration = durationSeconds * 1000;
    }

    check(ip, cost = 1) {
        const now = Date.now();
        let user = this.limits.get(ip);

        // New user or expired window? Reset them.
        if (!user || now > user.resetTime) {
            user = {
                points: this.points,
                resetTime: now + this.duration
            };
        }

        // Check if they have enough points
        if (user.points < cost) {
            return false; // REJECT
        }

        // Deduct points and save
        user.points -= cost;
        this.limits.set(ip, user);
        return true; // APPROVE
    }
}