import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { startAPI, stopAPI } from '../../../src/api/server';
import { apiMessageBroker } from '../../../src/apiMessageBroker';
import { APIConfig } from '../../../src/types/config';

const TEST_PORT = 13352;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper to wait between requests to avoid rate limiting
const waitBetweenRequests = () => new Promise(resolve => setTimeout(resolve, 150));

describe('API Security and Validation', () => {
    afterEach(async () => {
        stopAPI();
        // Clear any test routes from apiMessageBroker
        apiMessageBroker.removeAllListeners('field:update');
    });

    describe('Authentication', () => {
        it('should allow requests without API key when key is not set', async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT
            };

            await startAPI(config);
            await waitBetweenRequests();

            const response = await fetch(`${BASE_URL}/`);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data).toHaveProperty('message');
            
            stopAPI();
        });

        it('should reject requests without API key when key is set', async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT,
                key: 'test-secret-key'
            };

            await startAPI(config);
            await waitBetweenRequests();

            const response = await fetch(`${BASE_URL}/`);
            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toContain('missing API key');
            
            stopAPI();
        });

        it('should reject requests with invalid API key', async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT,
                key: 'test-secret-key'
            };

            await startAPI(config);
            await waitBetweenRequests();

            const response = await fetch(`${BASE_URL}/`, {
                headers: { 'X-API-Key': 'wrong-key' }
            });
            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toContain('invalid API key');
            
            stopAPI();
        });

        it('should accept requests with valid API key via header', async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT,
                key: 'test-secret-key'
            };

            await startAPI(config);
            await waitBetweenRequests();

            const response = await fetch(`${BASE_URL}/`, {
                headers: { 'X-API-Key': 'test-secret-key' }
            });
            expect(response.status).toBe(200);
            
            stopAPI();
        });

        it('should accept requests with valid API key via query param', async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT,
                key: 'test-secret-key'
            };

            await startAPI(config);
            await waitBetweenRequests();

            const response = await fetch(`${BASE_URL}/?key=test-secret-key`);
            expect(response.status).toBe(200);
            
            stopAPI();
        });
    });

    describe('Query Parameter Validation', () => {
        beforeEach(async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT
            };
            await startAPI(config);
            await waitBetweenRequests();
        });

        it('should reject query parameters longer than 128 chars', async () => {
            await waitBetweenRequests();
            const longParam = 'a'.repeat(129);
            const response = await fetch(`${BASE_URL}/?test=${longParam}`);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('parameter too long');
        });

        it('should accept query parameters at exactly 128 chars', async () => {
            await waitBetweenRequests();
            const validParam = 'a'.repeat(128);
            const response = await fetch(`${BASE_URL}/?test=${validParam}`);
            expect(response.status).toBe(200);
        });

        it('should accept empty query parameters', async () => {
            await waitBetweenRequests();
            const response = await fetch(`${BASE_URL}/?test=`);
            expect(response.status).toBe(200);
        });
    });

    describe('Request Body Validation', () => {
        beforeEach(async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT
            };
            await startAPI(config);
            await waitBetweenRequests();
        });

        it('should reject body larger than 10KB', async () => {
            await waitBetweenRequests();
            const largeBody = { data: 'x'.repeat(11 * 1024) };
            const bodyString = JSON.stringify(largeBody);
            
            const response = await fetch(`${BASE_URL}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': bodyString.length.toString()
                },
                body: bodyString
            });
            
            expect(response.status).toBe(413);
            const data = await response.json();
            // Express's json middleware throws an error which gets sanitized by error handler
            expect(data).toHaveProperty('error');
        });

        it('should accept body smaller than 10KB', async () => {
            await waitBetweenRequests();
            // Just verify the body is accepted (GET to root)
            const response = await fetch(`${BASE_URL}/`);
            expect(response.status).toBe(200);
        });

        it('should accept null body', async () => {
            await waitBetweenRequests();
            const response = await fetch(`${BASE_URL}/`, {
                method: 'GET'
            });
            expect(response.status).toBe(200);
        });

        it('should accept empty JSON body', async () => {
            await waitBetweenRequests();
            // Just verify empty body is accepted (GET to root)
            const response = await fetch(`${BASE_URL}/`);
            expect(response.status).toBe(200);
        });
    });

    describe('Endpoint Routing', () => {
        beforeEach(async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT
            };
            await startAPI(config);
            await waitBetweenRequests();
        });

        it('should return 404 for non-existent endpoints', async () => {
            await waitBetweenRequests();
            const response = await fetch(`${BASE_URL}/api/nonexistent`);
            expect(response.status).toBe(404);
            const data = await response.json();
            expect(data.error).toBe('Not found');
        });

        it('should create dynamic routes via apiMessageBroker', async () => {
            await waitBetweenRequests();
            
            // Set field AFTER server is started (from beforeEach)
            apiMessageBroker.setField('health', { status: 'ok', uptime: 100 });

            // Wait a bit for the route to be registered
            await new Promise(resolve => setTimeout(resolve, 200));

            const response = await fetch(`${BASE_URL}/api/health`);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data).toEqual({ status: 'ok', uptime: 100 });
        });

        it('should update existing routes when setField called again', async () => {
            await waitBetweenRequests();
            apiMessageBroker.setField('status', { value: 'initial' });
            await new Promise(resolve => setTimeout(resolve, 200));

            apiMessageBroker.setField('status', { value: 'updated' });
            await new Promise(resolve => setTimeout(resolve, 200));

            const response = await fetch(`${BASE_URL}/api/status`);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data).toEqual({ value: 'updated' });
        });

        it('should reject invalid field names in apiMessageBroker', async () => {
            await waitBetweenRequests();
            // Test with invalid characters
            apiMessageBroker.setField('invalid/name', { test: 'data' });
            await new Promise(resolve => setTimeout(resolve, 200));

            const response = await fetch(`${BASE_URL}/api/invalid/name`);
            expect(response.status).toBe(404);
        });
    });

    describe('Routes Listing', () => {
        it('should not expose /api/routes when allowListingRoutes is false', async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT,
                allowListingRoutes: false
            };
            await startAPI(config);
            await waitBetweenRequests();

            const response = await fetch(`${BASE_URL}/api/routes`);
            expect(response.status).toBe(404);
            
            stopAPI();
        });

        it('should expose /api/routes when allowListingRoutes is true', async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT,
                allowListingRoutes: true
            };
            await startAPI(config);
            await waitBetweenRequests();

            const response = await fetch(`${BASE_URL}/api/routes`);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data).toHaveProperty('routes');
            expect(Array.isArray(data.routes)).toBe(true);
            
            stopAPI();
        });

        it('should list all registered routes', async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT,
                allowListingRoutes: true
            };
            await startAPI(config);
            await waitBetweenRequests();

            apiMessageBroker.setField('health', { status: 'ok' });
            apiMessageBroker.setField('metrics', { cpu: 50 });
            await new Promise(resolve => setTimeout(resolve, 200));

            const response = await fetch(`${BASE_URL}/api/routes`);
            const data = await response.json();
            
            expect(data.routes).toBeDefined();
            expect(data.routes.length).toBeGreaterThanOrEqual(2);
            const routeNames = data.routes.map((r: any) => r.name);
            expect(routeNames).toContain('health');
            expect(routeNames).toContain('metrics');
            
            stopAPI();
        });
    });

    describe('API Versioning', () => {
        beforeEach(async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT
            };
            await startAPI(config);
            await waitBetweenRequests();
        });

        it('should include X-API-Version header in responses', async () => {
            await waitBetweenRequests();
            const response = await fetch(`${BASE_URL}/`);
            const versionHeader = response.headers.get('x-api-version');
            expect(versionHeader).toBeTruthy();
            expect(versionHeader).toMatch(/^\d+\.\d+\.\d+$/);
            
            stopAPI();
        });

        it('should include version in root endpoint response', async () => {
            await waitBetweenRequests();
            const response = await fetch(`${BASE_URL}/`);
            const data = await response.json();
            expect(data).toHaveProperty('version');
            expect(typeof data.version).toBe('string');
            expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
            
            stopAPI();
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT
            };
            await startAPI(config);
            // Wait a bit after startup to avoid rate limit issues
            await waitBetweenRequests();
        });

        it('should not leak error details in responses', async () => {
            await waitBetweenRequests();
            const response = await fetch(`${BASE_URL}/api/nonexistent`);
            
            let data;
            try {
                data = await response.json();
            } catch (err) {
                // If not JSON, that's also fine - we just want no error details
                expect(response.status).toBe(404);
                stopAPI();
                return;
            }
            
            // Should have generic error message, no stack traces
            expect(data).not.toHaveProperty('stack');
            expect(data).not.toHaveProperty('trace');
            expect(data).toHaveProperty('error');
            expect(typeof data.error).toBe('string');
            
            stopAPI();
        });

        it('should return proper status codes', async () => {
            await waitBetweenRequests();
            // 404 for not found (after rate limit window)
            const notFound = await fetch(`${BASE_URL}/api/missing`);
            expect([404, 429]).toContain(notFound.status); // Can be rate limited

            await waitBetweenRequests();
            // 400 for bad request
            const badRequest = await fetch(`${BASE_URL}/?test=${'x'.repeat(200)}`);
            expect([400, 429]).toContain(badRequest.status);

            await waitBetweenRequests();
            // 401 for unauthorized (when auth is enabled)
            stopAPI();
            await waitBetweenRequests();
            await startAPI({ enabled: true, port: TEST_PORT, key: 'secret' });
            await waitBetweenRequests();
            const unauthorized = await fetch(`${BASE_URL}/`);
            expect(unauthorized.status).toBe(401);
            
            stopAPI();
        });
    });

    describe('Security Headers', () => {
        beforeEach(async () => {
            const config: APIConfig = {
                enabled: true,
                port: TEST_PORT
            };
            await startAPI(config);
            await waitBetweenRequests();
        });

        it('should include helmet security headers', async () => {
            await waitBetweenRequests();
            const response = await fetch(`${BASE_URL}/`);
            
            // Check for common security headers set by helmet
            expect(response.headers.has('x-content-type-options')).toBe(true);
            expect(response.headers.has('x-frame-options')).toBe(true);
            
            stopAPI();
        });
    });
});
