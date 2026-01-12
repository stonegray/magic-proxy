import { describe, it, expect } from 'vitest';
import { validateGeneratedConfig } from '../../../src/backends/traefik/validators';
import { renderTemplate } from '../../../src/backends/traefik/templateParser';
import { XMagicProxyData } from '../../../src/types/xmagic';

describe('Template Validation', () => {
    describe('validateGeneratedConfig', () => {
        it('accepts valid http-only config', () => {
            const yaml = `
http:
  routers:
    my-app:
      rule: Host(\`example.com\`)
      service: my-service
  services:
    my-service:
      loadBalancer:
        servers:
          - url: "http://backend:3000"
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('accepts valid tcp-only config', () => {
            const yaml = `
tcp:
  routers:
    tcp-app:
      entryPoints:
        - tcp
      service: tcp-service
  services:
    tcp-service:
      loadBalancer:
        servers:
          - address: "backend:9000"
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('accepts valid udp-only config', () => {
            const yaml = `
udp:
  services:
    udp-service:
      loadBalancer:
        servers:
          - address: "backend:5353"
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('accepts valid mixed http/tcp/udp config', () => {
            const yaml = `
http:
  routers:
    http-app:
      rule: Host(\`example.com\`)
      service: http-service
  services:
    http-service:
      loadBalancer:
        servers:
          - url: "http://backend:3000"
tcp:
  routers:
    tcp-app:
      entryPoints:
        - tcp
      service: tcp-service
  services:
    tcp-service:
      loadBalancer:
        servers:
          - address: "backend:9000"
udp:
  services:
    udp-service:
      loadBalancer:
        servers:
          - address: "backend:5353"
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('accepts empty config', () => {
            const yaml = '';
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('rejects invalid YAML', () => {
            const yaml = `
http:
  routers:
    bad_indentation: value
      nested: bad
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
            expect(result.valid === false && result.error).toContain('Invalid YAML');
        });

        it('rejects non-object YAML', () => {
            const yaml = 'just a string';
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
        });

        it('rejects unexpected top-level keys', () => {
            const yaml = `
http:
  routers: {}
invalid_section:
  something: value
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
            expect(result.valid === false && result.error).toContain('Unexpected top-level key');
        });

        it('rejects unexpected keys in http section', () => {
            const yaml = `
http:
  routers:
    app: {}
  invalid_key: value
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
            expect(result.valid === false && result.error).toContain('Unexpected key under http');
        });

        it('rejects unexpected keys in tcp section', () => {
            const yaml = `
tcp:
  routers:
    app: {}
  middlewares: {}
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
            expect(result.valid === false && result.error).toContain('Unexpected key under tcp');
        });

        it('rejects unexpected keys in udp section', () => {
            const yaml = `
udp:
  services: {}
  routers: {}
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
            expect(result.valid === false && result.error).toContain('Unexpected key under udp');
        });

        it('rejects router/service names with whitespace', () => {
            const yaml = `
http:
  routers:
    "app with space":
      rule: Host(\`example.com\`)
      service: my-service
  services:
    my-service: {}
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
            expect(result.valid === false && result.error).toContain('Invalid name');
        });

        it('rejects router/service names with newlines', () => {
            // Note: YAML parsing will fail with invalid newline in key, so we expect YAML error
            const yaml = `
http:
  routers:
    app: {}
  services:
    "service
    name": {}
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
            // YAML parsing fails before we can check name validation
            expect(result.valid === false && result.error).toContain('Invalid YAML');
        });

        it('rejects empty router/service names', () => {
            const yaml = `
http:
  routers:
    "": {}
  services:
    my-service: {}
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(false);
            expect(result.valid === false && result.error).toContain('Invalid name');
        });

        it('no longer warns about unreplaced template variables - they error at render time', () => {
            // Unreplaced template variables are now caught by renderTemplate() before 
            // they reach the validator. This test verifies the validator doesn't see them.
            // If someone manually creates YAML with template markers (which shouldn't happen
            // through normal flow), they would still be allowed by the validator since
            // template syntax is valid in string values.
            const yaml = `
http:
  routers:
    app:
      rule: Host(\`app.example.com\`)
      service: my-service
  services:
    my-service: {}
  middlewares:
    test: "contains {{ app_name }} variable in a string"
`;
            const result = validateGeneratedConfig(yaml);
            // This should be valid - templates in string values are fine
            expect(result.valid).toBe(true);
        });

        it('accepts template syntax in string values without warnings', () => {
            // Template markers are valid in string values - they're just text
            const yaml = `
http:
  routers:
    app:
      rule: Host(\`example.com\`)
      service: my-service
  services:
    my-service: {}
  middlewares:
    documentation: "Use {{ variable }} syntax in templates"
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });
    });

    describe('Template rendering with validation', () => {
        it('renders template and passes validation', () => {
            const template = `
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
`;
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://backend:3000',
                hostname: 'example.com',
            };

            const rendered = renderTemplate(template, 'myapp', data);
            const validation = validateGeneratedConfig(rendered);

            expect(validation.valid).toBe(true);
            expect(rendered).toContain('myapp.example.com');
            expect(rendered).toContain('http://backend:3000');
        });

        it('validates rendered template has no unreplaced variables', () => {
            const template = `
http:
  routers:
    magic-proxy-{{ app_name }}:
      rule: Host(\`{{ app_name }}.{{ hostname }}\`)
      service: magic-proxy-{{ app_name }}
  services:
    magic-proxy-{{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`;
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://backend:3000',
                hostname: 'example.com',
            };

            const rendered = renderTemplate(template, 'app1', data);
            const validation = validateGeneratedConfig(rendered);

            expect(validation.valid).toBe(true);
        });

        it('validates complex template with multiple apps', () => {
            const template = `
http:
  routers:
    magic-proxy-{{ app_name }}:
      rule: Host(\`{{ hostname }}\`)
      service: magic-proxy-{{ app_name }}
  services:
    magic-proxy-{{ app_name }}:
      loadBalancer:
        servers:
          - url: "{{ target_url }}"
`;

            const renderAndValidate = (appName: string, target: string, hostname: string) => {
                const data: XMagicProxyData = {
                    template: 'default',
                    target,
                    hostname,
                };
                const rendered = renderTemplate(template, appName, data);
                return validateGeneratedConfig(rendered);
            };

            const result1 = renderAndValidate('app1', 'http://backend1:3000', 'app1.local');
            const result2 = renderAndValidate('app2', 'http://backend2:4000', 'app2.local');

            expect(result1.valid).toBe(true);
            expect(result2.valid).toBe(true);
        });

        it('rejects rendered template with invalid structure', () => {
            // This template has a structural issue after rendering
            const template = `
http:
  routers:
    app-{{ app_name }}: {{ bad_syntax }}
`;
            const data: XMagicProxyData = {
                template: 'default',
                target: 'http://backend:3000',
                hostname: 'example.com',
            };

            // renderTemplate will throw because of unknown variable
            expect(() => renderTemplate(template, 'app', data)).toThrow();
        });
    });

    describe('Template validation edge cases', () => {
        it('accepts valid router with complex rules', () => {
            const yaml = `
http:
  routers:
    complex-router:
      rule: Host(\`example.com\`) || Host(\`www.example.com\`)
      service: my-service
      middlewares:
        - my-middleware
  services:
    my-service:
      loadBalancer:
        servers:
          - url: "http://backend:3000"
  middlewares:
    my-middleware:
      redirectScheme:
        scheme: https
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('accepts valid service with multiple servers', () => {
            const yaml = `
http:
  services:
    my-service:
      loadBalancer:
        servers:
          - url: "http://backend1:3000"
          - url: "http://backend2:3000"
          - url: "http://backend3:3000"
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('accepts valid middleware definitions', () => {
            const yaml = `
http:
  middlewares:
    auth:
      basicAuth:
        users:
          - "admin:password"
    cors:
      headers:
        accessControlAllowOriginList:
          - "*"
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('handles router/service names with hyphens and underscores', () => {
            const yaml = `
http:
  routers:
    my-app_router:
      rule: Host(\`example.com\`)
      service: my_app-service
  services:
    my_app-service: {}
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });

        it('handles router/service names with numbers', () => {
            const yaml = `
http:
  routers:
    app123:
      rule: Host(\`example.com\`)
      service: service456
  services:
    service456: {}
`;
            const result = validateGeneratedConfig(yaml);
            expect(result.valid).toBe(true);
        });
    });
});
