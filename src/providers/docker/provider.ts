import Docker from 'dockerode';
import fs from 'fs';
import { HostDB } from '../../hostDb';
import { zone } from '../../logging/zone';
import { DockerProviderConfig } from './types';
import { groupContainersByComposeFile, resolveHostPath } from './compose';
import { buildContainerManifest } from './manifest';

const log = zone('providers.docker');

/**
 * Docker event stream interface
 */
interface EventStream {
    on: (event: string, handler: (data: unknown) => void) => void;
    removeAllListeners: () => void;
    destroy?: () => void;
}

/**
 * Docker Provider - watches Docker events and compose files for changes
 */
export class DockerProvider {
    private docker: Docker;
    private hostDb: HostDB;
    private fileWatchers = new Map<string, fs.FSWatcher>();
    private eventStream?: EventStream;
    private isActive = false;
    private syncInProgress = false;
    private syncPending = false;

    constructor(hostDb: HostDB, config?: DockerProviderConfig, docker?: Docker) {
        this.docker = docker || new Docker();
        this.hostDb = hostDb;
    }

    /**
     * Start the provider - begins watching for Docker and file changes
     */
    async start(): Promise<void> {
        if (this.isActive) {
            log.warn({ message: 'DockerProvider is already active' });
            return;
        }

        this.isActive = true;
        log.debug({ message: 'Starting Docker provider' });

        await this.syncDatabase();
        this.watchDockerEvents();
        await this.updateFileWatchers();

        log.debug({ message: 'Docker provider started successfully' });
    }

    /**
     * Stop the provider - cleans up all watchers
     */
    stop(): void {
        if (!this.isActive) return;

        log.debug({ message: 'Stopping Docker provider' });
        this.isActive = false;

        // Clean up Docker event stream
        if (this.eventStream) {
            this.eventStream.removeAllListeners();
            this.eventStream.destroy?.();
            this.eventStream = undefined;
        }

        // Clean up file watchers
        for (const [path, watcher] of this.fileWatchers) {
            watcher.close();
            log.debug({ message: 'Stopped watching compose file', data: { path } });
        }
        this.fileWatchers.clear();

        log.debug({ message: 'Docker provider stopped' });
    }

    /**
     * Watch Docker events for container lifecycle changes
     */
    private watchDockerEvents(): void {
        this.docker.getEvents((err, stream) => {
            if (err || !stream) {
                log.error({
                    message: 'Failed to get Docker event stream',
                    data: { error: err instanceof Error ? err.message : String(err) }
                });
                return;
            }

            this.eventStream = stream;

            stream.on('data', (chunk) => {
                if (!this.isActive) return;

                try {
                    const event = JSON.parse(chunk.toString('utf8'));
                    if (event.Type === 'container') {
                        this.handleContainerEvent(event);
                    }
                } catch (e) {
                    log.error({
                        message: 'Failed to parse Docker event',
                        data: { error: e instanceof Error ? e.message : String(e) }
                    });
                }
            });

            stream.on('error', (err) => {
                log.error({
                    message: 'Docker event stream error',
                    data: { error: err instanceof Error ? err.message : String(err) }
                });
                this.reconnectEventStream();
            });

            stream.on('end', () => {
                log.warn({ message: 'Docker event stream ended' });
                this.reconnectEventStream();
            });
        });
    }

    /**
     * Handle a Docker container event
     */
    private handleContainerEvent(event: { Action: string; Actor?: { Attributes?: { name?: string } }; id?: string }): void {
        const { Action: action, Actor, id } = event;
        const containerName = Actor?.Attributes?.name || 'unknown';

        const syncActions = ['create', 'start', 'destroy', 'die', 'stop'];
        if (syncActions.includes(action)) {
            log.debug({ message: `Container ${action}`, data: { containerName, id } });
            this.scheduleSync();
        }
    }

    /**
     * Reconnect to Docker event stream after delay
     */
    private reconnectEventStream(): void {
        if (!this.isActive) return;

        setTimeout(() => {
            if (this.isActive) {
                log.debug({ message: 'Reconnecting to Docker event stream' });
                this.watchDockerEvents();
            }
        }, 5000);
    }

    /**
     * Create a file watcher for a compose file.
     * Handles re-attaching after rename events (atomic writes).
     */
    private createFileWatcher(path: string): void {
        // Close existing watcher if any
        const existing = this.fileWatchers.get(path);
        if (existing) {
            existing.close();
        }

        const resolvedPath = resolveHostPath(path);
        const watcher = fs.watch(resolvedPath, (eventType, filename) => {
            if (!this.isActive) return;

            log.debug({
                message: 'File watcher callback fired',
                data: { path, eventType, filename, isActive: this.isActive }
            });

            log.debug({ message: 'Compose file changed', data: { path, eventType } });

            // On rename events (atomic writes), re-attach the watcher
            // because the original inode may have been replaced
            if (eventType === 'rename') {
                log.debug({ message: 'Re-attaching file watcher after rename', data: { path } });
                setTimeout(() => {
                    if (this.isActive && fs.existsSync(resolveHostPath(path))) {
                        this.createFileWatcher(path);
                    }
                }, 100);
            }

            // Schedule sync after file change
            const delay = eventType === 'rename' ? 100 : 0;
            log.debug({
                message: 'Scheduling sync after file change',
                data: { path, delay }
            });
            setTimeout(() => this.isActive && this.scheduleSync(), delay);
        });

        watcher.on('error', (err) => {
            log.error({
                message: 'File watcher error',
                data: { path, error: err instanceof Error ? err.message : String(err) }
            });
            this.fileWatchers.delete(path);
        });

        this.fileWatchers.set(path, watcher);
        log.debug({ message: 'Started watching compose file', data: { path } });
    }

    /**
     * Update file watchers for compose files
     */
    private async updateFileWatchers(): Promise<void> {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const refs = groupContainersByComposeFile(containers);
            const activePaths = new Set(refs.map(r => r.path).filter(Boolean));

            // Add watchers for new files
            for (const path of activePaths) {
                if (this.fileWatchers.has(path)) continue;

                const resolvedPath = resolveHostPath(path);
                if (!fs.existsSync(resolvedPath)) {
                    log.warn({ message: 'Compose file does not exist', data: { path } });
                    continue;
                }

                try {
                    this.createFileWatcher(path);
                } catch (err) {
                    log.error({
                        message: 'Failed to watch compose file',
                        data: { path, error: err instanceof Error ? err.message : String(err) }
                    });
                }
            }

            // Remove watchers for files no longer referenced
            for (const [path, watcher] of this.fileWatchers) {
                if (!activePaths.has(path)) {
                    watcher.close();
                    this.fileWatchers.delete(path);
                    log.debug({ message: 'Stopped watching compose file', data: { path } });
                }
            }
        } catch (err) {
            log.error({
                message: 'Failed to update file watchers',
                data: { error: err instanceof Error ? err.message : String(err) }
            });
        }
    }

    /**
     * Schedule a database sync - ensures only one sync runs at a time
     */
    private scheduleSync(): void {
        if (this.syncInProgress) {
            this.syncPending = true;
            return;
        }
        this.runSync();
    }

    /**
     * Run the sync operation with serialization
     */
    private async runSync(): Promise<void> {
        this.syncInProgress = true;
        this.syncPending = false;

        try {
            await this.syncDatabase();
        } finally {
            this.syncInProgress = false;

            // If another sync was requested while we were running, run it now
            if (this.syncPending) {
                this.syncPending = false;
                setImmediate(() => this.runSync());
            }
        }
    }

    /**
     * Synchronize the database with current Docker state
     */
    private async syncDatabase(): Promise<void> {
        log.debug({ message: 'Starting database sync' });

        try {
            const { manifest } = await buildContainerManifest(this.docker);
            const manifestNames = new Set(manifest.map(e => e.containerName));

            log.debug({
                message: 'Manifest built',
                data: {
                    containerCount: manifest.length,
                    containers: manifest.map(m => ({
                        name: m.containerName,
                        target: m.xMagicProxy.target,
                        hostname: m.xMagicProxy.hostname
                    }))
                }
            });

            // Upsert all manifest entries and track changes
            let entriesAdded = 0;
            let entriesUpdated = 0;
            let entriesUnchanged = 0;

            for (const entry of manifest) {
                try {
                    const existing = this.hostDb.get(entry.containerName);
                    const sizeBefore = this.hostDb.getAll().length;

                    this.hostDb.upsert(entry);

                    const sizeAfter = this.hostDb.getAll().length;

                    if (!existing) {
                        entriesAdded++;
                        log.debug({
                            message: 'Container added to database',
                            data: { containerName: entry.containerName }
                        });
                    } else if (sizeBefore === sizeAfter) {
                        // Check if the entry was actually updated by comparing the data
                        const currentEntry = this.hostDb.get(entry.containerName);
                        const wasUpdated = currentEntry?.lastChanged !== existing.lastChanged;
                        if (wasUpdated) {
                            entriesUpdated++;
                            log.debug({
                                message: 'Container updated in database',
                                data: { containerName: entry.containerName }
                            });
                        } else {
                            entriesUnchanged++;
                            log.debug({
                                message: 'Container unchanged in database',
                                data: { containerName: entry.containerName }
                            });
                        }
                    }
                } catch (err) {
                    log.error({
                        message: 'Failed to upsert container entry',
                        data: {
                            containerName: entry.containerName,
                            error: err instanceof Error ? err.message : String(err)
                        }
                    });
                }
            }

            // Remove entries no longer in manifest
            let entriesRemoved = 0;
            for (const entry of this.hostDb.getAll()) {
                if (!manifestNames.has(entry.containerName)) {
                    log.debug({
                        message: 'Removing container no longer referenced',
                        data: { containerName: entry.containerName }
                    });
                    this.hostDb.remove(entry.containerName);
                    entriesRemoved++;
                }
            }

            // Log if file change resulted in no database updates
            const totalChanges = entriesAdded + entriesUpdated + entriesRemoved;
            if (totalChanges === 0 && manifest.length > 0) {
                log.debug({
                    message: 'Database sync completed with no changes',
                    data: {
                        manifestCount: manifest.length,
                        unchangedEntries: entriesUnchanged,
                        reason: 'Compose file content unchanged or no x-magic-proxy changes detected'
                    }
                });
            }

            await this.updateFileWatchers();

            log.debug({
                message: 'Database sync completed',
                data: {
                    totalInManifest: manifestNames.size,
                    currentInDb: this.hostDb.getAll().length,
                    added: entriesAdded,
                    updated: entriesUpdated,
                    removed: entriesRemoved,
                    unchanged: entriesUnchanged
                }
            });
        } catch (err) {
            log.error({
                message: 'Database sync failed',
                data: { error: err instanceof Error ? err.message : String(err) }
            });
        }
    }
}
