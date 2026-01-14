import { describe, it, beforeEach, expect } from 'vitest';
import { renderTemplate, renderTemplateParsed } from '../../../src/backends/traefik/templateParser';
import * as traefik from '../../../src/backends/traefik/traefik';
import { XMagicProxyData } from '../../../src/types/xmagic';
import { HostEntry } from '../../../src/types/host';
import { ComposeFileData } from '../../../src/types/docker';

describe('Template Error Handling', () => {
    describe('renderTemplate', () => {
        it('throws error when unknown template variable is encountered', () => {
            const tmpl = 'Hello {{ app_name }} {{ unknown_var }} {{ target_url }}';
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://x',
                hostname: 'h',
            };

            expect(() => renderTemplate(tmpl, 'app', data)).toThrow(
                'Template contains unknown variables: unknown_var'
            );
        });

        it('throws error with all unknown variables when multiple are missing', () => {
            const tmpl = 'Host: {{ missing1 }} App: {{ app_name }} Var: {{ missing2 }}';
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://x',
                hostname: 'h',
            };

            expect(() => renderTemplate(tmpl, 'app', data)).toThrow(
                /Template contains unknown variables: (missing1, missing2|missing2, missing1)/
            );
        });

        it('throws error when duplicate unknown variables are encountered', () => {
            const tmpl = '{{ missing }} and {{ missing }} again';
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://x',
                hostname: 'h',
            };

            expect(() => renderTemplate(tmpl, 'app', data)).toThrow(
                'Template contains unknown variables: missing'
            );
        });

        it('throws error on invalid YAML after variable replacement', () => {
            const tmpl = `
key: {{ app_name }}
  bad_indentation: value
    more_bad: stuff
`;
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://x',
                hostname: 'h',
            };

            expect(() => renderTemplateParsed(tmpl, 'app', data)).toThrow(
                /Template produced invalid YAML/
            );
        });

        it('succeeds with valid template and all variables provided', () => {
            const tmpl = `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}-service
  services:
    {{ app_name }}-service:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`;
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://backend:8080',
                hostname: 'example.com',
            };

            const result = renderTemplate(tmpl, 'myapp', data);
            expect(result).toContain('app-myapp');
            expect(result).toContain('example.com');
            expect(result).toContain('http://backend:8080');
        });

        it('replaces core variables correctly', () => {
            const tmpl = `
app: {{ app_name }}
host: {{ hostname }}
target: {{ target_url }}
`;
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://myservice:3000',
                hostname: 'myhost.local',
            };

            const result = renderTemplate(tmpl, 'svc1', data);
            expect(result).toContain('svc1');
            expect(result).toContain('myhost.local');
            expect(result).toContain('http://myservice:3000');
        });

        it('replaces userData variables correctly', () => {
            const tmpl = `
config:
  color: {{ color }}
  size: {{ size }}
  app: {{ app_name }}
`;
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://x',
                hostname: 'h',
                userData: { color: 'blue', size: 'large' },
            };

            const result = renderTemplate(tmpl, 'app', data);
            expect(result).toContain('blue');
            expect(result).toContain('large');
            expect(result).toContain('app');
        });
    });

    describe('addProxiedApp with error handling', () => {
        beforeEach(() => {
            traefik._resetForTesting();
        });

        it('skips host when template has unknown variables', async () => {
            traefik._setTemplateForTesting('default', `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}-service
      port: {{ port }}
`);

            const appData: XMagicProxyData = {
                template: 'default',
                target: 'http://backend:8080',
                hostname: 'example.com',
                // missing 'port' in userData
            };

            const entry: HostEntry = {
                containerName: 'test-app',
                xMagicProxy: appData,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            await traefik.addProxiedApp(entry);
            const status = await traefik.getStatus();

            // Host should not be registered
            expect(status.registered).not.toContain('test-app');
        });

        it('skips host when template produces invalid YAML', async () => {
            traefik._setTemplateForTesting('invalid', `
http:
  routers:
    app: {{ app_name }}
  bad_indentation: value
    nested: thing
`);

            const appData: XMagicProxyData = {
                template: 'invalid',
                target: 'http://backend:8080',
                hostname: 'example.com',
            };

            const entry: HostEntry = {
                containerName: 'bad-yaml-app',
                xMagicProxy: appData,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            await traefik.addProxiedApp(entry);
            const status = await traefik.getStatus();

            // Host should not be registered
            expect(status.registered).not.toContain('bad-yaml-app');
        });

        it('registers host when template is valid and all variables are provided', async () => {
            traefik._setTemplateForTesting('valid', `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}-service
  services:
    {{ app_name }}-service:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`);

            const appData: XMagicProxyData = {
                template: 'valid',
                target: 'http://backend:8080',
                hostname: 'example.com',
            };

            const entry: HostEntry = {
                containerName: 'good-app',
                xMagicProxy: appData,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            await traefik.addProxiedApp(entry);
            const status = await traefik.getStatus();

            // Host should be registered
            expect(status.registered).toContain('good-app');
        });

        it('continues processing when one host fails', async () => {
            traefik._setTemplateForTesting('default', `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}-service
`);

            // First app - will fail (missing required variable)
            const badData: XMagicProxyData = {
                template: 'default',
                target: 'http://backend:8080',
                hostname: 'example.com',
                userData: { missing_var: 'value' },
            };

            const badEntry: HostEntry = {
                containerName: 'bad-app',
                xMagicProxy: badData,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            // Update template to require a variable not in the bad entry
            traefik._setTemplateForTesting('strict', `
http:
  routers:
    app-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: {{ app_name }}-service
      custom_port: {{ custom_port }}
`);

            const strictBadData: XMagicProxyData = {
                template: 'strict',
                target: 'http://backend:8080',
                hostname: 'example.com',
                // missing custom_port
            };

            const strictBadEntry: HostEntry = {
                containerName: 'bad-app',
                xMagicProxy: strictBadData,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            // Second app - will succeed
            const goodData: XMagicProxyData = {
                template: 'default',
                target: 'http://good:8080',
                hostname: 'example.com',
            };

            const goodEntry: HostEntry = {
                containerName: 'good-app',
                xMagicProxy: goodData,
                composeFilePath: '',
                composeData: {} as ComposeFileData,
                lastChanged: Date.now(),
                state: {},
            };

            await traefik.addProxiedApp(strictBadEntry);
            await traefik.addProxiedApp(goodEntry);

            const status = await traefik.getStatus();

            // Bad app should not be registered
            expect(status.registered).not.toContain('bad-app');
            // Good app should be registered
            expect(status.registered).toContain('good-app');
        });
    });
});
