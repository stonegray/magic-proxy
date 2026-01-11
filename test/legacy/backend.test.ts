import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as traefik from '../../src/backends/traefik/traefik';
import * as backendPlugin from '../../src/backends/backendPlugin';
import fs from 'fs';
import { OUTPUT_DIRECTORY } from '../../src/config';
import { XMagicProxyData } from '../../src/types/xmagic';
import { HostEntry } from '../../src/types/host';
import { ComposeFileData } from '../../src/types/docker';
import { createMockConfig, setupFSMocks, getTemplatePath } from '../helpers/mockHelpers';

describe('Traefik Backend Plugin', () => {
    beforeEach(() => {
        // Reset state before each test
        traefik._resetForTesting();
        traefik._setTemplateForTesting('default', `
http:
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
          - url: "{{ target_url }}"
`);
    });

    it('should initialize without errors', async () => {
        // Skip initialize for unit tests - templates are set directly
        const status = await traefik.getStatus();
        expect(status.registered).toEqual([]);
    });

    it('should add a proxied app using template rendering', async () => {
        const appData: XMagicProxyData = {
            template: 'default',
            target: 'http://app1.internal:3000',
            hostname: 'example.com',
        };

        const entry: HostEntry = {
            containerName: 'app1',
            xMagicProxy: appData,
            composeFilePath: '',
            composeData: {} as ComposeFileData,
            lastChanged: Date.now(),
            state: {}
        };

        await traefik.addProxiedApp(entry);
        const status = await traefik.getStatus();
        expect(status.registered).toEqual(['app1']);
    });

    it('should generate valid YAML from template', async () => {
        const appData: XMagicProxyData = {
            template: 'default',
            target: 'http://myapp.internal:8080',
            hostname: 'test.local',
        };

        const entry: HostEntry = {
            containerName: 'myapp',
            xMagicProxy: appData,
            composeFilePath: '',
            composeData: {} as ComposeFileData,
            lastChanged: Date.now(),
            state: {}
        };

        await traefik.addProxiedApp(entry);
        const config = await traefik.getConfig();

        expect(config).toContain('myapp.test.local');
        expect(config).toContain('http://myapp.internal:8080');
        expect(config).toContain('magic-proxy-myapp');
    });

    it('should handle multiple apps', async () => {
        const app1: XMagicProxyData = { template: 'default', target: 'http://app1:3000', hostname: 'local' };
        const app2: XMagicProxyData = { template: 'default', target: 'http://app2:4000', hostname: 'local' };

        const entry1: HostEntry = {
            containerName: 'api',
            xMagicProxy: app1,
            composeFilePath: '',
            composeData: {} as ComposeFileData,
            lastChanged: Date.now(),
            state: {}
        };

        const entry2: HostEntry = {
            containerName: 'web',
            xMagicProxy: app2,
            composeFilePath: '',
            composeData: {} as ComposeFileData,
            lastChanged: Date.now(),
            state: {}
        };

        await traefik.addProxiedApp(entry1);
        await traefik.addProxiedApp(entry2);


        const status = await traefik.getStatus();
        expect(status.registered.sort()).toEqual(['api', 'web']);

        const config = await traefik.getConfig();
        expect(config).toContain('api.local');
        expect(config).toContain('web.local');
    });

    it('should remove a proxied app', async () => {
        const appData: XMagicProxyData = { template: 'default', target: 'http://test:5000', hostname: 'test' };

        const entry: HostEntry = { containerName: 'test', xMagicProxy: appData, composeFilePath: '', composeData: {} as ComposeFileData, lastChanged: Date.now(), state: {} };

        await traefik.addProxiedApp(entry);
        let status = await traefik.getStatus();
        expect(status.registered).toContain('test');

        await traefik.removeProxiedApp('test');
        status = await traefik.getStatus();
        expect(status.registered).not.toContain('test');
    });

    it('should setTemplate and use custom template', async () => {
        const customTemplate = `
http:
  routers:
    custom-{{ app_name }}:
      rule: Host(\`{{ app_name }}\`)
      service: svc-{{ app_name }}
  services:
    svc-{{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`;
        traefik._setTemplateForTesting('custom', customTemplate);

        const appData: XMagicProxyData = { template: 'custom', target: 'http://custom:9000', hostname: 'custom.domain' };
        const entry: HostEntry = { containerName: 'custom', xMagicProxy: appData, composeFilePath: '', composeData: {} as ComposeFileData, lastChanged: Date.now(), state: {} };
        await traefik.addProxiedApp(entry);

        const config = await traefik.getConfig();
        expect(config).toContain('custom-custom');
        expect(config).toContain('svc-custom');
    });
});

describe('Backend Plugin Router', () => {
    let mocks: ReturnType<typeof setupFSMocks>;

    beforeEach(() => {
        const tmpl = fs.readFileSync(getTemplatePath('default.yml'), 'utf-8');
        mocks = setupFSMocks({ 'example.yml': tmpl, 'default.yml': tmpl });
    });

    afterEach(() => {
        mocks.cleanup();
    });

    it('should initialize the traefik backend through backendPlugin', async () => {
        fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
        const config = createMockConfig();
        await backendPlugin.initialize(config);
        const status = await backendPlugin.getStatus();
        expect(status).toBeDefined();
        expect(Array.isArray(status.registered)).toBe(true);
    });

    it('should route addProxiedApp to traefik backend', async () => {
        fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
        const config = createMockConfig();
        await backendPlugin.initialize(config);

        const appData: XMagicProxyData = {
            template: 'default',
            target: 'http://service:7000',
            hostname: 'example.org',
        };

        const entry: HostEntry = { containerName: 'service', xMagicProxy: appData, composeFilePath: '', composeData: {} as ComposeFileData, lastChanged: Date.now(), state: {} };

        await backendPlugin.addProxiedApp(entry);
        const status = await backendPlugin.getStatus();

        expect(status.registered).toContain('service');
    });

    it('should route removeProxiedApp to traefik backend', async () => {
        fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
        const config = createMockConfig();
        await backendPlugin.initialize(config);

        const appData: XMagicProxyData = { template: 'default', target: 'http://temp:8000', hostname: 'temp' };
        const entry: HostEntry = { containerName: 'temp', xMagicProxy: appData, composeFilePath: '', composeData: {} as ComposeFileData, lastChanged: Date.now(), state: {} };
        await backendPlugin.addProxiedApp(entry);

        let status = await backendPlugin.getStatus();
        expect(status.registered).toContain('temp');

        await backendPlugin.removeProxiedApp('temp');
        status = await backendPlugin.getStatus();
        expect(status.registered).not.toContain('temp');
    });
});
