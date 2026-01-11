import { describe, it, expect, vi, beforeEach } from 'vitest';
import Docker from 'dockerode';
import {
    extractContainerName,
    validateXMagicProxy,
    extractXMagicProxy,
    groupContainersByComposeFile,
    buildContainerManifest,
    ProcessingResult
} from '../../../src/providers/docker';
import { HostDB } from '../../../src/hostDb';
import { XMagicProxyData } from '../../../src/types/xmagic';
import { ComposeFileData } from '../../../src/types/docker';
import { baseLogger } from '../../../src/logging/logger';

describe('Docker Provider - extractContainerName', () => {
    it('should remove leading slash from container name', () => {
        const container = {
            Names: ['/my-container-name']
        } as Docker.ContainerInfo;

        const result = extractContainerName(container);
        expect(result).toBe('my-container-name');
    });

    it('should handle container names without leading slash', () => {
        const container = {
            Names: ['my-container-name']
        } as Docker.ContainerInfo;

        const result = extractContainerName(container);
        expect(result).toBe('my-container-name');
    });
});

describe('Docker Provider - validateXMagicProxy', () => {
    beforeEach(() => {
        vi.spyOn(baseLogger, 'warn').mockImplementation(() => { });
    });

    it('should return false for undefined x-magic-proxy', () => {
        const result = validateXMagicProxy(undefined, 'test-container');
        expect(result).toBe(false);
    });

    it('should return false and warn when template is missing', () => {
        const xMagicProxy = {
            target: 'http://localhost:3000',
            hostname: 'example.com'
        } as Partial<XMagicProxyData>;

        const result = validateXMagicProxy(xMagicProxy, 'test-container');

        expect(result).toBe(false);
        expect((baseLogger.warn as any)).toHaveBeenCalledWith(
            'Container has malformed x-magic-proxy: missing required field "template"',
            expect.objectContaining({ zone: 'providers.docker', data: { containerName: 'test-container' } })
        );
    });

    it('should return false and warn when target is missing', () => {
        const xMagicProxy = {
            template: 'example.yml',
            hostname: 'example.com'
        } as Partial<XMagicProxyData>;

        const result = validateXMagicProxy(xMagicProxy, 'test-container');

        expect(result).toBe(false);
        expect((baseLogger.warn as any)).toHaveBeenCalledWith(
            'Container has malformed x-magic-proxy: missing required field "target"',
            expect.objectContaining({ zone: 'providers.docker', data: { containerName: 'test-container' } })
        );
    });

    it('should return false and warn when hostname is missing', () => {
        const xMagicProxy = {
            template: 'example.yml',
            target: 'http://localhost:3000'
        } as Partial<XMagicProxyData>;

        const result = validateXMagicProxy(xMagicProxy, 'test-container');

        expect(result).toBe(false);
        expect((baseLogger.warn as any)).toHaveBeenCalledWith(
            'Container has malformed x-magic-proxy: missing required field "hostname"',
            expect.objectContaining({ zone: 'providers.docker', data: { containerName: 'test-container' } })
        );
    });

    it('should return true for valid x-magic-proxy configuration', () => {
        const xMagicProxy: XMagicProxyData = {
            template: 'example.yml',
            target: 'http://localhost:3000',
            hostname: 'example.com'
        };

        const result = validateXMagicProxy(xMagicProxy, 'test-container');
        expect(result).toBe(true);
    });

    it('should return true for valid x-magic-proxy with optional fields', () => {
        const xMagicProxy: XMagicProxyData = {
            template: 'example.yml',
            target: 'http://localhost:3000',
            hostname: 'example.com',
            userData: { custom: 'data' }
        };

        const result = validateXMagicProxy(xMagicProxy, 'test-container');
        expect(result).toBe(true);
    });

    it('should return false and warn when target is not a valid http(s) URL', () => {
        const xMagicProxy: Partial<XMagicProxyData> = {
            template: 'example.yml',
            target: 'not-a-url',
            hostname: 'example.com'
        };

        const result = validateXMagicProxy(xMagicProxy, 'test-container');

        expect(result).toBe(false);
        expect((baseLogger.warn as any)).toHaveBeenCalledWith(
            'Container has malformed x-magic-proxy',
            expect.objectContaining({ zone: 'providers.docker', data: expect.objectContaining({ containerName: 'test-container', reason: expect.any(String) }) })
        );
    });

    it('should return false and warn when userData has invalid nested object', () => {
        const xMagicProxy: Partial<XMagicProxyData> = {
            template: 'example.yml',
            target: 'http://localhost:3000',
            hostname: 'example.com',
            // nested objects are not allowed in userData
            userData: { nested: { a: 1 } } as any
        };

        const result = validateXMagicProxy(xMagicProxy, 'test-container');

        expect(result).toBe(false);
        expect((baseLogger.warn as any)).toHaveBeenCalledWith(
            'Container has malformed x-magic-proxy',
            expect.objectContaining({ zone: 'providers.docker', data: expect.objectContaining({ containerName: 'test-container', reason: expect.any(String) }) })
        );
    });
});

describe('Docker Provider - extractXMagicProxy', () => {
    it('should return undefined when composeData is undefined', () => {
        const result = extractXMagicProxy(undefined);
        expect(result).toBeUndefined();
    });

    it('should return undefined when services is undefined', () => {
        const composeData: ComposeFileData = {
            version: '3.8'
        };

        const result = extractXMagicProxy(composeData);
        expect(result).toBeUndefined();
    });

    it('should return undefined when no service has x-magic-proxy', () => {
        const composeData: ComposeFileData = {
            version: '3.8',
            services: {
                web: {
                    image: 'nginx'
                },
                db: {
                    image: 'postgres'
                }
            }
        };

        const result = extractXMagicProxy(composeData);
        expect(result).toBeUndefined();
    });

    it('should extract x-magic-proxy from first service that has it', () => {
        const xMagicProxy: XMagicProxyData = {
            template: 'example.yml',
            target: 'http://localhost:3000',
            hostname: 'example.com'
        };

        const composeData: ComposeFileData = {
            version: '3.8',
            services: {
                web: {
                    image: 'nginx',
                    'x-magic-proxy': xMagicProxy
                },
                db: {
                    image: 'postgres'
                }
            }
        };

        const result = extractXMagicProxy(composeData);
        expect(result).toEqual(xMagicProxy);
    });
});

describe('Docker Provider - groupContainersByComposeFile', () => {
    beforeEach(() => {
        vi.spyOn(baseLogger, 'warn').mockImplementation(() => { });
    });

    it('should group containers by compose file path', () => {
        const containers: Docker.ContainerInfo[] = [
            {
                Names: ['/container1'],
                Labels: {
                    'com.docker.compose.project.config_files': '/path/to/compose1.yml'
                }
            } as Docker.ContainerInfo,
            {
                Names: ['/container2'],
                Labels: {
                    'com.docker.compose.project.config_files': '/path/to/compose1.yml'
                }
            } as Docker.ContainerInfo,
            {
                Names: ['/container3'],
                Labels: {
                    'com.docker.compose.project.config_files': '/path/to/compose2.yml'
                }
            } as Docker.ContainerInfo
        ];

        const result = groupContainersByComposeFile(containers);

        expect(result).toHaveLength(2);
        expect(result[0].path).toBe('/path/to/compose1.yml');
        expect(result[0].containers).toHaveLength(2);
        expect(result[1].path).toBe('/path/to/compose2.yml');
        expect(result[1].containers).toHaveLength(1);
    });

    it('should warn about containers without compose file label', () => {
        const containers: Docker.ContainerInfo[] = [
            {
                Names: ['/container1'],
                Labels: {}
            } as Docker.ContainerInfo,
            {
                Names: ['/container2'],
                Labels: {}
            } as Docker.ContainerInfo
        ];

        const result = groupContainersByComposeFile(containers);

        expect(result).toHaveLength(0);
        expect((baseLogger.warn as any)).toHaveBeenCalledWith(
            'Some containers have no compose file label',
            expect.objectContaining({ data: { count: 2, containerNames: 'container1, container2' } })
        );
    });

    it('should handle mixed containers with and without compose files', () => {
        const containers: Docker.ContainerInfo[] = [
            {
                Names: ['/container1'],
                Labels: {
                    'com.docker.compose.project.config_files': '/path/to/compose.yml'
                }
            } as Docker.ContainerInfo,
            {
                Names: ['/container2'],
                Labels: {}
            } as Docker.ContainerInfo
        ];

        const result = groupContainersByComposeFile(containers);

        expect(result).toHaveLength(1);
        expect(result[0].path).toBe('/path/to/compose.yml');
        expect((baseLogger.warn as any)).toHaveBeenCalledWith(
            'Some containers have no compose file label',
            expect.objectContaining({ data: { count: 1, containerNames: 'container2' } })
        );
    });
});

describe('Docker Provider - buildContainerManifest', () => {
    let mockDocker: any;

    beforeEach(() => {
        vi.spyOn(baseLogger, 'warn').mockImplementation(() => { });
        vi.spyOn(baseLogger, 'error').mockImplementation(() => { });
        vi.spyOn(baseLogger, 'info').mockImplementation(() => { });

        mockDocker = {
            listContainers: vi.fn().mockResolvedValue([])
        };
    });

    it('should return manifest and results', async () => {
        const { manifest, results } = await buildContainerManifest(mockDocker);

        expect(Array.isArray(manifest)).toBe(true);
        expect(typeof results).toBe('object');
    });

    it('should have correct result structure', async () => {
        const { results } = await buildContainerManifest(mockDocker);

        // Results should be organized by compose file path
        for (const [composePath, containerResults] of Object.entries(results)) {
            expect(typeof composePath).toBe('string');
            expect(typeof containerResults).toBe('object');

            // Each container should have a status string
            for (const [containerName, status] of Object.entries(containerResults)) {
                expect(typeof containerName).toBe('string');
                expect(typeof status).toBe('string');
            }
        }
    });
});
