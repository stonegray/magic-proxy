import { describe, it, expect, beforeEach } from 'vitest';
import { renderTemplate } from '../../../src/backends/traefik/templateParser';
import * as traefik from '../../../src/backends/traefik/traefik';
import { XMagicProxyData } from '../../../src/types/xmagic';
import { HostEntry } from '../../../src/types/host';
import { ComposeFileData } from '../../../src/types/docker';

describe('User Data Template Substitution', () => {
    describe('userData in template rendering', () => {
        it('replaces single userData variable in template', () => {
            const template = `
config:
  port: {{ port }}
  app: {{ app_name }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: { port: '8080' },
            };

            const result = renderTemplate(template, 'myapp', data);
            expect(result).toContain('8080');
            expect(result).toContain('myapp');
        });

        it('replaces multiple userData variables in template', () => {
            const template = `
config:
  port: {{ port }}
  timeout: {{ timeout }}
  retries: {{ retries }}
  app: {{ app_name }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    port: '8080',
                    timeout: '30',
                    retries: '3',
                },
            };

            const result = renderTemplate(template, 'myapp', data);
            expect(result).toContain('8080');
            expect(result).toContain('30');
            expect(result).toContain('3');
        });

        it('throws error when userData variable is missing', () => {
            const template = `
config:
  port: {{ port }}
  app: {{ app_name }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                // missing port in userData
            };

            expect(() => renderTemplate(template, 'myapp', data)).toThrow('Template contains unknown variables: port');
        });

        it('handles userData with string values', () => {
            const template = `
config:
  protocol: {{ protocol }}
  environment: {{ env }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    protocol: 'https',
                    env: 'production',
                },
            };

            const result = renderTemplate(template, 'app', data);
            expect(result).toContain('https');
            expect(result).toContain('production');
        });

        it('handles userData with numeric values', () => {
            const template = `
config:
  port: {{ port }}
  workers: {{ workers }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    port: 8080,
                    workers: 4,
                },
            };

            const result = renderTemplate(template, 'app', data);
            expect(result).toContain('8080');
            expect(result).toContain('4');
        });

        it('handles userData with null values converted to empty strings', () => {
            const template = `
config:
  optional_setting: "{{ optional }}"
  app: {{ app_name }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    optional: null,
                },
            };

            const result = renderTemplate(template, 'app', data);
            // null should be converted to empty string, YAML output will have single quotes
            expect(result).toContain("optional_setting: ''");
        });

        it('core variables cannot be overwritten by userData', () => {
            const template = `
app: {{ app_name }}
host: {{ hostname }}
url: {{ target_url }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    app_name: 'should-be-ignored',
                    hostname: 'should-be-ignored.com',
                    target_url: 'http://should-be-ignored:9999',
                },
            };

            const result = renderTemplate(template, 'myapp', data);
            // Core variables should use actual values, not userData
            expect(result).toContain('myapp');
            expect(result).toContain('example.com');
            expect(result).toContain('http://backend:3000');
            expect(result).not.toContain('should-be-ignored');
        });

        it('rejects userData keys with invalid characters', () => {
            const template = `
config:
  value: {{ invalid_key }}
  other: {{ also_bad }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    'also-bad': 'value',
                },
            };

            // The userData key with hyphen won't match VALID_KEY_PATTERN (alphanumeric + underscore only)
            // So the template variable won't be replaced and will error
            expect(() => renderTemplate(template, 'app', data)).toThrow('Template contains unknown variables');
        });

        it('accepts userData keys with underscores', () => {
            const template = `
config:
  setting: {{ my_setting }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    my_setting: 'value123',
                },
            };

            const result = renderTemplate(template, 'app', data);
            expect(result).toContain('value123');
        });

        it('accepts userData keys with numbers', () => {
            const template = `
config:
  setting1: {{ setting1 }}
  setting2: {{ setting2 }}
  port3000: {{ port3000 }}
`;
            const data: XMagicProxyData = {
                template: 'test',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    setting1: 'val1',
                    setting2: 'val2',
                    port3000: '3000',
                },
            };

            const result = renderTemplate(template, 'app', data);
            expect(result).toContain('val1');
            expect(result).toContain('val2');
            expect(result).toContain('3000');
        });
    });

    describe('Complex template scenarios with userData', () => {
        it('uses userData in Traefik router configuration', () => {
            const template = `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: app-{{ app_name }}
      entryPoints:
        - {{ entrypoint }}
      middlewares:
        - {{ middleware }}
  services:
    app-{{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`;
            const data: XMagicProxyData = {
                template: 'custom',
                target: 'http://backend:3000',
                hostname: 'myapp.local',
                userData: {
                    entrypoint: 'websecure',
                    middleware: 'auth',
                },
            };

            const result = renderTemplate(template, 'myapp', data);
            expect(result).toContain('myapp.local');
            expect(result).toContain('http://backend:3000');
            expect(result).toContain('websecure');
            expect(result).toContain('auth');
        });

        it('uses userData for service port configuration', () => {
            const template = `
http:
  routers:
    api:
      rule: Host(\`api.example.com\`)
      service: api-backend
  services:
    api-backend:
      loadBalancer:
        servers:
          - url: "{{ target_url }}:{{ port }}"
`;
            const data: XMagicProxyData = {
                template: 'api',
                target: 'http://backend',
                hostname: 'api.example.com',
                userData: {
                    port: '8080',
                },
            };

            const result = renderTemplate(template, 'api', data);
            expect(result).toContain('http://backend:8080');
        });

        it('uses userData for environment-specific configuration', () => {
            const template = `
http:
  services:
    app:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
        healthCheck:
          path: {{ health_path }}
          interval: {{ health_interval }}
          timeout: {{ health_timeout }}
`;
            const data: XMagicProxyData = {
                template: 'health',
                target: 'http://backend:3000',
                hostname: 'example.com',
                userData: {
                    health_path: '/health',
                    health_interval: '10s',
                    health_timeout: '5s',
                },
            };

            const result = renderTemplate(template, 'app', data);
            expect(result).toContain('/health');
            expect(result).toContain('10s');
            expect(result).toContain('5s');
        });

        it('empty userData allows templates with only core variables', () => {
            const template = `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}
  services:
    {{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`;
            const data: XMagicProxyData = {
                template: 'basic',
                target: 'http://backend:3000',
                hostname: 'example.com',
                // No userData
            };

            const result = renderTemplate(template, 'myapp', data);
            expect(result).toContain('myapp');
            expect(result).toContain('example.com');
        });
    });

    describe('Integration with addProxiedApp', () => {
        beforeEach(() => {
            traefik._resetForTesting();
        });

        it('successfully adds app with userData substitution', async () => {
            traefik._setTemplateForTesting('custom', `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}
      entryPoints:
        - {{ entrypoint }}
  services:
    {{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`);

            const appData: XMagicProxyData = {
                template: 'custom',
                target: 'http://backend:3000',
                hostname: 'myapp.local',
                userData: {
                    entrypoint: 'web',
                },
            };

            const entry: HostEntry = {
                containerName: 'myapp',
                xMagicProxy: appData,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            await traefik.addProxiedApp(entry);
            const status = await traefik.getStatus();
            const config = await traefik.getConfig();

            expect(status.registered).toContain('myapp');
            expect(config).toContain('myapp.local');
            expect(config).toContain('http://backend:3000');
            expect(config).toContain('web');
        });

        it('skips app when userData variable is missing', async () => {
            traefik._setTemplateForTesting('custom', `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}
      entryPoints:
        - {{ entrypoint }}
  services:
    {{ app_name }}: {}
`);

            const appData: XMagicProxyData = {
                template: 'custom',
                target: 'http://backend:3000',
                hostname: 'myapp.local',
                // Missing required entrypoint
            };

            const entry: HostEntry = {
                containerName: 'myapp',
                xMagicProxy: appData,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            await traefik.addProxiedApp(entry);
            const status = await traefik.getStatus();

            // App should not be registered due to missing userData
            expect(status.registered).not.toContain('myapp');
        });

        it('multiple apps with different userData', async () => {
            traefik._setTemplateForTesting('custom', `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}
      entryPoints:
        - {{ entrypoint }}
  services:
    {{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`);

            const app1: XMagicProxyData = {
                template: 'custom',
                target: 'http://backend1:3000',
                hostname: 'app1.local',
                userData: { entrypoint: 'web' },
            };

            const app2: XMagicProxyData = {
                template: 'custom',
                target: 'http://backend2:4000',
                hostname: 'app2.local',
                userData: { entrypoint: 'websecure' },
            };

            const entry1: HostEntry = {
                containerName: 'app1',
                xMagicProxy: app1,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            const entry2: HostEntry = {
                containerName: 'app2',
                xMagicProxy: app2,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            await traefik.addProxiedApp(entry1);
            await traefik.addProxiedApp(entry2);

            const status = await traefik.getStatus();
            const config = await traefik.getConfig();

            expect(status.registered).toContain('app1');
            expect(status.registered).toContain('app2');
            expect(config).toContain('app1.local');
            expect(config).toContain('app2.local');
            expect(config).toContain('http://backend1:3000');
            expect(config).toContain('http://backend2:4000');
            expect(config).toContain('web');
            expect(config).toContain('websecure');
        });
    });
});
