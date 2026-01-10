import Docker from 'dockerode';
import { createApp } from './api';
import { loadConfigFile } from './config';
import { initialize as initializeBackend } from './backends/backendPlugin';
import { HostDB } from './hostDb';
import { updateDatabaseFromManifest, watchDockerEvents } from './docker';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// dockerode will talk to the local docker daemon via the socket by default
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

const app = createApp(docker);

export async function startApp(config?: any) {
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

        watchDockerEvents(() => {
            // Dispatch the async update but keep the callback return type as void
            void updateDatabaseFromManifest(hostDb).catch(err => console.error('Error updating manifest from Docker events:', err));
        });

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
