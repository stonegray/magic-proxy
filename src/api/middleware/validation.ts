import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { zone } from '../../logging/zone';

const log = zone('api:validation');

/**
 * Base schema for common query parameters
 */
const baseQuerySchema = z.object({
    key: z.string().max(128).optional() // API key via query param
});

/**
 * Validate and sanitize query parameters
 * Prevents injection attacks and enforces type safety
 */
export function validateQuery(req: Request, res: Response, next: NextFunction): void {
    try {
        // Validate against base schema
        baseQuerySchema.parse(req.query);

        // Ensure all query values are strings or arrays of strings
        for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
                // String: check length and basic safety
                if (value.length > 128) {
                    log.warn({
                        message: 'Query parameter too long',
                        data: { key, length: value.length }
                    });
                    res.status(400).json({
                        error: 'Bad request: parameter too long'
                    });
                    return;
                }
            } else if (Array.isArray(value)) {
                // Array: check each element
                for (const item of value) {
                    if (typeof item !== 'string' || item.length > 128) {
                        log.warn({
                            message: 'Invalid query parameter',
                            data: { key }
                        });
                        res.status(400).json({
                            error: 'Bad request: invalid parameter'
                        });
                        return;
                    }
                }
            } else if (value !== undefined && value !== null) {
                // Unexpected type
                log.warn({
                    message: 'Unexpected query parameter type',
                    data: { key, type: typeof value }
                });
                res.status(400).json({
                    error: 'Bad request: invalid parameter'
                });
                return;
            }
        }

        next();
    } catch (err) {
        log.warn({
            message: 'Query validation failed',
            data: { error: err instanceof Error ? err.message : String(err) }
        });
        res.status(400).json({
            error: 'Bad request: invalid parameters'
        });
    }
}

/**
 * Validate JSON body size
 * Limits request body to 10KB max
 */
export function validateBodySize(req: Request, res: Response, next: NextFunction): void {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
        const size = parseInt(contentLength, 10);
        const maxSize = 10 * 1024; // 10KB
        
        if (size > maxSize) {
            log.warn({
                message: 'Request body too large',
                data: { size, maxSize }
            });
            res.status(413).json({
                error: 'Request body too large'
            });
            return;
        }
    }
    
    next();
}
