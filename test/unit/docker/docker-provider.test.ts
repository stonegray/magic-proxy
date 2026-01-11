import { describe, it, expect, vi, beforeEach } from 'vitest';
import Docker from 'dockerode';
import {
    extractContainerName,
    validateXMagicProxy,
    extractXMagicProxy,
    groupContainersByComposeFile,
    buildContainerManifest,
    updateDatabaseFromManifest,
    ProcessingResult
} from '../../../src/providers/docker';
import { HostDB } from '../../../src/hostDb';
import { XMagicProxyData } from '../../../src/types/xmagic';
import { ComposeFileData } from '../../../src/types/docker';

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
        vi.spyOn(console, 'warn').mockImplementation(() => {});
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
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('missing required field "template"')
        );
    });

    it('should return false and warn when target is missing', () => {
        const xMagicProxy = {
            template: 'example.yml',
            hostname: 'example.com'
        } as Partial<XMagicProxyData>;

        const result = validateXMagicProxy(xMagicProxy, 'test-container');
        
        expect(result).toBe(false);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('missing required field "target"')
        );
    });

    it('should return false and warn when hostname is missing', () => {
        const xMagicProxy = {
            template: 'example.yml',
            target: 'http://localhost:3000'
        } as Partial<XMagicProxyData>;

        const result = validateXMagicProxy(xMagicProxy, 'test-container');
        
        expect(result).toBe(false);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('missing required field "hostname"')
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
            idle: '30m',
            auth: {
                type: 'oidc',
                provider: 'google',
                scopes: ['email', 'profile']
            },
            userData: { custom: 'data' }
        };

        const result = validateXMagicProxy(xMagicProxy, 'test-container');
        expect(result).toBe(true);
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
        vi.spyOn(console, 'warn').mockImplementation(() => {});
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
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('2 container(s) have no compose file label')
        );
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('container1, container2')
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
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('1 container(s) have no compose file label')
        );
    });
});

describe('Docker Provider - updateDatabaseFromManifest', () => {
    let hostDb: HostDB;

    beforeEach(() => {
        hostDb = new HostDB();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should have correct function signature', () => {
        expect(typeof updateDatabaseFromManifest).toBe('function');
        expect(updateDatabaseFromManifest.length).toBe(1);
    });

    it('should return ProcessingResult object', async () => {
        // This test verifies the return type structure
        const result = await updateDatabaseFromManifest(hostDb);
        
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
    });

    it('should log summary of processed containers', async () => {
        await updateDatabaseFromManifest(hostDb);
        
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('[Docker Provider] Processed')
        );
    });
});

describe('Docker Provider - buildContainerManifest', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should return manifest and results', async () => {
        const { manifest, results } = await buildContainerManifest();
        
        expect(Array.isArray(manifest)).toBe(true);
        expect(typeof results).toBe('object');
    });

    it('should have correct result structure', async () => {
        const { results } = await buildContainerManifest();
        
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
