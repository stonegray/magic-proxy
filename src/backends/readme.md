# Adding a new proxy backend

magic-proxy supports pluggable proxy backends.

## Summary
- Backends are loaded dynamically by `loadBackend` in `backendPlugin.ts`
- Backends must implement the `BackendModule` interface exported from `backendPlugin.ts`
- The platform initializes the selected backend via `initialize()` during startup

## Backend API (required)

Export a module that implements the `BackendModule` interface:

```typescript
interface BackendModule {
    initialize(config?: MagicProxyConfigFile): Promise<void>;
    addProxiedApp(entry: HostEntry): Promise<void>;
    removeProxiedApp(appName: string): Promise<void>;
    getStatus(): Promise<BackendStatus>;
}
```

## Implementation Checklist

1. **Module location & loading**
   - Add a module under `src/backends/<your-backend>/`
   - Add a case in `loadBackend()` to dynamically import your module

2. **Initialization**
   - Load backend-specific configuration from `MagicProxyConfigFile`
   - Validate required config and fail clearly (throw or log + exit)

3. **Registry & atomic writes**
   - Provide deterministic IDs for registered apps
   - Write files atomically (tmp file + rename) and validate output

4. **addProxiedApp / removeProxiedApp**
   - Accept a `HostEntry` and perform idempotent registration
   - Ensure remove cleans up state so `getStatus()` reflects current registrations

5. **getStatus**
   - Return an object with `registered` (array of app names) and optionally `outputFile`

6. **Tests**
   - Add unit tests for template loading/rendering, registration, and output validation
   - Reuse helpers in `test/helpers/mockHelpers.ts`

7. **Config schema**
   - Update `src/types/config.d.ts` if new config fields are required
   - Update `validateConfig()` to accept the backend name

## Reference Implementation

See the Traefik backend:
- `src/backends/traefik/traefik.ts` - Main backend module
- `src/backends/traefik/traefikManager.ts` - Registry and file management
- `src/backends/backendPlugin.ts` - Plugin loader and interface