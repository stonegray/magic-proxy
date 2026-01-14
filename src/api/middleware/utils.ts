import { Request } from 'express';

/**
 * Extract client IP from request.
 * Handles X-Forwarded-For header when behind a proxy.
 */
export function getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}
