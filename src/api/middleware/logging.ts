import { Request, Response, NextFunction } from 'express';
import { zone } from '../../logging/zone';
import { getClientIP } from './utils';

const log = zone('api:request');

/**
 * Request logging middleware
 * Logs incoming requests and response status
 */
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const clientIp = getClientIP(req);

    // Override res.end to capture response timings and metadata.
    // Express Response.end has multiple overloaded signatures:
    //   end(): Response
    //   end(callback: Function): Response
    //   end(data: Buffer | string): Response
    //   end(data: Buffer | string, callback: Function): Response
    //   end(data: Buffer | string, encoding: string, callback: Function): Response
    // We accept variadic args to match all overloads while preserving the original
    // function's ability to handle any combination of parameters.
    const originalEnd = res.end.bind(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = function (...args: any[]): Response {
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

        return originalEnd(...args);
    } as typeof res.end;

    next();
}
