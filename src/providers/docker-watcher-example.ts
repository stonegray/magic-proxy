/**
 * Docker Provider Integration Example
 * 
 * This file demonstrates how to integrate the DockerProvider into your application.
 * The DockerProvider monitors Docker container lifecycle events and compose file changes,
 * automatically keeping the HostDB synchronized.
 */

import { HostDB } from '../hostDb';
import { DockerProvider } from './docker';
import { zone } from '../logging/zone';

const log = zone('docker-integration');

/**
 * Example: Basic integration
 */
export async function basicIntegration() {
    // Create your HostDB instance
    const hostDb = new HostDB();

    // Listen to database events to react to changes
    hostDb.on('added', (entry) => {
        log.info({
            message: 'New container added to database',
            data: {
                containerName: entry.containerName,
                hostname: entry.xMagicProxy.hostname
            }
        });
        // Trigger your backend updates here (e.g., regenerate Traefik config)
    });

    hostDb.on('updated', (entry) => {
        log.info({
            message: 'Container configuration updated',
            data: {
                containerName: entry.containerName,
                hostname: entry.xMagicProxy.hostname
            }
        });
        // Trigger your backend updates here
    });

    hostDb.on('removed', (entry) => {
        log.info({
            message: 'Container removed from database',
            data: {
                containerName: entry.containerName
            }
        });
        // Trigger your backend cleanup here
    });

    // Create and start the provider
    const provider = new DockerProvider(hostDb);
    await provider.start();

    log.info({ message: 'Docker provider is now monitoring for changes' });

    // Graceful shutdown
    process.on('SIGINT', () => {
        log.info({ message: 'Shutting down...' });
        provider.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        log.info({ message: 'Shutting down...' });
        provider.stop();
        process.exit(0);
    });
}

/**
 * Example: Integration with existing backend (e.g., Traefik)
 */
export async function integrateWithBackend() {
    const hostDb = new HostDB();
    const provider = new DockerProvider(hostDb);

    // Debounce backend updates to avoid excessive regeneration
    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleBackendUpdate = () => {
        if (updateTimer) {
            clearTimeout(updateTimer);
        }
        updateTimer = setTimeout(async () => {
            try {
                log.info({ message: 'Triggering backend configuration update' });
                // Your backend update logic here
                // Example: await traefikManager.regenerateConfig(hostDb.getAll());
            } catch (err) {
                log.error({
                    message: 'Failed to update backend configuration',
                    data: { error: err instanceof Error ? err.message : String(err) }
                });
            }
        }, 500); // Wait 500ms after last change before updating
    };

    // React to all database changes
    hostDb.on('added', scheduleBackendUpdate);
    hostDb.on('updated', scheduleBackendUpdate);
    hostDb.on('removed', scheduleBackendUpdate);

    // Start watching
    await provider.start();

    return { hostDb, provider };
}

/**
 * Example: One-time sync without continuous watching
 */
export async function oneTimeSync() {
    const hostDb = new HostDB();
    const provider = new DockerProvider(hostDb);

    // Start the provider (this performs initial sync)
    await provider.start();

    // Immediately stop watching (keeps the synced data)
    provider.stop();

    // Now you have a synchronized database without ongoing watching
    const containers = hostDb.getAll();
    log.info({
        message: 'One-time sync completed',
        data: { containerCount: containers.length }
    });

    return hostDb;
}

/**
 * Example: Custom event handling
 */
export async function customEventHandling() {
    const hostDb = new HostDB();
    const provider = new DockerProvider(hostDb);

    // Track container changes for metrics/logging
    const metrics = {
        containersAdded: 0,
        containersUpdated: 0,
        containersRemoved: 0
    };

    hostDb.on('added', (entry) => {
        metrics.containersAdded++;
        log.info({
            message: 'Container metrics updated',
            data: { ...metrics, lastAdded: entry.containerName }
        });
    });

    hostDb.on('updated', (entry) => {
        metrics.containersUpdated++;
        log.info({
            message: 'Container configuration changed',
            data: {
                containerName: entry.containerName,
                composeFile: entry.composeFilePath
            }
        });
    });

    hostDb.on('removed', (entry) => {
        metrics.containersRemoved++;
        log.warn({
            message: 'Container removed',
            data: {
                containerName: entry.containerName,
                wasManaging: entry.xMagicProxy.hostname
            }
        });
    });

    await provider.start();

    // Expose metrics endpoint
    setInterval(() => {
        log.debug({
            message: 'Current metrics',
            data: {
                ...metrics,
                currentContainers: hostDb.getAll().length
            }
        });
    }, 60000); // Log every minute

    return { hostDb, provider, metrics };
}
