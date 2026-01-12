import { createApp } from './api';
import { loadConfigFile } from './config';
import { initialize as initializeBackend } from './backends/backendPlugin';
import { HostDB } from './hostDb';
import { DockerProvider } from './providers/docker';
import { MagicProxyConfigFile } from './types/config';
import { zone } from './logging/zone';
import { startWatchingConfigFile, resetRestartFlag } from './configWatcher';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const log = zone('index');

log.info({
    message: 'Starting Magic Proxy application',
});

const app = createApp();

let dockerProvider: DockerProvider | null = null;
let configWatcherInitialized = false;

export async function startApp(config?: MagicProxyConfigFile) {
    try {
        const cfg = config || await loadConfigFile();

        // Initialize the currently configured backend plugin
        await initializeBackend(cfg);

        // Start HostDB here and populate it from current manifest
        const hostDb = new HostDB();

        // Attach HostDB events to the backend plugin so added/updated hosts are forwarded
        // to the proxy backend for registration.
        import('./hostDispatcher').then(mod => mod.attachHostDbToBackend(hostDb));

        // Start Docker provider for real-time container monitoring
        dockerProvider = new DockerProvider(hostDb);
        await dockerProvider.start();

        log.info({
            message: 'Docker provider started - monitoring for container changes'
        });

        console.log('Initialization complete.');

        // Set up config file watcher on first start
        if (!configWatcherInitialized) {
            configWatcherInitialized = true;
            startWatchingConfigFile(handleConfigChange);
        } else {
            // If restarting, just reset the restart flag
            resetRestartFlag();
        }
    } catch (err) {
        console.error('Initialization error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}

/**
 * Handler called when config file changes
 */
async function handleConfigChange(newConfig: MagicProxyConfigFile): Promise<void> {
    log.info({
        message: 'Config file changed - restarting application'
    });
    
    // Clean up current app
    if (dockerProvider) {
        dockerProvider.stop();
        dockerProvider = null;
    }
    
    // Restart with new config
    await startApp(newConfig);
}

// Graceful shutdown handler
const shutdown = () => {
    log.info({ message: 'Shutting down gracefully...' });
    if (dockerProvider) {
        dockerProvider.stop();
    }
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Immediately start the app when importing the module in normal runs
startApp();

app.listen(port, () => {
    console.log(`Docker management API listening on port ${port}`);
});
