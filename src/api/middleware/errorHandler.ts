import { Request, Response, NextFunction } from 'express';
import { zone } from '../../logging/zone';

const log = zone('api:errors');

/**
 * Safe error response that doesn't leak internals
 */
interface ErrorResponse {
    error: string;
    code?: string;
}

/**
 * Global error handling middleware
 * Catches all errors and returns safe responses without stack traces
 */
export function errorHandler(
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Log the full error internally (safe location)
    log.error({
        message: 'API error',
        data: {
            type: err?.constructor?.name || 'Unknown',
            message: err?.message || String(err)
        }
    });

    // Return safe error response to client
    const statusCode = err?.statusCode || err?.status || 500;
    const errorResponse: ErrorResponse = {
        error: 'An error occurred processing your request'
    };

    // Add code if it's a validation error or known error type
    if (err?.code) {
        errorResponse.code = err.code;
    }

    res.status(statusCode).json(errorResponse);
}

/**
 * Catch 404 errors
 */
export function notFoundHandler(_req: Request, res: Response): void {
    res.status(404).json({
        error: 'Not found'
    });
}
