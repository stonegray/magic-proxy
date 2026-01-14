import { Request, Response, NextFunction } from 'express';
import { zone } from '../../logging/zone';
import { getClientIP } from './utils';

const log = zone('api:auth');

let apiKey: string | undefined;

/**
 * Set the API key for authentication
 * Called during API initialization
 */
export function setAPIKey(key: string | undefined): void {
    apiKey = key;
}

/**
 * Authentication middleware
 * Rejects requests without the API key if one is configured
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // If no API key is configured, allow all requests
    if (!apiKey) {
        return next();
    }

    // Extract the API key from the request
    // Support both header and query parameter for flexibility
    const providedKey = req.headers['x-api-key'] as string | undefined || req.query.key as string | undefined;

    if (!providedKey) {
        log.warn({
            message: 'API request rejected: missing API key',
            data: { method: req.method, path: req.path, ip: getClientIP(req) }
        });
        res.status(401).json({ error: 'Unauthorized: missing API key' });
        return;
    }

    if (providedKey !== apiKey) {
        log.warn({
            message: 'API request rejected: invalid API key',
            data: { method: req.method, path: req.path, ip: getClientIP(req) }
        });
        res.status(401).json({ error: 'Unauthorized: invalid API key' });
        return;
    }

    // Key is valid, proceed
    next();
}
