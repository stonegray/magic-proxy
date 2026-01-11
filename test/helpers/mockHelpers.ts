/**
 * Test helpers for mocking configs, templates, and x-magic-proxy data
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MagicProxyConfigFile } from '../../src/types/config';
import { XMagicProxyData } from '../../src/types/xmagic';
import { HostEntry } from '../../src/types/host';
import { ComposeFileData } from '../../src/types/docker';

const RESOURCES_DIR = path.resolve(__dirname, '..', 'resources');

/**
 * Get the path to a template file in test resources
 */
export function getTemplatePath(templateName: string): string {
    return path.resolve(RESOURCES_DIR, 'templates', templateName);
}

/**
 * Get the path to a config file in test resources
 */
export function getConfigPath(configName: string): string {
    return path.resolve(RESOURCES_DIR, 'config', configName);
}

/**
 * Get the path to an x-magic-proxy file in test resources
 */
export function getXMagicProxyPath(filename: string): string {
    return path.resolve(RESOURCES_DIR, 'x-magic-proxy', filename);
}

/**
 * Create a mock template string for testing
 */
export function createMockTemplate(_name: string = 'default'): string {
    return `http:
  routers:
    magic-proxy-{{ app_name }}:
      rule: Host(\`{{ app_name }}.{{ hostname }}\`)
      service: magic-proxy-{{ app_name }}
      entryPoints:
        - web
  services:
    magic-proxy-{{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"`;
}

/**
 * Create a mock XMagicProxyData object
 */
export function createMockXMagicProxyData(overrides?: Partial<XMagicProxyData>): XMagicProxyData {
    return {
        template: 'default',
        target: 'http://localhost:3000',
        hostname: 'example.local',
        ...overrides,
    };
}

/**
 * Create a mock HostEntry for testing
 */
export function createMockHostEntry(overrides?: Partial<HostEntry>): HostEntry {
    return {
        containerName: 'test-app',
        xMagicProxy: createMockXMagicProxyData(),
        composeFilePath: '/tmp/docker-compose.yml',
        composeData: {} as ComposeFileData,
        lastChanged: Date.now(),
        state: {},
        ...overrides,
    };
}

/**
 * Create a mock config file
 */
export function createMockConfig(overrides?: Partial<MagicProxyConfigFile>): MagicProxyConfigFile {
    return {
        proxyBackend: 'traefik',
        traefik: {
            outputFile: 'traefik-magic.yml',
            templates: ['./template/example.yml'],
            ...overrides?.traefik,
        },
        api: { enabled: true, port: 8080 },
        ...overrides,
    };
}

/**
 * Low-level mock for fs read operations that resolves both configs and templates.
 * It matches by basename (with/without extension) and by short path segments (e.g. "template/default.yml")
 * so that configs referencing templates using relative paths will be resolved transparently.
 */
export function mockFS(options: { templates?: Record<string, string>; configs?: Record<string, string> } = {}) {
    const templates = options.templates || {};
    const configs = options.configs || {};

    // Normalize provided mappings into lookup maps keyed by multiple variants
    const lookup = new Map<string, string>();

    function addEntry(key: string, content: string, prefix?: string) {
        const base = path.basename(key);
        const baseNoExt = base.replace(/\.ya?ml$/i, '');
        const shortPath = prefix ? path.posix.join(prefix, base) : base;

        lookup.set(base, content);
        lookup.set(baseNoExt, content);
        lookup.set(base + '.yml', content);
        lookup.set(base + '.yaml', content);
        lookup.set(shortPath, content);
        lookup.set('./' + shortPath, content);
    }

    // add templates
    if (Object.keys(templates).length === 0) {
        addEntry('default.yml', createMockTemplate('default'));
    }
    for (const [k, v] of Object.entries(templates)) {
        // If user passed a bare name (default), allow flexibility
        addEntry(k, v, 'template');
    }

    // add configs
    for (const [k, v] of Object.entries(configs)) {
        addEntry(k, v, 'config');
    }

    // Map special default config key to the DEFAULT_CONFIG_FILE path so tests can mock
    // the app's default configuration (used by loadConfigFile() when called without a path)
    try {
        // Lazy import to avoid cycles during test startup
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DEFAULT_CONFIG_FILE } = require('../../src/config');
        // If user provided a config with the special key '__DEFAULT__', map it directly
        if (configs['__DEFAULT__']) {
            lookup.set(DEFAULT_CONFIG_FILE, configs['__DEFAULT__']);
            // also add variants
            lookup.set(path.resolve(DEFAULT_CONFIG_FILE), configs['__DEFAULT__']);
            lookup.set('./' + path.posix.join('config', path.basename(DEFAULT_CONFIG_FILE)), configs['__DEFAULT__']);
        }
        // If user provided a config whose basename matches DEFAULT_CONFIG_FILE, map it too
        const defaultBase = path.basename(DEFAULT_CONFIG_FILE);
        if (configs[defaultBase]) {
            lookup.set(DEFAULT_CONFIG_FILE, configs[defaultBase]);
            lookup.set(path.resolve(DEFAULT_CONFIG_FILE), configs[defaultBase]);
        }
    } catch {
        // ignore if config module can't be required in test environments
    }

    // The read implementation tries a few variants derived from the requested path
    function findContent(requestPath: string): string | undefined {
        const normalized = String(requestPath).replace(/\\/g, '/');
        const base = path.basename(normalized);
        const two = normalized.split('/').slice(-2).join('/');
        const three = normalized.split('/').slice(-3).join('/');
        const candidates = [normalized, base, base.replace(/\.ya?ml$/i, ''), two, three];

        for (const c of candidates) {
            if (!c) continue;
            if (lookup.has(c)) return lookup.get(c);
            // also try trimming leading './'
            const trimmed = c.replace(/^\.\//, '');
            if (lookup.has(trimmed)) return lookup.get(trimmed);
        }

        // If still not found, try to match /var/config/magic-proxy.yml to magic-proxy.yml
        // This handles the case where the app runs in Docker and uses /var/config paths
        // but tests provide mocks based on filename
        if (normalized.includes('/var/config/') || normalized.includes('/var/generated/')) {
            const fileName = path.basename(normalized);
            if (lookup.has(fileName)) return lookup.get(fileName);
        }

        return undefined;
    }

    const origReadFile = fs.promises.readFile.bind(fs.promises);
    const origReadFileSync = fs.readFileSync.bind(fs);

    const readMock = vi.spyOn(fs.promises, 'readFile').mockImplementation((filePath: any, encoding?: any) => {
        const content = findContent(String(filePath));
        if (content !== undefined) return Promise.resolve(content as any);
        // fallback to original implementation for non-mocked files
        return origReadFile(filePath, encoding);
    });

    // also mock readFileSync because some helpers use the synchronous API
    const readSyncMock = vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any, encoding?: any) => {
        const content = findContent(String(filePath));
        if (content !== undefined) return content as any;
        // fallback to original implementation for non-mocked files
        return origReadFileSync(filePath, encoding);
    });

    // Mock rename to avoid errors when testing atomic writes (rename of tmp file)
    const renameMock = vi.spyOn(fs.promises, 'rename').mockResolvedValue(undefined as any);

    return {
        readMock,
        readSyncMock,
        renameMock,
        cleanup: () => {
            readMock.mockRestore();
            readSyncMock.mockRestore();
            renameMock.mockRestore();
        },
    } as const;
}

/**
 * Mock fs.promises.writeFile for capturing file writes
 */
export function mockFileWrite(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);
}

/**
 * Setup FS mocks for both reading templates/configs and writing files
 */
export function setupFSMocks(templates: Record<string, string> = {}, configs: Record<string, string> = {}) {
    const { readMock, readSyncMock } = mockFS({ templates, configs });
    const writeMock = mockFileWrite();

    return {
        readMock,
        readSyncMock,
        writeMock,
        cleanup: () => {
            readMock.mockRestore();
            readSyncMock.mockRestore();
            writeMock.mockRestore();
        },
    } as const;
}

/**
 * Get written file content from writeFile spy
 */
export function getWrittenContent(writespy: ReturnType<typeof vi.spyOn>, index: number = 0): string {
    const calls = writespy.mock.calls as [string, string][];
    if (!calls[index]) {
        throw new Error(`No write call at index ${index}`);
    }
    return calls[index][1];
}

/**
 * Get written file path from writeFile spy
 */
export function getWrittenPath(writespy: ReturnType<typeof vi.spyOn>, index: number = 0): string {
    const calls = writespy.mock.calls as [string, string][];
    if (!calls[index]) {
        throw new Error(`No write call at index ${index}`);
    }
    return calls[index][0];
}
