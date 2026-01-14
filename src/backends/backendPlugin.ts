import { loadConfigFile } from '../config';
import { MagicProxyConfigFile } from '../types/config';
import { HostEntry } from '../types/host';

/** Status returned by backend getStatus() */
export interface BackendStatus {
    registered?: string[];
    outputFile?: string | null;
    [key: string]: unknown;
}

/** Interface that all backend modules must implement */
export interface BackendModule {
    initialize: (config?: MagicProxyConfigFile) => Promise<void>;
    addProxiedApp: (entry: HostEntry) => Promise<void>;
    removeProxiedApp: (appName: string) => Promise<void>;
    getStatus: () => Promise<BackendStatus>;
}

let activeBackend: BackendModule | null = null;
let activeName: string | null = null;

/**
 * Load a backend module by name.
 */
async function loadBackend(name: string): Promise<BackendModule> {
    switch (name) {
        case 'traefik': {
            const mod = await import('./traefik/traefik');
            return {
                initialize: mod.initialize,
                addProxiedApp: mod.addProxiedApp,
                removeProxiedApp: mod.removeProxiedApp,
                getStatus: mod.getStatus,
            };
        }
        default:
            throw new Error(`Unknown backend '${name}'`);
    }
}

/**
 * Initialize the backend from configuration.
 */
export async function initialize(config?: MagicProxyConfigFile): Promise<void> {
    const cfg = config || await loadConfigFile();
    const backendName = cfg.proxyBackend;

    if (!backendName) {
        throw new Error('No proxyBackend configured');
    }

    if (!activeBackend || activeName !== backendName) {
        activeBackend = await loadBackend(backendName);
        activeName = backendName;
    }

    await activeBackend.initialize(cfg);
}

/**
 * Get the active backend, initializing if needed.
 */
async function ensureBackend(): Promise<BackendModule> {
    if (!activeBackend) {
        await initialize();
    }
    if (!activeBackend) {
        throw new Error('Backend initialization failed - no active backend');
    }
    return activeBackend;
}

/**
 * Add or update a proxied application.
 */
export async function addProxiedApp(entry: HostEntry): Promise<void> {
    const backend = await ensureBackend();
    return backend.addProxiedApp(entry);
}

/**
 * Remove a proxied application.
 */
export async function removeProxiedApp(appName: string): Promise<void> {
    const backend = await ensureBackend();
    return backend.removeProxiedApp(appName);
}

/**
 * Get the current backend status.
 */
export async function getStatus(): Promise<BackendStatus> {
    const backend = await ensureBackend();
    return backend.getStatus();
}
