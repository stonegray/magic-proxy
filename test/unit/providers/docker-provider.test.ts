import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DockerProvider } from '../../../src/providers/docker';
import { HostDB } from '../../../src/hostDb';
import * as composeModule from '../../../src/providers/docker/compose';
import * as manifestModule from '../../../src/providers/docker/manifest';
import fs from 'fs';

// Mock dependencies
vi.mock('fs');
vi.mock('../../../src/providers/docker/compose', async () => {
    const actual = await vi.importActual('../../../src/providers/docker/compose');
    return {
        ...actual,
        groupContainersByComposeFile: vi.fn(),
        resolveHostPath: vi.fn((path) => path)
    };
});
vi.mock('../../../src/providers/docker/manifest', async () => {
    const actual = await vi.importActual('../../../src/providers/docker/manifest');
    return {
        ...actual,
        buildContainerManifest: vi.fn()
    };
});

describe('DockerProvider', () => {
    let hostDb: HostDB;
    let provider: DockerProvider;
    let mockDocker: any;
    let mockEventStream: any;

    beforeEach(() => {
        vi.clearAllMocks();
        hostDb = new HostDB();

        // Setup Docker mock
        mockEventStream = {
            on: vi.fn(),
            removeAllListeners: vi.fn(),
            destroy: vi.fn()
        };

        mockDocker = {
            getEvents: vi.fn((callback) => {
                callback(null, mockEventStream);
            }),
            listContainers: vi.fn().mockResolvedValue([])
        };

        // Setup fs.watch mock
        const mockWatcher = {
            close: vi.fn(),
            on: vi.fn()
        };
        vi.mocked(fs.watch).mockReturnValue(mockWatcher as any);
        vi.mocked(fs.existsSync).mockReturnValue(true);

        // Setup default manifest response
        vi.mocked(manifestModule.buildContainerManifest).mockResolvedValue({
            manifest: [],
            results: {}
        });

        vi.mocked(composeModule.groupContainersByComposeFile).mockReturnValue([]);
    });

    afterEach(() => {
        if (provider) {
            provider.stop();
        }
    });

    describe('start', () => {
        it('should initialize Docker event listener', async () => {
            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(mockDocker.getEvents).toHaveBeenCalled();
            expect(mockEventStream.on).toHaveBeenCalledWith('data', expect.any(Function));
            expect(mockEventStream.on).toHaveBeenCalledWith('error', expect.any(Function));
            expect(mockEventStream.on).toHaveBeenCalledWith('end', expect.any(Function));
        });

        it('should perform initial sync', async () => {
            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(manifestModule.buildContainerManifest).toHaveBeenCalled();
        });

        it('should not start twice', async () => {
            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();
            await provider.start();

            // Should only call getEvents once
            expect(mockDocker.getEvents).toHaveBeenCalledTimes(1);
        });
    });

    describe('Docker event handling', () => {
        it('should trigger sync on container create event', async () => {
            const buildManifestSpy = vi.mocked(manifestModule.buildContainerManifest);
            buildManifestSpy.mockClear();

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            // Clear the initial sync call
            buildManifestSpy.mockClear();

            // Get the data event handler
            const dataHandler = mockEventStream.on.mock.calls.find(
                (call: any) => call[0] === 'data'
            )?.[1];

            expect(dataHandler).toBeDefined();

            // Simulate container create event
            const event = {
                Type: 'container',
                Action: 'create',
                Actor: { Attributes: { name: 'test-container' } },
                id: 'abc123'
            };

            dataHandler(Buffer.from(JSON.stringify(event)));

            // Wait for rate limiter
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(buildManifestSpy).toHaveBeenCalled();
        });

        it('should trigger sync on container destroy event', async () => {
            const buildManifestSpy = vi.mocked(manifestModule.buildContainerManifest);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            buildManifestSpy.mockClear();

            const dataHandler = mockEventStream.on.mock.calls.find(
                (call: any) => call[0] === 'data'
            )?.[1];

            const event = {
                Type: 'container',
                Action: 'destroy',
                Actor: { Attributes: { name: 'test-container' } },
                id: 'abc123'
            };

            dataHandler(Buffer.from(JSON.stringify(event)));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(buildManifestSpy).toHaveBeenCalled();
        });

        it('should ignore non-container events', async () => {
            const buildManifestSpy = vi.mocked(manifestModule.buildContainerManifest);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            buildManifestSpy.mockClear();

            const dataHandler = mockEventStream.on.mock.calls.find(
                (call: any) => call[0] === 'data'
            )?.[1];

            const event = {
                Type: 'network',
                Action: 'create',
                id: 'network123'
            };

            dataHandler(Buffer.from(JSON.stringify(event)));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(buildManifestSpy).not.toHaveBeenCalled();
        });
    });

    describe('File watching', () => {
        it('should watch compose files from containers', async () => {
            const composeFiles = [
                {
                    path: '/path/to/compose.yml',
                    containers: []
                }
            ];

            vi.mocked(composeModule.groupContainersByComposeFile).mockReturnValue(composeFiles);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(fs.watch).toHaveBeenCalledWith('/path/to/compose.yml', expect.any(Function));
        });

        it('should trigger sync when compose file changes', async () => {
            const buildManifestSpy = vi.mocked(manifestModule.buildContainerManifest);
            const composeFiles = [
                {
                    path: '/path/to/compose.yml',
                    containers: []
                }
            ];

            vi.mocked(composeModule.groupContainersByComposeFile).mockReturnValue(composeFiles);

            let fileChangeCallback: any;
            vi.mocked(fs.watch).mockImplementation(((path: string, callback: any) => {
                fileChangeCallback = callback;
                return {
                    close: vi.fn(),
                    on: vi.fn()
                } as any;
            }) as any);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            buildManifestSpy.mockClear();

            // Simulate file change
            fileChangeCallback('change');

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(buildManifestSpy).toHaveBeenCalled();
        });
    });

    describe('Database sync', () => {
        it('should add containers from manifest to database', async () => {
            const manifest = [
                {
                    containerName: 'test-container',
                    xMagicProxy: {
                        hostname: 'test.local',
                        target: 'http://localhost:3000',
                        template: 'default'
                    },
                    composeFilePath: '/path/to/compose.yml',
                    composeData: {},
                    lastChanged: Date.now(),
                    state: {}
                }
            ];

            vi.mocked(manifestModule.buildContainerManifest).mockResolvedValue({
                manifest,
                results: {}
            });

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(hostDb.get('test-container')).toBeDefined();
        });

        it('should remove containers not in manifest', async () => {
            // Pre-populate database
            hostDb.upsert({
                containerName: 'old-container',
                xMagicProxy: {
                    hostname: 'old.local',
                    target: 'http://localhost:3000',
                    template: 'default'
                },
                composeFilePath: '/old/compose.yml',
                composeData: {},
                lastChanged: Date.now(),
                state: {}
            });

            vi.mocked(manifestModule.buildContainerManifest).mockResolvedValue({
                manifest: [], // Empty manifest - container should be removed
                results: {}
            });

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            expect(hostDb.get('old-container')).toBeUndefined();
        });
    });

    describe('stop', () => {
        it('should clean up event stream and file watchers', async () => {
            const composeFiles = [
                {
                    path: '/path/to/compose.yml',
                    containers: []
                }
            ];

            vi.mocked(composeModule.groupContainersByComposeFile).mockReturnValue(composeFiles);

            const mockFileWatcher = {
                close: vi.fn(),
                on: vi.fn()
            };

            vi.mocked(fs.watch).mockReturnValue(mockFileWatcher as any);

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            provider.stop();

            expect(mockEventStream.removeAllListeners).toHaveBeenCalled();
            expect(mockEventStream.destroy).toHaveBeenCalled();
            expect(mockFileWatcher.close).toHaveBeenCalled();
        });
    });

    // REGRESSION: Sync serialization tests
    // Previously, concurrent syncs could cause race conditions where containers
    // would be removed then immediately re-added, and file writes would conflict
    describe('Sync serialization (regression)', () => {
        it('should not run concurrent syncs', async () => {
            const buildManifestSpy = vi.mocked(manifestModule.buildContainerManifest);

            // Create a slow mock that takes 100ms
            let callCount = 0;
            buildManifestSpy.mockImplementation(async () => {
                callCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
                return { manifest: [], results: {} };
            });

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            // Clear initial sync
            callCount = 0;
            buildManifestSpy.mockClear();

            const dataHandler = mockEventStream.on.mock.calls.find(
                (call: any) => call[0] === 'data'
            )?.[1];

            // Fire 5 rapid events
            for (let i = 0; i < 5; i++) {
                const event = {
                    Type: 'container',
                    Action: 'create',
                    Actor: { Attributes: { name: `container-${i}` } },
                    id: `id-${i}`
                };
                dataHandler(Buffer.from(JSON.stringify(event)));
            }

            // Wait for all syncs to complete
            await new Promise(resolve => setTimeout(resolve, 500));

            // Should have batched updates - at most 2 calls (first + one pending)
            expect(buildManifestSpy.mock.calls.length).toBeLessThanOrEqual(2);
        });

        it('should process pending sync after current sync completes', async () => {
            const buildManifestSpy = vi.mocked(manifestModule.buildContainerManifest);

            let syncCount = 0;
            buildManifestSpy.mockImplementation(async () => {
                syncCount++;
                await new Promise(resolve => setTimeout(resolve, 50));
                return { manifest: [], results: {} };
            });

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            // Clear initial sync
            syncCount = 0;
            buildManifestSpy.mockClear();

            const dataHandler = mockEventStream.on.mock.calls.find(
                (call: any) => call[0] === 'data'
            )?.[1];

            // Fire first event - starts sync
            dataHandler(Buffer.from(JSON.stringify({
                Type: 'container',
                Action: 'create',
                Actor: { Attributes: { name: 'container-1' } },
                id: 'id-1'
            })));

            // Wait a tiny bit then fire second event while first is running
            await new Promise(resolve => setTimeout(resolve, 10));

            dataHandler(Buffer.from(JSON.stringify({
                Type: 'container',
                Action: 'destroy',
                Actor: { Attributes: { name: 'container-2' } },
                id: 'id-2'
            })));

            // Wait for both to complete
            await new Promise(resolve => setTimeout(resolve, 200));

            // Should have run exactly 2 syncs (not 1, not more)
            expect(syncCount).toBe(2);
        });

        it('should coalesce multiple pending syncs into one', async () => {
            const buildManifestSpy = vi.mocked(manifestModule.buildContainerManifest);

            let syncCount = 0;
            buildManifestSpy.mockImplementation(async () => {
                syncCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
                return { manifest: [], results: {} };
            });

            provider = new DockerProvider(hostDb, undefined, mockDocker);
            await provider.start();

            syncCount = 0;
            buildManifestSpy.mockClear();

            const dataHandler = mockEventStream.on.mock.calls.find(
                (call: any) => call[0] === 'data'
            )?.[1];

            // Fire first event - starts sync
            dataHandler(Buffer.from(JSON.stringify({
                Type: 'container',
                Action: 'create',
                Actor: { Attributes: { name: 'container-1' } },
                id: 'id-1'
            })));

            // Fire 10 more events while sync is running - should all coalesce
            await new Promise(resolve => setTimeout(resolve, 10));
            for (let i = 2; i <= 11; i++) {
                dataHandler(Buffer.from(JSON.stringify({
                    Type: 'container',
                    Action: 'create',
                    Actor: { Attributes: { name: `container-${i}` } },
                    id: `id-${i}`
                })));
            }

            // Wait for completion
            await new Promise(resolve => setTimeout(resolve, 300));

            // Should have exactly 2 syncs: first + one coalesced pending
            expect(syncCount).toBe(2);
        });
    });
});
