import { createApp } from './api';
import { loadConfigFile } from './config';
import { initialize as initializeBackend } from './backends/backendPlugin';
import { HostDB } from './hostDb';
import { updateDatabaseFromManifest, watchDockerEvents } from './providers/docker';
import { MagicProxyConfigFile } from './types/config';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;


const app = createApp();

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

        await updateDatabaseFromManifest(hostDb);

        console.log('Initialization complete.');
    } catch (err) {
        console.error('Initialization error:', err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}

// Immediately start the app when importing the module in normal runs
startApp();

app.listen(port, () => {
    console.log(`Docker management API listening on port ${port}`);
});
