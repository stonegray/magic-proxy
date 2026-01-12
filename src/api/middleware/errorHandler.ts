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

    // Extract error properties with safe type handling.
    // We accept Error | unknown and need to safely access properties that may exist
    // on Error objects (message), HTTP error objects (statusCode, status), or custom
    // error objects (code). Type casting to any is necessary to access these
    // arbitrary properties while maintaining runtime safety through optional chaining.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorObj = err as any; // Allow accessing arbitrary properties
    const errorMessage = errorObj?.message ?? String(err);
    const errorType = errorObj?.constructor?.name ?? 'Unknown';
    const statusCode = errorObj?.statusCode ?? errorObj?.status ?? 500;
    const errorCode = errorObj?.code;

    // Log the full error internally with correlation ID (safe location)
    log.error({
        message: 'API error',
        data: {
            errorId,
            type: errorType,
            message: errorMessage
        }
    });

    // Return safe error response to client with error ID for tracing
    const errorResponse: ErrorResponse = {
        error: 'An error occurred processing your request',
        errorId
    };

    // Add code if it's a validation error or known error type
    if (errorCode) {
        errorResponse.code = errorCode;
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
