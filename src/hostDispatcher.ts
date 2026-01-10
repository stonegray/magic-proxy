import { HostDB } from './hostDb';
import { HostEntry } from './types/host';
import * as backendPlugin from './backends/backendPlugin';

/**
 * Attach HostDB events to backend plugin calls.
 * - on 'added' and 'updated' -> call backendPlugin.addProxiedApp(entry)
 * - on 'removed' -> call backendPlugin.removeProxiedApp(entry.containerName)
 */
export function attachHostDbToBackend(hostDb: HostDB) {
    hostDb.on('added', (entry: HostEntry) => {
        backendPlugin.addProxiedApp(entry).catch(err => {
            console.error('Error sending added host to backend:', entry.containerName, err instanceof Error ? err.message : String(err));
        });
    });

    hostDb.on('updated', (entry: HostEntry) => {
        backendPlugin.addProxiedApp(entry).catch(err => {
            console.error('Error sending updated host to backend:', entry.containerName, err instanceof Error ? err.message : String(err));
        });
    });

    hostDb.on('removed', (entry: HostEntry) => {
        backendPlugin.removeProxiedApp(entry.containerName).catch(err => {
            console.error('Error sending removed host to backend:', entry.containerName, err instanceof Error ? err.message : String(err));
        });
    });
}
