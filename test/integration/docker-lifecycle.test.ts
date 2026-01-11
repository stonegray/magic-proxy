import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HostDB } from '../../src/hostDb';
import { DockerProvider } from '../../src/providers/docker';
import * as manifestModule from '../../src/providers/docker/manifest';
import * as composeModule from '../../src/providers/docker/compose';
import Docker from 'dockerode';

/**
 * CRITICAL INTEGRATION TESTS
 * 
 * These tests verify the security-critical aspects of container management:
 * 1. No duplicate entries in the database
 * 2. Proper cleanup of removed containers
 * 3. Correct state synchronization
 * 
 * Duplicates and leftover containers are SECURITY RISKS.
 */

describe('Docker Integration - Container Lifecycle', () => {
    let hostDb: HostDB;
    let provider: DockerProvider;
    let mockDocker: any;

    beforeEach(() => {
        vi.clearAllMocks();
        hostDb = new HostDB();

        mockDocker = {
            getEvents: vi.fn((callback) => {
                callback(null, {
                    on: vi.fn(),
                    removeAllListeners: vi.fn(),
                    destroy: vi.fn()
                });
            }),
            listContainers: vi.fn().mockResolvedValue([])
        };
    });

    afterEach(() => {
        if (provider) {
            provider.stop();
        }
    });

    describe('Container Addition', () => {
        it('should add new container to database on first sync', async () => {
            const manifest = [{
                containerName: 'test-app',
                xMagicProxy: {
                    hostname: 'test.example.com',
                    target: 'http://localhost:3000',
                    template: 'default'
                },
                composeFilePath: '/test/compose.yml',
                composeData: { services: {} },
                lastChanged: Date.now(),
                state: {}
            }];

            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest,
                results: { '/test/compose.yml': { 'test-app': 'ok' } }
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            const entry = hostDb.get('test-app');
            expect(entry).toBeDefined();
            expect(entry?.containerName).toBe('test-app');
            expect(entry?.xMagicProxy.hostname).toBe('test.example.com');
        });

        it('should emit "added" event when new container appears', async () => {
            const addedSpy = vi.fn();
            hostDb.on('added', addedSpy);

            const manifest = [{
                containerName: 'new-container',
                xMagicProxy: {
                    hostname: 'new.example.com',
                    target: 'http://localhost:8080',
                    template: 'default'
                },
                composeFilePath: '/test/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            }];

            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest,
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(addedSpy).toHaveBeenCalledOnce();
            expect(addedSpy).toHaveBeenCalledWith(expect.objectContaining({
                containerName: 'new-container'
            }));
        });
    });

    describe('Container Removal - SECURITY CRITICAL', () => {
        it('should remove container from database when no longer in manifest', async () => {
            // Pre-populate database with a container
            hostDb.upsert({
                containerName: 'old-container',
                xMagicProxy: {
                    hostname: 'old.example.com',
                    target: 'http://localhost:3000',
                    template: 'default'
                },
                composeFilePath: '/old/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            expect(hostDb.get('old-container')).toBeDefined();

            // Start provider with empty manifest (container removed)
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [],
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            // CRITICAL: Container must be removed
            expect(hostDb.get('old-container')).toBeUndefined();
        });

        it('should emit "removed" event when container is cleaned up', async () => {
            const removedSpy = vi.fn();
            hostDb.on('removed', removedSpy);

            // Pre-populate
            hostDb.upsert({
                containerName: 'to-be-removed',
                xMagicProxy: {
                    hostname: 'remove.example.com',
                    target: 'http://localhost:3000',
                    template: 'default'
                },
                composeFilePath: '/test/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            // Start with empty manifest
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [],
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(removedSpy).toHaveBeenCalledOnce();
            expect(removedSpy).toHaveBeenCalledWith(expect.objectContaining({
                containerName: 'to-be-removed'
            }));
        });

        it('should remove multiple obsolete containers in one sync', async () => {
            // Pre-populate with multiple containers
            hostDb.upsert({
                containerName: 'old-1',
                xMagicProxy: { hostname: 'old1.test', target: 'http://localhost:3001', template: 'default' },
                composeFilePath: '/old/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            hostDb.upsert({
                containerName: 'old-2',
                xMagicProxy: { hostname: 'old2.test', target: 'http://localhost:3002', template: 'default' },
                composeFilePath: '/old/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            hostDb.upsert({
                containerName: 'old-3',
                xMagicProxy: { hostname: 'old3.test', target: 'http://localhost:3003', template: 'default' },
                composeFilePath: '/old/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            expect(hostDb.getAll()).toHaveLength(3);

            // Sync with empty manifest
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [],
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            // CRITICAL: All containers must be removed
            expect(hostDb.getAll()).toHaveLength(0);
            expect(hostDb.get('old-1')).toBeUndefined();
            expect(hostDb.get('old-2')).toBeUndefined();
            expect(hostDb.get('old-3')).toBeUndefined();
        });

        it('should keep existing containers when they remain in manifest', async () => {
            hostDb.upsert({
                containerName: 'persistent',
                xMagicProxy: { hostname: 'persistent.test', target: 'http://localhost:3000', template: 'default' },
                composeFilePath: '/test/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            // Manifest still includes the container
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [{
                    containerName: 'persistent',
                    xMagicProxy: { hostname: 'persistent.test', target: 'http://localhost:3000', template: 'default' },
                    composeFilePath: '/test/compose.yml',
                    composeData: {},
                    lastChanged: Date.now(),
                    state: {}
                }],
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            // Container should still exist
            expect(hostDb.get('persistent')).toBeDefined();
        });
    });

    describe('No Duplicates - SECURITY CRITICAL', () => {
        it('should never create duplicate entries for the same container', async () => {
            const manifest = [{
                containerName: 'unique-container',
                xMagicProxy: {
                    hostname: 'unique.test',
                    target: 'http://localhost:3000',
                    template: 'default'
                },
                composeFilePath: '/test/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            }];

            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest,
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);

            // Initial sync
            await provider.start();

            const allEntries = hostDb.getAll();
            expect(allEntries).toHaveLength(1);

            // Stop and restart to trigger another sync
            provider.stop();

            const provider2 = new DockerProvider(hostDb, undefined, mockDocker);
            await provider2.start();

            const allEntriesAfter = hostDb.getAll();

            // CRITICAL: Must still have exactly 1 entry
            expect(allEntriesAfter).toHaveLength(1);
            expect(allEntriesAfter[0].containerName).toBe('unique-container');

            provider2.stop();
        });

        it('should update existing entry instead of creating duplicate', async () => {
            const updatedSpy = vi.fn();
            hostDb.on('updated', updatedSpy);

            // Pre-populate
            hostDb.upsert({
                containerName: 'existing',
                xMagicProxy: { hostname: 'old-hostname.test', target: 'http://localhost:3000', template: 'default' },
                composeFilePath: '/test/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            // Manifest with updated data for same container
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [{
                    containerName: 'existing',
                    xMagicProxy: { hostname: 'new-hostname.test', target: 'http://localhost:3000', template: 'default' },
                    composeFilePath: '/test/compose.yml',
                    composeData: {},
                    lastChanged: Date.now(),
                    state: {}
                }],
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            const allEntries = hostDb.getAll();

            // CRITICAL: Must have exactly 1 entry
            expect(allEntries).toHaveLength(1);
            expect(allEntries[0].xMagicProxy.hostname).toBe('new-hostname.test');
            expect(updatedSpy).toHaveBeenCalled();
        });

        it('should maintain unique container names across database', async () => {
            const manifest = [
                {
                    containerName: 'app-1',
                    xMagicProxy: { hostname: 'app1.test', target: 'http://localhost:3001', template: 'default' },
                    composeFilePath: '/test/compose1.yml',
                    composeData: {},
                    lastChanged: Date.now(),
                    state: {}
                },
                {
                    containerName: 'app-2',
                    xMagicProxy: { hostname: 'app2.test', target: 'http://localhost:3002', template: 'default' },
                    composeFilePath: '/test/compose2.yml',
                    composeData: {},
                    lastChanged: Date.now(),
                    state: {}
                },
                {
                    containerName: 'app-3',
                    xMagicProxy: { hostname: 'app3.test', target: 'http://localhost:3003', template: 'default' },
                    composeFilePath: '/test/compose3.yml',
                    composeData: {},
                    lastChanged: Date.now(),
                    state: {}
                }
            ];

            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest,
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            const allEntries = hostDb.getAll();
            const containerNames = allEntries.map(e => e.containerName);
            const uniqueNames = new Set(containerNames);

            // CRITICAL: All names must be unique
            expect(containerNames.length).toBe(uniqueNames.size);
            expect(allEntries).toHaveLength(3);
        });
    });

    describe('Container Updates', () => {
        it('should detect and update changed container configuration', async () => {
            const updatedSpy = vi.fn();
            hostDb.on('updated', updatedSpy);

            // Initial state
            hostDb.upsert({
                containerName: 'app',
                xMagicProxy: { hostname: 'app.test', target: 'http://localhost:3000', template: 'default' },
                composeFilePath: '/test/compose.yml',
                composeData: { version: '3' },
                lastChanged: Date.now(),
                state: {}
            });

            // Updated configuration
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [{
                    containerName: 'app',
                    xMagicProxy: { hostname: 'app.test', target: 'http://localhost:8080', template: 'custom' },
                    composeFilePath: '/test/compose.yml',
                    composeData: { version: '3' },
                    lastChanged: Date.now(),
                    state: {}
                }],
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(updatedSpy).toHaveBeenCalled();

            const entry = hostDb.get('app');
            expect(entry?.xMagicProxy.target).toBe('http://localhost:8080');
            expect(entry?.xMagicProxy.template).toBe('custom');
        });

        it('should not emit update event if configuration unchanged', async () => {
            const updatedSpy = vi.fn();
            hostDb.on('updated', updatedSpy);

            const config = {
                containerName: 'app',
                xMagicProxy: { hostname: 'app.test', target: 'http://localhost:3000', template: 'default' },
                composeFilePath: '/test/compose.yml',
                composeData: { version: '3' },
                lastChanged: Date.now(),
                state: {}
            };

            hostDb.upsert(config);

            // Same configuration
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [{ ...config, lastChanged: Date.now() }],
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            // Should not emit update if nothing changed
            expect(updatedSpy).not.toHaveBeenCalled();
        });
    });

    describe('Mixed Operations - SECURITY CRITICAL', () => {
        it('should handle add, update, and remove in single sync', async () => {
            const addedSpy = vi.fn();
            const updatedSpy = vi.fn();
            const removedSpy = vi.fn();

            hostDb.on('added', addedSpy);
            hostDb.on('updated', updatedSpy);
            hostDb.on('removed', removedSpy);

            // Pre-populate with containers
            hostDb.upsert({
                containerName: 'to-update',
                xMagicProxy: { hostname: 'old.test', target: 'http://localhost:3000', template: 'default' },
                composeFilePath: '/test/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            hostDb.upsert({
                containerName: 'to-remove',
                xMagicProxy: { hostname: 'remove.test', target: 'http://localhost:3001', template: 'default' },
                composeFilePath: '/test/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            // New manifest: update one, remove one, add one
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [
                    {
                        containerName: 'to-update',
                        xMagicProxy: { hostname: 'updated.test', target: 'http://localhost:3000', template: 'default' },
                        composeFilePath: '/test/compose.yml',
                        composeData: {},
                        lastChanged: Date.now(),
                        state: {}
                    },
                    {
                        containerName: 'new-container',
                        xMagicProxy: { hostname: 'new.test', target: 'http://localhost:3002', template: 'default' },
                        composeFilePath: '/test/compose.yml',
                        composeData: {},
                        lastChanged: Date.now(),
                        state: {}
                    }
                ],
                results: {}
            });

            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            const allEntries = hostDb.getAll();

            // CRITICAL ASSERTIONS
            expect(allEntries).toHaveLength(2); // Only 2 containers should exist
            expect(hostDb.get('to-update')).toBeDefined();
            expect(hostDb.get('new-container')).toBeDefined();
            expect(hostDb.get('to-remove')).toBeUndefined(); // Must be removed

            expect(addedSpy).toHaveBeenCalled();
            expect(updatedSpy).toHaveBeenCalled();
            expect(removedSpy).toHaveBeenCalled();

            // Verify the final state is correct
            expect(hostDb.get('to-update')?.xMagicProxy.hostname).toBe('updated.test');
            expect(hostDb.get('new-container')?.xMagicProxy.hostname).toBe('new.test');
        });

        it('should maintain database integrity after multiple sync cycles', async () => {
            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            // Cycle 1: Add 3 containers
            vi.spyOn(manifestModule, 'buildContainerManifest').mockResolvedValue({
                manifest: [
                    { containerName: 'app-1', xMagicProxy: { hostname: 'app1.test', target: 'http://localhost:3001', template: 'default' }, composeFilePath: '/test/compose.yml', composeData: {}, lastChanged: Date.now(), state: {} },
                    { containerName: 'app-2', xMagicProxy: { hostname: 'app2.test', target: 'http://localhost:3002', template: 'default' }, composeFilePath: '/test/compose.yml', composeData: {}, lastChanged: Date.now(), state: {} },
                    { containerName: 'app-3', xMagicProxy: { hostname: 'app3.test', target: 'http://localhost:3003', template: 'default' }, composeFilePath: '/test/compose.yml', composeData: {}, lastChanged: Date.now(), state: {} }
                ],
                results: {}
            });

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(hostDb.getAll()).toHaveLength(3);

            // Cycle 2: Remove one, add one
            provider.stop();

            vi.mocked(manifestModule.buildContainerManifest).mockResolvedValue({
                manifest: [
                    { containerName: 'app-1', xMagicProxy: { hostname: 'app1.test', target: 'http://localhost:3001', template: 'default' }, composeFilePath: '/test/compose.yml', composeData: {}, lastChanged: Date.now(), state: {} },
                    { containerName: 'app-2', xMagicProxy: { hostname: 'app2.test', target: 'http://localhost:3002', template: 'default' }, composeFilePath: '/test/compose.yml', composeData: {}, lastChanged: Date.now(), state: {} },
                    { containerName: 'app-4', xMagicProxy: { hostname: 'app4.test', target: 'http://localhost:3004', template: 'default' }, composeFilePath: '/test/compose.yml', composeData: {}, lastChanged: Date.now(), state: {} }
                ],
                results: {}
            });

            const provider2 = new DockerProvider(hostDb, undefined, mockDocker);
            await provider2.start();

            expect(hostDb.getAll()).toHaveLength(3);
            expect(hostDb.get('app-3')).toBeUndefined();
            expect(hostDb.get('app-4')).toBeDefined();

            // Cycle 3: Remove all
            provider2.stop();

            vi.mocked(manifestModule.buildContainerManifest).mockResolvedValue({
                manifest: [],
                results: {}
            });

            const provider3 = new DockerProvider(hostDb, undefined, mockDocker);
            await provider3.start();

            // CRITICAL: Database must be completely clean
            expect(hostDb.getAll()).toHaveLength(0);

            provider3.stop();
        });
    });

    describe('Error Recovery', () => {
        it('should handle manifest build errors gracefully without corrupting database', async () => {
            hostDb.upsert({
                containerName: 'existing',
                xMagicProxy: { hostname: 'existing.test', target: 'http://localhost:3000', template: 'default' },
                composeFilePath: '/test/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            vi.spyOn(manifestModule, 'buildContainerManifest').mockRejectedValue(new Error('Docker API error'));
            vi.spyOn(composeModule, 'groupContainersByComposeFile').mockReturnValue([]);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            // Database should remain unchanged on error
            expect(hostDb.get('existing')).toBeDefined();
            expect(hostDb.getAll()).toHaveLength(1);
        });
    });
});
