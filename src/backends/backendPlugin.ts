import { loadConfigFile } from '../config';
import { MagicProxyConfigFile } from '../types/config';
import { HostEntry } from '../types/host';

type BackendStatus = { registered?: string[]; outputFile?: string | null;[key: string]: unknown };

type BackendModule = {
    initialize: (config?: MagicProxyConfigFile) => Promise<void>;
    addProxiedApp: (entry: HostEntry) => Promise<void>;
    removeProxiedApp: (appName: string) => Promise<void>;
    getStatus: () => Promise<BackendStatus>;
};

let activeBackend: BackendModule | null = null;
let activeName: string | null = null;

async function loadBackend(name: string): Promise<BackendModule> {
    switch (name) {
        case 'traefik': {
            // dynamic import to avoid load-time side effects
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

export async function initialize(config?: MagicProxyConfigFile): Promise<void> {
    const cfg = config || await loadConfigFile();
    const backendName: string = cfg.proxyBackend;

    if (!backendName) throw new Error('No proxyBackend configured');

    if (!activeBackend || activeName !== backendName) {
        activeBackend = await loadBackend(backendName);
        activeName = backendName;
    }

    await activeBackend.initialize(cfg);
}

export async function addProxiedApp(entry: HostEntry): Promise<void> {
    if (!activeBackend) await initialize();
    return activeBackend!.addProxiedApp(entry);
}

export async function removeProxiedApp(appName: string): Promise<void> {
    if (!activeBackend) await initialize();
    return activeBackend!.removeProxiedApp(appName);
}

export async function getStatus(): Promise<BackendStatus> {
    if (!activeBackend) await initialize();
    return activeBackend!.getStatus();
}
