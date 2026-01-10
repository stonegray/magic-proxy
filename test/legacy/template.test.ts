import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../src/backends/traefik/templateParser';
import { XMagicProxyData } from '../../src/types/xmagic';

describe('templateParser userData handling', () => {
    it('replaces userData placeholders', () => {
        const tmpl = 'Hello {{ app_name }} {{ color }} {{ target_url }}';
        const data: XMagicProxyData = { template: 'default', target: 'http://x', hostname: 'h', userData: { color: 'red' } };
        const out = renderTemplate(tmpl, 'app', data);
        expect(out).toContain('Hello app red http://x');
    });
});