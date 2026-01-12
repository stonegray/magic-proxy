import { Request, Response, NextFunction } from 'express';
import { zone } from '../../logging/zone';

const log = zone('api:errors');

/**
 * Generate a random error ID for tracing
 */
function generateErrorId(): string {
    return Math.random().toString(16).substring(2, 10);
}

/**
 * Safe error response that doesn't leak internals
 */
interface ErrorResponse {
    error: string;
    errorId?: string;
    code?: string;
}

/**
 * Global error handling middleware
 * Catches all errors and returns safe responses without stack traces
 */
export function errorHandler(
    err: Error | unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    const errorId = generateErrorId();

    // Log the full error internally with correlation ID (safe location)
    log.error({
        message: 'API error',
        data: {
            errorId,
            type: err?.constructor?.name || 'Unknown',
            message: err?.message || String(err)
        }
    });

    // Return safe error response to client with error ID for tracing
    const statusCode = err?.statusCode || err?.status || 500;
    const errorResponse: ErrorResponse = {
        error: 'An error occurred processing your request',
        errorId
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
    const errorId = generateErrorId();
    log.debug({
        message: 'Route not found',
        data: { errorId }
    });

    res.status(404).json({
        error: 'Not found',
        errorId
    });
}
