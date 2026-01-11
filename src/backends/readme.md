# Adding a new proxy backend

magic-proxy is more or less setup for being fully proxy-agnostic. 

Summary
- Backends are loaded dynamically by [`loadBackend`](src/backends/backendPlugin.ts) and must match the backend shape defined by [`BackendModule`](src/backends/backendPlugin.ts).
- The platform initializes the selected backend via [`initialize`](src/backends/backendPlugin.ts) (which is called from [`startApp`](src/index.ts) after config is loaded with [`loadConfigFile`](src/config.ts) and validated by [`validateConfig`](src/config.ts)).

Backend API (required)
- Export an object that implements the [`BackendModule`](src/backends/backendPlugin.ts) shape:
  - initialize(config?: [`MagicProxyConfigFile`](src/types/config.d.ts)): Promise<void>
  - addProxiedApp(entry: [`HostEntry`](src/types/host.d.ts)): Promise<void>
  - removeProxiedApp(appName: string): Promise<void>
  - getStatus(): Promise<{ registered?: string[]; outputFile?: string | null; [key: string]: unknown }>

Practical guidance / checklist
1. Module location & loading
   - Add a module under `src/backends/<your-backend>/` and export the required functions.
   - Add a case in [`loadBackend`](src/backends/backendPlugin.ts) to dynamically import your module by `proxyBackend` name.

2. Initialization
   - Load any backend-specific configuration from the provided [`MagicProxyConfigFile`](src/types/config.d.ts).
   - Validate required config and fail clearly (throw or log + exit). See the [`traefik`](src/backends/traefik/traefik.ts) behavior for examples.
   - Set up any on-disk output paths or runtime state the backend needs.

3. Registry / state & atomic writes
   - Provide deterministic IDs for registered apps so getStatus and subsequent calls are stable.
   - If writing files (e.g., dynamic proxy config): write atomically (tmp file + rename) and validate output where possible. See [`register`](src/backends/traefik/traefikManager.ts) and [`flushToDisk`](src/backends/traefik/traefikManager.ts) for patterns.

4. addProxiedApp / removeProxiedApp behavior
   - Accept a [`HostEntry`](src/types/host.d.ts) and perform idempotent registration.
   - Ensure remove cleans up state so `getStatus()` reflects current registrations.

5. getStatus
   - Return an object containing `registered` (array of app names) and optionally `outputFile` (or other runtime metadata).

6. Tests
   - Add unit tests covering:
     - Template loading and rendering.
     - Registration/unregistration behavior.
     - Output format validation (if generating files).
   - Reuse helpers in [test/helpers/mockHelpers.ts](test/helpers/mockHelpers.ts) (FS mocks like `setupFSMocks` and `mockFileWrite`) and follow existing test patterns (see [test/legacy/backend.test.ts](test/legacy/backend.test.ts) and [test/legacy/traefik-file.test.ts](test/legacy/traefik-file.test.ts)).

7. Config schema
   - If new config fields are required, update [`src/types/config.d.ts`](src/types/config.d.ts) and ensure [`validateConfig`](src/config.ts) accepts the backend name (add to valid backends if needed).

8. Error handling & startup
   - Be explicit on fatal vs recoverable errors. The application startup (`startApp` in [`src/index.ts`](src/index.ts)) will exit on uncaught initialization errors; handle accordingly.

Examples & references
- Reference backend implementation: [`src/backends/traefik/traefik.ts`](src/backends/traefik/traefik.ts)
- Manager utilities: [`src/backends/traefik/traefikManager.ts`](src/backends/traefik/traefikManager.ts)
- Backend plugin loader and API: [`src/backends/backendPlugin.ts`](src/backends/backendPlugin.ts)
- Types: [`MagicProxyConfigFile`](src/types/config.d.ts), [`HostEntry`](src/types/host.d.ts)

If you want, I can scaffold a minimal backend module (with tests) using these patterns.