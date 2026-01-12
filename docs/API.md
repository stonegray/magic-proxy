# Magic Proxy API Documentation

## Overview

The Magic Proxy API provides a REST interface for monitoring. It includes comprehensive security features including authentication, rate limiting, input validation, and CORS restrictions.

## Configuration

Enable the API in `config/magic-proxy.yml`:

```yaml
api:
  enabled: true           # Enable/disable the API
  port: 3000             # Port to bind to (always binds to 0.0.0.0 for Docker)
  key: "your-secret-key" # Optional API key for authentication
  timeout: 1000          # Request timeout in milliseconds (default: 1000)
  allowListingRoutes: false  # Whether to expose /api/routes endpoint
```

## Security Features


### 1. **API Key Authentication** (Optional)
When `api.key` is configured, all requests must include the API key via:
- Header: `X-API-Key: your-secret-key`
- Query parameter: `?key=your-secret-key`

Requests without a valid key receive `401 Unauthorized`.

### 2. **CPU-Aware Rate Limiting**
Rate-limited requests receive `429 Too Many Requests`. The allowable rate limit is dynamically reduced under high CPU loads; when it exceeds 60% system load it will start limting and continue until it reaches 1% of it's original allowed RPS. Limits are global. 

### 3. **Error Sanitization**
All errors return generic messages to prevent leaking internal details:
```json
{
  "error": "An error occurred processing your request",
  "errorId": "<random 8 chars>"
}
```
No stack traces or file paths are exposed to clients. They can be retrieved by viewing the logs and correlating the errorId.

## Endpoints

### `GET /`
Root endpoint providing API information.

**Response:**
```json
{
  "message": "magic-proxy",
  "version": "1.0.0"
}
```

### `GET /api/:fieldName`
Retrieve data for a specific field exposed via `apiMessageBroker`.

**Example:**
```bash
curl http://localhost:3000/api/health \
  -H "X-API-Key: your-secret-key"
```

**Response:**
```json
{
  "status": "ok",
  "uptime": 12345
}
```

Returns `404 Not Found` if the field doesn't exist.

### `GET /api/routes` (Optional)
Lists all registered API routes. Only available when `allowListingRoutes: true`.

**Response:**
```json
{
  "routes": [
    {
      "name": "health",
      "path": "/api/health"
    },
    {
      "name": "metrics",
      "path": "/api/metrics"
    }
  ]
}
```

## API Versioning

All responses include an `X-API-Version` header:
```
X-API-Version: 1.0.0
```

The root endpoint also includes the version in the response body.

## Dynamic Route Registration

Routes are created dynamically using the `apiMessageBroker`:

```typescript
import { apiMessageBroker } from './apiMessageBroker';

// Expose data via API
apiMessageBroker.setField('health', {
  status: 'ok',
  uptime: process.uptime()
});

// Now accessible at GET /api/health
```

**Field Name Requirements:**
- Alphanumeric characters, underscore, and dash only
- 0-64 characters in length
- No special characters or slashes

**Data Requirements:**
- Must be JSON-serializable
- Functions, symbols, and undefined values are not allowed
- Circular references are not allowed

## Response Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid query parameters or request body |
| 401 | Unauthorized | Missing or invalid API key |
| 404 | Not Found | Endpoint or field doesn't exist |
| 413 | Payload Too Large | Request body exceeds 10KB |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected error occurred |

## Error Responses

All error responses include an `errorId` field (8-character hex string) that can be used to correlate the client error with server logs:

```json
{
  "error": "An error occurred processing your request",
  "errorId": "a1b2c3d4"
}
```

**To trace an error:**
1. Note the `errorId` from the error response
2. Search logs for the same `errorId` to see the full error details (stack trace, error type, etc.)

This allows clients to report errors while keeping the API response safe from information leaks.

## Examples

### With API Key (Header)
```bash
curl http://localhost:3000/api/status \
  -H "X-API-Key: your-secret-key"
```

### With API Key (Query Parameter)
```bash
curl "http://localhost:3000/api/status?key=your-secret-key"
```

### Without API Key (When Not Required)
```bash
curl http://localhost:3000/api/status
```

## Architecture

The API is structured in `/src/api/`:

```
src/api/
├── index.ts              # Main exports (startAPI, stopAPI, APIConfig)
├── server.ts             # Express app configuration and routing
├── types.ts              # Type definitions
└── middleware/
    ├── index.ts          # Middleware exports
    ├── auth.ts           # API key authentication
    ├── errorHandler.ts   # Error sanitization and 404 handling
    ├── logging.ts        # Request logging
    ├── ratelimit.ts      # CPU-aware rate limiting
    └── validation.ts     # Input validation (query params, body size)
```

### Middleware Chain Order

1. **JSON Parser** (`express.json`) - Parses JSON bodies with 10KB limit
2. **Body Size Validator** - Validates Content-Length header
3. **Helmet** - Sets security headers and CORS restrictions
4. **Rate Limiter** - CPU-aware global rate limiting
5. **Query Validator** - Validates query parameter length and types
6. **Auth Middleware** - Checks API key if configured
7. **Request Logger** - Logs IP, method, path, duration, status
8. **Timeout** - Sets request/response timeouts
9. **Version Header** - Adds X-API-Version to all responses
10. **Routes** - Application routes
11. **404 Handler** - Catches unmatched routes
12. **Error Handler** - Sanitizes and logs all errors

## Testing

Comprehensive test suite in `test/unit/api/api-security.test.ts`:

- ✅ Authentication (with/without keys, valid/invalid)
- ✅ Query parameter validation (size limits, empty params)
- ✅ Request body validation (size limits, null/empty bodies)
- ✅ Endpoint routing (404s, dynamic routes)
- ✅ Routes listing (conditional exposure)
- ✅ API versioning (headers and responses)
- ✅ Error handling (no leaked internals, proper status codes)
- ✅ Security headers (Helmet integration)

Run tests with:
```bash
npm test test/unit/api/api-security.test.ts
```
