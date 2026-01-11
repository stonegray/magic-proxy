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

    it('should extract x-magic-proxy for specific service by name', () => {
        const webProxy: XMagicProxyData = {
            template: 'web.yml',
            target: 'http://web:3000',
            hostname: 'web.example.com'
        };

        const apiProxy: XMagicProxyData = {
            template: 'api.yml',
            target: 'http://api:8080',
            hostname: 'api.example.com'
        };

        const composeData: ComposeFileData = {
            version: '3.8',
            services: {
                web: {
                    image: 'nginx',
                    'x-magic-proxy': webProxy
                },
                api: {
                    image: 'node',
                    'x-magic-proxy': apiProxy
                }
            }
        };

        // Should get specific service by name
        expect(extractXMagicProxy(composeData, 'web')).toEqual(webProxy);
        expect(extractXMagicProxy(composeData, 'api')).toEqual(apiProxy);
    });

    // REGRESSION: Service name provided but not found should return undefined
    // Previously it would fallback to first service's config
    it('should return undefined when service name is provided but not found (regression)', () => {
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
                }
            }
        };

        // Service 'nonexistent' doesn't exist - should NOT fallback to 'web'
        const result = extractXMagicProxy(composeData, 'nonexistent');
        expect(result).toBeUndefined();
    });

    // REGRESSION: Orphaned container scenario - service was removed from compose file
    it('should return undefined for orphaned container whose service was removed (regression)', () => {
        const composeData: ComposeFileData = {
            version: '3.8',
            services: {
                'new-service': {
                    image: 'nginx',
                    'x-magic-proxy': {
                        template: 'new.yml',
                        target: 'http://new:3000',
                        hostname: 'new.example.com'
                    }
                }
            }
        };

        // Container still has label 'old-service' but service was removed from compose
        const result = extractXMagicProxy(composeData, 'old-service');
        expect(result).toBeUndefined();
    });

    it('should use fallback only when no service name is provided', () => {
        const firstProxy: XMagicProxyData = {
            template: 'first.yml',
            target: 'http://first:3000',
            hostname: 'first.example.com'
        };

        const composeData: ComposeFileData = {
            version: '3.8',
            services: {
                first: {
                    image: 'nginx',
                    'x-magic-proxy': firstProxy
                },
                second: {
                    image: 'node'
                }
            }
        };

        // No service name - should fallback to first service with x-magic-proxy
        expect(extractXMagicProxy(composeData)).toEqual(firstProxy);
        // Empty string should also trigger fallback
        expect(extractXMagicProxy(composeData, '')).toEqual(firstProxy);
    });

    it('should return undefined when service exists but has no x-magic-proxy', () => {
        const composeData: ComposeFileData = {
            version: '3.8',
            services: {
                web: {
                    image: 'nginx'
                    // no x-magic-proxy
                },
                api: {
                    image: 'node',
                    'x-magic-proxy': {
                        template: 'api.yml',
                        target: 'http://api:8080',
                        hostname: 'api.example.com'
                    }
                }
            }
        };

        // Service exists but has no x-magic-proxy - should return undefined
        const result = extractXMagicProxy(composeData, 'web');
        expect(result).toBeUndefined();
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

// REGRESSION: Tests for orphaned container scenarios
describe('Docker Provider - Orphaned Container Handling (regression)', () => {
    beforeEach(() => {
        vi.spyOn(baseLogger, 'warn').mockImplementation(() => { });
        vi.spyOn(baseLogger, 'error').mockImplementation(() => { });
    });

    it('should not include orphaned containers in manifest when service removed from compose', () => {
        // This tests the extractXMagicProxy behavior that prevents orphaned containers
        // from "stealing" another service's config
        const composeData: ComposeFileData = {
            version: '3.8',
            services: {
                'current-service': {
                    image: 'nginx',
                    'x-magic-proxy': {
                        template: 'current.yml',
                        target: 'http://current:3000',
                        hostname: 'current.example.com'
                    }
                }
            }
        };

        // Orphaned container's service label points to removed service
        const orphanedResult = extractXMagicProxy(composeData, 'removed-service');
        expect(orphanedResult).toBeUndefined();

        // Current container still gets its config
        const currentResult = extractXMagicProxy(composeData, 'current-service');
        expect(currentResult).toBeDefined();
        expect(currentResult?.hostname).toBe('current.example.com');
    });

    it('should handle multiple services correctly without cross-contamination', () => {
        const composeData: ComposeFileData = {
            version: '3.8',
            services: {
                web: {
                    image: 'nginx',
                    'x-magic-proxy': {
                        template: 'web.yml',
                        target: 'http://web:80',
                        hostname: 'web.example.com'
                    }
                },
                api: {
                    image: 'node',
                    'x-magic-proxy': {
                        template: 'api.yml',
                        target: 'http://api:3000',
                        hostname: 'api.example.com'
                    }
                },
                db: {
                    image: 'postgres'
                    // No x-magic-proxy - internal service
                }
            }
        };

        // Each service gets its own config
        expect(extractXMagicProxy(composeData, 'web')?.hostname).toBe('web.example.com');
        expect(extractXMagicProxy(composeData, 'api')?.hostname).toBe('api.example.com');

        // Service without x-magic-proxy returns undefined
        expect(extractXMagicProxy(composeData, 'db')).toBeUndefined();

        // Non-existent service returns undefined (not another service's config)
        expect(extractXMagicProxy(composeData, 'removed')).toBeUndefined();
    });

    it('should validate containers correctly for edge cases', () => {
        // Missing required fields should fail validation
        expect(validateXMagicProxy({}, 'test')).toBe(false);
        expect(validateXMagicProxy({ template: 'x.yml' }, 'test')).toBe(false);
        expect(validateXMagicProxy({ template: 'x.yml', target: 'http://x' }, 'test')).toBe(false);

        // Complete config should pass
        expect(validateXMagicProxy({
            template: 'x.yml',
            target: 'http://localhost:3000',
            hostname: 'test.local'
        }, 'test')).toBe(true);
    });
});
