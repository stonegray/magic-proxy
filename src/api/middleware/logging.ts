import { Request, Response, NextFunction } from 'express';
import { zone } from '../../logging/zone';

const log = zone('api:request');

/**
 * Request logging middleware
 * Logs incoming requests and response status
 */
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const clientIp = getClientIP(req);

    // Override res.end to capture response
    const originalEnd = res.end;
    res.end = function (chunk?: any, encoding?: any): Response {
        const duration = Date.now() - startTime;

        log.debug({
            message: 'API request',
            data: {
                method: req.method,
                path: req.path,
                ip: clientIp,
                statusCode: res.statusCode,
                duration: `${duration}ms`
            }
        });

        return originalEnd.call(this, chunk, encoding);
    };

    next();
}

/**
 * Extract client IP from request
 * Handles X-Forwarded-For header if behind a proxy
 */
function getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}
