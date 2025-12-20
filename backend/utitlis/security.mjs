/* backend/utils/security.mjs */
import dns from 'dns/promises';

/**
 * Checks if an IP address belongs to a private/local network.
 * We manually check RFC 1918 ranges to ensure no dependencies.
 */
const isPrivateIP = (ip) => {
    // 1. Check for Localhost (IPv6 ::1 or IPv4 127.x.x.x)
    if (ip === '::1' || ip === '::ffff:127.0.0.1') return true;
    if (ip.startsWith('127.')) return true; // Loopback

    // 2. Check for Private Networks (RFC 1918)
    // 10.0.0.0 - 10.255.255.255
    if (ip.startsWith('10.')) return true;

    // 192.168.0.0 - 192.168.255.255
    if (ip.startsWith('192.168.')) return true;

    // 172.16.0.0 - 172.31.255.255 (The tricky one)
    const parts = ip.split('.').map(Number);
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 3. AWS/Cloud Magic IP (169.254.x.x)
    // Cloud providers use this for internal metadata. VERY DANGEROUS if exposed.
    if (ip.startsWith('169.254.')) return true;

    return false;
};

/**
 * Validates a URL by resolving its DNS and checking the IP.
 * Returns TRUE if safe, FALSE if unsafe.
 */
export const validateURL = async (urlString) => {
    try {
        // 1. Basic Protocol Check
        const u = new URL(urlString);
        if (!['http:', 'https:'].includes(u.protocol)) return false;

        // 2. DNS Resolution
        // We look up the hostname (e.g., "youtube.com") to get the actual IP (e.g., "142.250.x.x")
        const { address } = await dns.lookup(u.hostname);

        // 3. The Shield Check
        if (isPrivateIP(address)) {
            console.warn(`[Security Block] Access denied to local IP: ${u.hostname} -> ${address}`);
            return false;
        }

        return true;
    } catch (e) {
        // If URL is garbage or DNS fails, block it.
        return false;
    }
};