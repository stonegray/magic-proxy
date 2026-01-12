import express, { Express } from 'express';
import { Server } from 'http';
import helmet from 'helmet';
import { zone } from '../logging/zone';
import { apiMessageBroker } from '../apiMessageBroker';
import { requestLogging, apiLimiter, authMiddleware, setAPIKey, validateQuery, validateBodySize, errorHandler, notFoundHandler } from './middleware';
import { APIConfig } from './types';

const log = zone('api');
const API_VERSION = '1.0.0';

let server: Server | null = null;

export async function startAPI(apiConfig: APIConfig): Promise<void> {
    const app: Express = express();
    const timeout = apiConfig.timeout || 1000; // Default 1 second

    // Set up API key for authentication middleware
    setAPIKey(apiConfig.key);

    // Middleware (order matters)
    app.use(express.json({ limit: '10kb' })); // Limit JSON body to 10KB
    app.use(validateBodySize); // Validate body size
    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'same-origin' },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: { policy: 'same-origin' }
    })); // Restrict CORS completely
    app.use(apiLimiter); // Rate limit before auth to protect against brute force
    app.use(validateQuery); // Validate query params early
    app.use(authMiddleware);
    app.use(requestLogging);

    // Set request timeout
    app.use((req, res, next) => {
        req.setTimeout(timeout);
        res.setTimeout(timeout);
        next();
    });

    // Add API version header to all responses
    app.use((_req, res, next) => {
        res.setHeader('X-API-Version', API_VERSION);
        next();
    });

    // Root endpoint
    app.get('/', (_req, res) => {
        res.json({
            message: 'magic-proxy',
            version: API_VERSION
        });
    });

    // Routes listing endpoint (optional)
    // MUST be registered BEFORE the parameterized /api/:fieldName route
    if (apiConfig.allowListingRoutes === true) {
        app.get('/api/routes', (_req, res) => {
            const routes = Array.from(apiMessageBroker.getRoutes());
            res.json({
                routes: routes.map(name => ({
                    name,
                    path: `/api/${name}`
                }))
            });
        });
    }

    // Dynamic route handler for apiMessageBroker fields
    // This uses a parameterized route to avoid registering routes dynamically
    // Note: Specific routes like /api/routes must be registered BEFORE this
    app.get('/api/:fieldName', (req, res, next) => {
        const { fieldName } = req.params;
        const data = apiMessageBroker.getField(fieldName);
        
        if (!data) {
            // Field doesn't exist, pass to 404 handler
            next();
            return;
        }
        
        res.json(data);
    });

    // 404 handler - must be before error handler
    app.use(notFoundHandler);

    // Global error handler - must be last
    app.use(errorHandler);

    try {
        await new Promise<void>((resolve, reject) => {
            server = app.listen(apiConfig.port, '0.0.0.0', () => {
                log.info({
                    message: 'Magic Proxy API started',
                    data: { port: apiConfig.port }
                });
                resolve();
            });
            server!.on('error', reject);
        });
    } catch (err) {
        log.error({
            message: 'Failed to start API server',
            data: {
                port: apiConfig.port,
                error: err instanceof Error ? err.message : String(err)
            }
        });
        throw err;
    }
}

export function stopAPI(): void {
    if (server) {
        server.close();
        server = null;
        log.info({ message: 'API server stopped' });
    }
}
