# API Message Broker

Overview

The API Message Broker (`src/apiMessageBroker.ts`) is a small, focused security layer used by the HTTP API to control what runtime information may be published to clients.

Why it exists

Exposing internal runtime state directly is dangerous: it can leak secrets, internal data structures, or non-serializable values that cause crashes. The broker ensures only explicit, vetted fields are exposed and that their values are safe to serialize and publish.

Core guarantees

- Only explicitly set fields are exposed; nothing is exposed implicitly.
- Field names are validated (alphanumeric, underscore, dash; 1-64 characters).
- Field values are sanitized to be JSON-serializable; functions, symbols, `undefined`, and circular references are rejected.
- Changes emit a `field:update` event so the API can reflect updates in real time.

Public API

- `apiMessageBroker.setField(name: string, data: Record<string, unknown>): void`
  - Validates `name` and sanitizes `data`. If validation fails the call is ignored and a log entry is created.
  - Emits `field:update` on success.

- `apiMessageBroker.getField(name: string): Record<string, unknown> | undefined`
  - Return the published data for `name` or `undefined` if not present.

- `apiMessageBroker.getFields(names: string[]): Map<string, Record<string, unknown>>`
  - Return a map of matching fields for the requested names.

- `apiMessageBroker.getRoutes(): string[]`
  - Return all available field names (used by `GET /api/routes`).

Usage

```ts
import { apiMessageBroker } from './apiMessageBroker';

// Publish vetted info for the API to expose
apiMessageBroker.setField('health', {
  status: 'ok',
  uptime: Math.floor(process.uptime())
});

// Later, GET /api/health will return that object
```

Security notes

- Do not publish secrets or raw configuration objects.
- Ensure caller code prepares and filters data so that sensitive fields are not included.
- The broker performs defensive checks but is not a substitute for application-level data governance.

Tests

See `test/unit/api/api-security.test.ts` for tests that verify that fields are listed, retrieved, and validated correctly.
